(function () {
  'use strict';

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const MAX_HISTORY = 50;

  function storageNamespace(opts) {
    const raw = opts.namespace || window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || window.__STORAGE_NAMESPACE__ || window.__RUN_STORAGE_NAMESPACE__ || window.__ORG_BENCH_STORAGE_NAMESPACE__ || 'facebook-sheet';
    return String(raw).replace(/:+$/, '') + ':';
  }

  function colName(col) {
    let n = col + 1;
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function colIndex(name) {
    let n = 0;
    for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function refName(row, col) { return colName(col) + (row + 1); }
  function keyOf(row, col) { return row + ',' + col; }
  function parseRef(ref) {
    const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/i.exec(ref);
    if (!m) return null;
    return { absCol: !!m[1], col: colIndex(m[2].toUpperCase()), absRow: !!m[3], row: Number(m[4]) - 1 };
  }

  class SpreadsheetModel {
    constructor(opts) {
      opts = opts || {};
      this.rows = opts.rows || DEFAULT_ROWS;
      this.cols = opts.cols || DEFAULT_COLS;
      this.storageKey = storageNamespace(opts) + (opts.storageKey || 'state');
      this.cells = new Map();
      this.cache = new Map();
      this.errors = new Map();
      this.selection = { r1: 0, c1: 0, r2: 0, c2: 0, activeRow: 0, activeCol: 0 };
      this.undoStack = [];
      this.redoStack = [];
      if (!opts.skipLoad) this.load();
    }

    cloneCells() { return new Map(this.cells); }
    restoreCells(cells) { this.cells = new Map(cells); this.clearEval(); this.save(); }
    clearEval() { this.cache.clear(); this.errors.clear(); }
    inBounds(row, col) { return row >= 0 && col >= 0 && row < this.rows && col < this.cols; }
    getRaw(row, col) { return this.cells.get(keyOf(row, col)) || ''; }
    setRaw(row, col, value) {
      if (!this.inBounds(row, col)) return;
      const k = keyOf(row, col);
      if (value == null || value === '') this.cells.delete(k);
      else this.cells.set(k, String(value));
      this.clearEval();
      this.save();
    }
    displayValue(value) {
      if (value === true) return 'TRUE';
      if (value === false) return 'FALSE';
      if (value == null) return '';
      if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
      return String(value);
    }
    getDisplay(row, col) {
      const value = this.evaluateCell(row, col, []);
      return this.displayValue(value);
    }
    valueForContext(row, col, mode, stack) {
      const v = this.evaluateCell(row, col, stack);
      if (v === '') return mode === 'text' ? '' : 0;
      return v;
    }
    evaluateCell(row, col, stack) {
      if (!this.inBounds(row, col)) return '#REF!';
      const k = keyOf(row, col);
      if (this.cache.has(k)) return this.cache.get(k);
      if (stack.includes(k)) { this.cache.set(k, '#CIRC!'); return '#CIRC!'; }
      const raw = this.getRaw(row, col);
      let value = '';
      if (raw === '') value = '';
      else if (raw[0] === '=') value = this.evalFormula(raw.slice(1), row, col, stack.concat(k));
      else if (/^[-+]?\d+(\.\d+)?$/.test(raw.trim())) value = Number(raw);
      else value = raw;
      this.cache.set(k, value);
      return value;
    }
    evalFormula(expr, row, col, stack) {
      try {
        const parser = new FormulaParser(this, row, col, stack, expr);
        return parser.parse();
      } catch (e) {
        return e.message || '#ERR!';
      }
    }
    adjustFormulaForMove(raw, fromRow, fromCol, toRow, toCol) {
      if (!raw || raw[0] !== '=') return raw;
      const dr = toRow - fromRow;
      const dc = toCol - fromCol;
      return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (all, ac, letters, ar, digits) => {
        const oldCol = colIndex(letters.toUpperCase());
        const oldRow = Number(digits) - 1;
        const nextCol = ac ? oldCol : oldCol + dc;
        const nextRow = ar ? oldRow : oldRow + dr;
        if (nextRow < 0 || nextCol < 0 || nextRow >= this.rows || nextCol >= this.cols) return '#REF!';
        return ac + colName(nextCol) + ar + (nextRow + 1);
      });
    }
    shiftFormulasForInsert(type, index) {
      const re = /(\$?)([A-Z]+)(\$?)(\d+)/gi;
      for (const [k, raw] of Array.from(this.cells.entries())) {
        if (!raw.startsWith('=')) continue;
        this.cells.set(k, raw.replace(re, (all, ac, letters, ar, digits) => {
          let c = colIndex(letters.toUpperCase());
          let r = Number(digits) - 1;
          if (type === 'row' && r >= index) r++;
          if (type === 'col' && c >= index) c++;
          return ac + colName(c) + ar + (r + 1);
        }));
      }
    }
    shiftFormulasForDelete(type, index) {
      const re = /(\$?)([A-Z]+)(\$?)(\d+)/gi;
      for (const [k, raw] of Array.from(this.cells.entries())) {
        if (!raw.startsWith('=')) continue;
        this.cells.set(k, raw.replace(re, (all, ac, letters, ar, digits) => {
          let c = colIndex(letters.toUpperCase());
          let r = Number(digits) - 1;
          if ((type === 'row' && r === index) || (type === 'col' && c === index)) return '#REF!';
          if (type === 'row' && r > index) r--;
          if (type === 'col' && c > index) c--;
          return ac + colName(c) + ar + (r + 1);
        }));
      }
    }
    transact(fn) {
      const before = this.cloneCells();
      fn();
      const after = this.cloneCells();
      if (!mapsEqual(before, after)) {
        this.undoStack.push({ before, after });
        if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
        this.redoStack = [];
      }
      this.clearEval();
      this.save();
    }
    undo() {
      const item = this.undoStack.pop();
      if (!item) return false;
      this.restoreCells(item.before);
      this.redoStack.push(item);
      return true;
    }
    redo() {
      const item = this.redoStack.pop();
      if (!item) return false;
      this.restoreCells(item.after);
      this.undoStack.push(item);
      return true;
    }
    save() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({ rows: this.rows, cols: this.cols, cells: Array.from(this.cells.entries()), selection: this.selection }));
      } catch (e) {}
    }
    load() {
      try {
        const data = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
        if (!data) return;
        this.rows = Math.max(DEFAULT_ROWS, data.rows || DEFAULT_ROWS);
        this.cols = Math.max(DEFAULT_COLS, data.cols || DEFAULT_COLS);
        this.cells = new Map(data.cells || []);
        if (data.selection) this.selection = data.selection;
      } catch (e) {}
    }
    insertRow(row) {
      this.transact(() => {
        const next = new Map();
        for (const [k, v] of this.cells) {
          const [r, c] = k.split(',').map(Number);
          next.set(keyOf(r >= row ? r + 1 : r, c), v);
        }
        this.cells = next; this.rows++; this.shiftFormulasForInsert('row', row);
      });
    }
    deleteRow(row) {
      this.transact(() => {
        const next = new Map();
        for (const [k, v] of this.cells) {
          const [r, c] = k.split(',').map(Number);
          if (r === row) continue;
          next.set(keyOf(r > row ? r - 1 : r, c), v);
        }
        this.cells = next; this.rows = Math.max(1, this.rows - 1); this.shiftFormulasForDelete('row', row);
      });
    }
    insertCol(col) {
      this.transact(() => {
        const next = new Map();
        for (const [k, v] of this.cells) {
          const [r, c] = k.split(',').map(Number);
          next.set(keyOf(r, c >= col ? c + 1 : c), v);
        }
        this.cells = next; this.cols++; this.shiftFormulasForInsert('col', col);
      });
    }
    deleteCol(col) {
      this.transact(() => {
        const next = new Map();
        for (const [k, v] of this.cells) {
          const [r, c] = k.split(',').map(Number);
          if (c === col) continue;
          next.set(keyOf(r, c > col ? c - 1 : c), v);
        }
        this.cells = next; this.cols = Math.max(1, this.cols - 1); this.shiftFormulasForDelete('col', col);
      });
    }
  }

  function mapsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (b.get(k) !== v) return false;
    return true;
  }

  class FormulaParser {
    constructor(model, row, col, stack, text) { this.model = model; this.row = row; this.col = col; this.stack = stack; this.text = text; this.i = 0; }
    parse() { const v = this.compare(); this.ws(); if (this.i < this.text.length) throw new Error('#ERR!'); return v; }
    ws() { while (/\s/.test(this.text[this.i] || '')) this.i++; }
    eat(s) { this.ws(); if (this.text.slice(this.i, this.i + s.length).toUpperCase() === s) { this.i += s.length; return true; } return false; }
    compare() {
      let left = this.concat();
      this.ws();
      for (const op of ['>=', '<=', '<>', '>', '<', '=']) {
        if (this.text.slice(this.i, this.i + op.length) === op) {
          this.i += op.length;
          const right = this.concat();
          if (op === '=') return coerce(left) === coerce(right);
          if (op === '<>') return coerce(left) !== coerce(right);
          if (op === '>') return coerce(left) > coerce(right);
          if (op === '<') return coerce(left) < coerce(right);
          if (op === '>=') return coerce(left) >= coerce(right);
          if (op === '<=') return coerce(left) <= coerce(right);
        }
      }
      return left;
    }
    concat() { let v = this.add(); while (this.eat('&')) v = textOf(v) + textOf(this.add()); return v; }
    add() { let v = this.mul(); for (;;) { if (this.eat('+')) v = num(v) + num(this.mul()); else if (this.eat('-')) v = num(v) - num(this.mul()); else return v; } }
    mul() { let v = this.unary(); for (;;) { if (this.eat('*')) v = num(v) * num(this.unary()); else if (this.eat('/')) { const d = num(this.unary()); if (d === 0) throw new Error('#DIV/0!'); v = num(v) / d; } else return v; } }
    unary() { if (this.eat('-')) return -num(this.unary()); if (this.eat('+')) return num(this.unary()); return this.primary(); }
    primary() {
      this.ws();
      if (this.eat('(')) { const v = this.compare(); if (!this.eat(')')) throw new Error('#ERR!'); return v; }
      if (this.text[this.i] === '"') return this.string();
      const n = this.number(); if (n != null) return n;
      const ident = this.ident();
      if (!ident) throw new Error('#ERR!');
      const up = ident.toUpperCase();
      if (up === 'TRUE') return true;
      if (up === 'FALSE') return false;
      if (this.eat('(')) return this.fn(up);
      const ref = parseRef(ident);
      if (!ref || !this.model.inBounds(ref.row, ref.col)) throw new Error('#REF!');
      return this.model.valueForContext(ref.row, ref.col, 'number', this.stack);
    }
    string() { this.i++; let s = ''; while (this.i < this.text.length && this.text[this.i] !== '"') s += this.text[this.i++]; if (this.text[this.i] !== '"') throw new Error('#ERR!'); this.i++; return s; }
    number() { this.ws(); const m = /^\d+(\.\d+)?/.exec(this.text.slice(this.i)); if (!m) return null; this.i += m[0].length; return Number(m[0]); }
    ident() { this.ws(); const m = /^(\$?[A-Z]+\$?\d+|[A-Z_][A-Z0-9_]*)/i.exec(this.text.slice(this.i)); if (!m) return ''; this.i += m[0].length; return m[0]; }
    fn(name) {
      const args = [];
      this.ws();
      if (!this.eat(')')) {
        do { args.push(this.rangeOrExpr()); } while (this.eat(','));
        if (!this.eat(')')) throw new Error('#ERR!');
      }
      const flat = args.flat();
      if (name === 'SUM') return flat.reduce((a, b) => a + num(b), 0);
      if (name === 'AVERAGE') return flat.length ? flat.reduce((a, b) => a + num(b), 0) / flat.length : 0;
      if (name === 'MIN') return Math.min(...flat.map(num));
      if (name === 'MAX') return Math.max(...flat.map(num));
      if (name === 'COUNT') return flat.filter(v => v !== '' && typeof v === 'number' && !Number.isNaN(v)).length;
      if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
      if (name === 'AND') return flat.every(truthy);
      if (name === 'OR') return flat.some(truthy);
      if (name === 'NOT') return !truthy(args[0]);
      if (name === 'ABS') return Math.abs(num(args[0]));
      if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
      if (name === 'CONCAT') return flat.map(textOf).join('');
      throw new Error('#NAME?');
    }
    rangeOrExpr() {
      this.ws();
      const save = this.i;
      const a = this.ident();
      if (a && this.eat(':')) {
        const b = this.ident();
        const ra = parseRef(a), rb = parseRef(b);
        if (!ra || !rb) throw new Error('#REF!');
        const vals = [];
        for (let r = Math.min(ra.row, rb.row); r <= Math.max(ra.row, rb.row); r++) {
          for (let c = Math.min(ra.col, rb.col); c <= Math.max(ra.col, rb.col); c++) vals.push(this.model.getRaw(r, c) === '' ? '' : this.model.valueForContext(r, c, 'number', this.stack));
        }
        return vals;
      }
      this.i = save;
      return this.compare();
    }
  }

  function num(v) { if (typeof v === 'number') return v; if (v === true) return 1; if (v === false || v === '') return 0; const n = Number(v); if (Number.isNaN(n)) throw new Error('#VALUE!'); return n; }
  function textOf(v) { if (v === true) return 'TRUE'; if (v === false) return 'FALSE'; if (v == null) return ''; return String(v); }
  function truthy(v) { return v === true || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v !== '' && v !== 'FALSE'); }
  function coerce(v) { return typeof v === 'string' && /^[-+]?\d+(\.\d+)?$/.test(v) ? Number(v) : v; }

  window.SpreadsheetModel = SpreadsheetModel;

  if (!document.getElementById('grid')) return;

  const model = new SpreadsheetModel();
  const grid = document.getElementById('grid');
  const wrap = document.getElementById('sheetWrap');
  const formulaBar = document.getElementById('formulaBar');
  const nameBox = document.getElementById('nameBox');
  let editing = null;
  let dragAnchor = null;
  let clipboardSource = null;

  function normSel() {
    const s = model.selection;
    return { r1: Math.min(s.r1, s.r2), c1: Math.min(s.c1, s.c2), r2: Math.max(s.r1, s.r2), c2: Math.max(s.c1, s.c2), activeRow: s.activeRow, activeCol: s.activeCol };
  }
  function setSelection(row, col, extend) {
    row = Math.max(0, Math.min(model.rows - 1, row)); col = Math.max(0, Math.min(model.cols - 1, col));
    if (extend) { model.selection.r2 = row; model.selection.c2 = col; model.selection.activeRow = row; model.selection.activeCol = col; }
    else model.selection = { r1: row, c1: col, r2: row, c2: col, activeRow: row, activeCol: col };
    model.save(); renderSelection(); updateFormulaBar(); ensureVisible(row, col);
  }
  function render() {
    const head = ['<thead><tr><th class="corner"></th>'];
    for (let c = 0; c < model.cols; c++) head.push(`<th class="col-head" data-col="${c}">${colName(c)}</th>`);
    head.push('</tr></thead><tbody>');
    for (let r = 0; r < model.rows; r++) {
      head.push(`<tr><th class="row-head" data-row="${r}">${r + 1}</th>`);
      for (let c = 0; c < model.cols; c++) head.push(`<td data-row="${r}" data-col="${c}"></td>`);
      head.push('</tr>');
    }
    head.push('</tbody>');
    grid.innerHTML = head.join('');
    renderValues(); renderSelection(); updateFormulaBar();
  }
  function renderValues() {
    model.clearEval();
    grid.querySelectorAll('td').forEach(td => {
      const r = Number(td.dataset.row), c = Number(td.dataset.col);
      const raw = model.getRaw(r, c), display = model.getDisplay(r, c);
      td.textContent = display;
      td.classList.toggle('number', raw !== '' && !display.startsWith('#') && /^[-+]?\d+(\.\d+)?$/.test(display));
      td.classList.toggle('error', display.startsWith('#'));
    });
  }
  function renderSelection() {
    const s = normSel();
    nameBox.textContent = refName(s.activeRow, s.activeCol);
    grid.querySelectorAll('td').forEach(td => {
      const r = Number(td.dataset.row), c = Number(td.dataset.col);
      td.classList.toggle('range', r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2);
      td.classList.toggle('active', r === s.activeRow && c === s.activeCol && !editing);
    });
  }
  function updateFormulaBar() { formulaBar.value = model.getRaw(model.selection.activeRow, model.selection.activeCol); }
  function ensureVisible(row, col) { const td = cellEl(row, col); if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  function cellEl(row, col) { return grid.querySelector(`td[data-row="${row}"][data-col="${col}"]`); }
  function startEdit(seed, preserve) {
    if (editing) return;
    const row = model.selection.activeRow, col = model.selection.activeCol;
    const td = cellEl(row, col); if (!td) return;
    const before = model.getRaw(row, col);
    td.classList.add('editing'); td.classList.remove('active');
    td.innerHTML = `<input class="cell-editor" spellcheck="false">`;
    const input = td.firstChild;
    input.value = preserve ? before : seed;
    editing = { row, col, before, input };
    input.focus(); input.select();
    input.addEventListener('keydown', onEditorKey);
    input.addEventListener('blur', () => commitEdit(false));
  }
  function commitEdit(cancel, move) {
    if (!editing) return;
    const e = editing; editing = null;
    const value = cancel ? e.before : e.input.value;
    model.transact(() => model.setRaw(e.row, e.col, value));
    renderValues(); renderSelection(); updateFormulaBar();
    if (move === 'down') setSelection(e.row + 1, e.col);
    if (move === 'right') setSelection(e.row, e.col + 1);
    wrap.focus();
  }
  function onEditorKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(false, 'down'); }
    if (e.key === 'Tab') { e.preventDefault(); commitEdit(false, 'right'); }
    if (e.key === 'Escape') { e.preventDefault(); commitEdit(true); }
  }
  function clearSelection() {
    const s = normSel();
    model.transact(() => { for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) model.setRaw(r, c, ''); });
    renderValues(); renderSelection(); updateFormulaBar();
  }
  function serializeSelection(cut) {
    const s = normSel();
    const rows = [];
    for (let r = s.r1; r <= s.r2; r++) {
      const cols = [];
      for (let c = s.c1; c <= s.c2; c++) cols.push(model.getRaw(r, c));
      rows.push(cols.join('\t'));
    }
    clipboardSource = { range: s, cut };
    return rows.join('\n');
  }
  function pasteText(text) {
    const rows = text.replace(/\r/g, '').split('\n').filter((line, i, a) => line !== '' || i < a.length - 1).map(line => line.split('\t'));
    const startR = model.selection.activeRow, startC = model.selection.activeCol;
    model.transact(() => {
      rows.forEach((rowVals, rr) => rowVals.forEach((raw, cc) => {
        const tr = startR + rr, tc = startC + cc;
        if (!model.inBounds(tr, tc)) return;
        const src = clipboardSource && clipboardSource.range;
        const adjusted = raw.startsWith('=') ? model.adjustFormulaForMove(raw, src ? src.r1 + rr : startR, src ? src.c1 + cc : startC, tr, tc) : raw;
        model.setRaw(tr, tc, adjusted);
      }));
      if (clipboardSource && clipboardSource.cut) {
        const s = clipboardSource.range;
        for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) model.setRaw(r, c, '');
        clipboardSource = null;
      }
    });
    renderValues(); setSelection(startR, startC); renderSelection(); updateFormulaBar();
  }

  grid.addEventListener('mousedown', e => {
    const td = e.target.closest('td'); if (!td) return;
    const r = Number(td.dataset.row), c = Number(td.dataset.col);
    dragAnchor = { r, c }; setSelection(r, c, e.shiftKey); wrap.focus(); e.preventDefault();
  });
  grid.addEventListener('mouseover', e => {
    if (!dragAnchor || e.buttons !== 1) return;
    const td = e.target.closest('td'); if (!td) return;
    model.selection.r1 = dragAnchor.r; model.selection.c1 = dragAnchor.c; setSelection(Number(td.dataset.row), Number(td.dataset.col), true);
  });
  document.addEventListener('mouseup', () => { dragAnchor = null; });
  grid.addEventListener('dblclick', e => { const td = e.target.closest('td'); if (td) startEdit('', true); });

  wrap.addEventListener('keydown', e => {
    if (editing) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? model.redo() : model.undo(); renderValues(); renderSelection(); updateFormulaBar(); return; }
    if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); model.redo(); renderValues(); renderSelection(); updateFormulaBar(); return; }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault(); const d = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1] }[e.key]; setSelection(model.selection.activeRow + d[0], model.selection.activeCol + d[1], e.shiftKey); return;
    }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit('', true); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelection(); return; }
    if (!meta && e.key.length === 1) { e.preventDefault(); startEdit(e.key, false); }
  });
  wrap.addEventListener('copy', e => { e.clipboardData.setData('text/plain', serializeSelection(false)); e.preventDefault(); });
  wrap.addEventListener('cut', e => { e.clipboardData.setData('text/plain', serializeSelection(true)); e.preventDefault(); });
  wrap.addEventListener('paste', e => { pasteText(e.clipboardData.getData('text/plain')); e.preventDefault(); });

  formulaBar.addEventListener('focus', updateFormulaBar);
  formulaBar.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); model.transact(() => model.setRaw(model.selection.activeRow, model.selection.activeCol, formulaBar.value)); renderValues(); setSelection(model.selection.activeRow + 1, model.selection.activeCol); wrap.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); updateFormulaBar(); wrap.focus(); }
  });
  formulaBar.addEventListener('change', () => { model.transact(() => model.setRaw(model.selection.activeRow, model.selection.activeCol, formulaBar.value)); renderValues(); renderSelection(); });
  document.getElementById('insertRow').onclick = () => { model.insertRow(model.selection.activeRow); render(); };
  document.getElementById('deleteRow').onclick = () => { model.deleteRow(model.selection.activeRow); setSelection(Math.min(model.selection.activeRow, model.rows - 1), model.selection.activeCol); render(); };
  document.getElementById('insertCol').onclick = () => { model.insertCol(model.selection.activeCol); render(); };
  document.getElementById('deleteCol').onclick = () => { model.deleteCol(model.selection.activeCol); setSelection(model.selection.activeRow, Math.min(model.selection.activeCol, model.cols - 1)); render(); };

  render();
  wrap.focus();
})();
