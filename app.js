(function (global) {
  'use strict';

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const ERR = '#ERR!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';
  const DIV0 = '#DIV/0!';

  function colToName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      name = String.fromCharCode(65 + r) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function nameToCol(name) {
    let n = 0;
    for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function parseAddress(address) {
    const m = /^([A-Z]+)(\d+)$/.exec(address);
    if (!m) return null;
    return { col: nameToCol(m[1]), row: Number(m[2]) - 1 };
  }

  function makeAddress(row, col) {
    return `${colToName(col)}${row + 1}`;
  }

  function cellValue(raw) {
    if (raw === '') return '';
    if (/^(true|false)$/i.test(raw)) return raw.toUpperCase() === 'TRUE';
    if (!Number.isNaN(Number(raw)) && raw.trim() !== '') return Number(raw);
    return raw;
  }

  function formatValue(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    return value == null ? '' : String(value);
  }

  function isError(value) {
    return value && typeof value === 'object' && value.error;
  }

  function error(code) {
    return { error: code };
  }

  function toNumber(value) {
    if (isError(value)) return value;
    if (Array.isArray(value)) return toNumber(value[0]);
    if (value === '' || value == null) return 0;
    if (value === true) return 1;
    if (value === false) return 0;
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }

  function toText(value) {
    if (isError(value)) return value;
    if (Array.isArray(value)) return value.map(toText).join('');
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    return value == null ? '' : String(value);
  }

  function flatten(values) {
    return values.flatMap(v => Array.isArray(v) ? flatten(v) : [v]);
  }

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let out = '';
        i++;
        while (i < source.length && source[i] !== '"') out += source[i++];
        if (source[i] !== '"') throw new Error('string');
        i++;
        tokens.push({ type: 'string', value: out });
        continue;
      }
      const two = source.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/()&=<>:,$'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      const num = /^\d+(?:\.\d+)?/.exec(source.slice(i));
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const ident = /^[A-Za-z_]+/.exec(source.slice(i));
      if (ident) { tokens.push({ type: 'ident', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      throw new Error('token');
    }
    return tokens;
  }

  class Parser {
    constructor(source, model, stack) {
      this.tokens = tokenize(source);
      this.i = 0;
      this.model = model;
      this.stack = stack;
    }
    peek(value) { return this.tokens[this.i] && (value == null || this.tokens[this.i].value === value) ? this.tokens[this.i] : null; }
    take(value) { const t = this.peek(value); if (t) this.i++; return t; }
    expect(value) { if (!this.take(value)) throw new Error('expected ' + value); }
    parse() {
      const v = this.comparison();
      if (this.i !== this.tokens.length) throw new Error('tail');
      return v;
    }
    comparison() {
      let left = this.concat();
      const op = this.peek() && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value) ? this.take().value : null;
      if (!op) return left;
      const right = this.concat();
      if (isError(left)) return left;
      if (isError(right)) return right;
      const a = typeof left === 'number' && typeof right === 'number' ? left : toText(left);
      const b = typeof left === 'number' && typeof right === 'number' ? right : toText(right);
      if (op === '=') return a === b;
      if (op === '<>') return a !== b;
      if (op === '<') return a < b;
      if (op === '<=') return a <= b;
      if (op === '>') return a > b;
      return a >= b;
    }
    concat() {
      let left = this.add();
      while (this.take('&')) {
        const right = this.add();
        if (isError(left)) return left;
        if (isError(right)) return right;
        left = toText(left) + toText(right);
      }
      return left;
    }
    add() {
      let left = this.mul();
      while (this.peek('+') || this.peek('-')) {
        const op = this.take().value;
        const right = this.mul();
        left = this.numeric(left, right, op);
      }
      return left;
    }
    mul() {
      let left = this.unary();
      while (this.peek('*') || this.peek('/')) {
        const op = this.take().value;
        const right = this.unary();
        left = this.numeric(left, right, op);
      }
      return left;
    }
    unary() {
      if (this.take('-')) {
        const v = toNumber(this.unary());
        return isError(v) ? v : -v;
      }
      return this.primary();
    }
    primary() {
      const t = this.take();
      if (!t) throw new Error('empty');
      if (t.type === 'number' || t.type === 'string') return t.value;
      if (t.type === 'ident') {
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        if (this.peek('(')) return this.call(t.value);
        return this.refFromIdent(t.value);
      }
      if (t.value === '$') {
        const col = this.take();
        if (!col || col.type !== 'ident') throw new Error('ref');
        return this.refFromIdent(col.value);
      }
      if (t.value === '(') {
        const v = this.comparison();
        this.expect(')');
        return v;
      }
      throw new Error('primary');
    }
    call(name) {
      this.expect('(');
      const args = [];
      if (!this.peek(')')) {
        do { args.push(this.comparison()); } while (this.take(','));
      }
      this.expect(')');
      return this.functionValue(name, args);
    }
    refFromIdent(colName) {
      if (!/^[A-Z]+$/.test(colName)) throw new Error('ident');
      this.take('$');
      const row = this.take();
      if (!row || row.type !== 'number') throw new Error('ref');
      const start = { row: row.value - 1, col: nameToCol(colName) };
      if (this.take(':')) {
        this.take('$');
        const endCol = this.take();
        this.take('$');
        const endRow = this.take();
        if (!endCol || endCol.type !== 'ident' || !endRow || endRow.type !== 'number') throw new Error('range');
        return this.model.rangeValues(start, { row: endRow.value - 1, col: nameToCol(endCol.value) }, this.stack);
      }
      return this.model.evaluateCell(makeAddress(start.row, start.col), this.stack);
    }
    numeric(left, right, op) {
      const a = toNumber(left);
      const b = toNumber(right);
      if (isError(a)) return a;
      if (isError(b)) return b;
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (b === 0) return error(DIV0);
      return a / b;
    }
    functionValue(name, args) {
      const values = flatten(args);
      const firstError = values.find(isError);
      if (firstError) return firstError;
      const nums = values.map(toNumber).filter(v => !isError(v));
      switch (name) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVERAGE': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'MIN': return nums.length ? Math.min(...nums) : 0;
        case 'MAX': return nums.length ? Math.max(...nums) : 0;
        case 'COUNT': return values.filter(v => v !== '' && !Number.isNaN(Number(v))).length;
        case 'IF': return args[0] ? args[1] : args[2];
        case 'AND': return values.every(Boolean);
        case 'OR': return values.some(Boolean);
        case 'NOT': return !args[0];
        case 'ABS': return Math.abs(toNumber(args[0]));
        case 'ROUND': return Math.round(toNumber(args[0]));
        case 'CONCAT': return values.map(toText).join('');
        default: return error(ERR);
      }
    }
  }

  class SpreadsheetModel {
    constructor(options) {
      this.rows = options.rows || DEFAULT_ROWS;
      this.cols = options.cols || DEFAULT_COLS;
      this.storage = options.storage || null;
      this.cells = {};
      this.selection = { row: 0, col: 0, endRow: 0, endCol: 0 };
      this.undoStack = [];
      this.redoStack = [];
      if (this.storage) this.load();
    }
    getRaw(address) { return this.cells[address] || ''; }
    getDisplay(address) { return formatValue(this.evaluateCell(address, [])); }
    setCell(address, value) { this.applyChanges([{ address, value }]); }
    applyChanges(changes, options) {
      const normalized = changes.filter(c => this.getRaw(c.address) !== c.value);
      if (!normalized.length) return;
      const before = normalized.map(c => ({ address: c.address, value: this.getRaw(c.address) }));
      normalized.forEach(c => { if (c.value === '') delete this.cells[c.address]; else this.cells[c.address] = c.value; });
      if (!options || !options.silent) {
        this.undoStack.push({ before, after: normalized.map(c => ({ address: c.address, value: c.value })) });
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = [];
      }
      this.save();
    }
    restore(changes) { changes.forEach(c => { if (c.value === '') delete this.cells[c.address]; else this.cells[c.address] = c.value; }); this.save(); }
    undo() { const a = this.undoStack.pop(); if (!a) return false; this.restore(a.before); this.redoStack.push(a); return true; }
    redo() { const a = this.redoStack.pop(); if (!a) return false; this.restore(a.after); this.undoStack.push(a); return true; }
    evaluateCell(address, stack) {
      const pos = parseAddress(address);
      if (!pos || pos.row < 0 || pos.col < 0 || pos.row >= this.rows || pos.col >= this.cols) return error(REF);
      const raw = this.getRaw(address);
      if (!raw.startsWith('=')) return cellValue(raw);
      if (raw.includes(REF)) return error(REF);
      if (stack.includes(address)) return error(CIRC);
      try { return new Parser(raw.slice(1), this, stack.concat(address)).parse(); }
      catch (e) { return error(ERR); }
    }
    rangeValues(a, b, stack) {
      const out = [];
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(this.evaluateCell(makeAddress(r, c), stack));
      }
      return out;
    }
    setSelection(sel) { this.selection = sel; this.save(); }
    load() {
      try {
        const data = JSON.parse(this.storage.getItem('state') || '{}');
        this.cells = data.cells || {};
        this.selection = data.selection || this.selection;
        this.rows = data.rows || this.rows;
        this.cols = data.cols || this.cols;
      } catch (e) {}
    }
    save() {
      if (!this.storage) return;
      this.storage.setItem('state', JSON.stringify({ cells: this.cells, selection: this.selection, rows: this.rows, cols: this.cols }));
    }
    insertRow(index) { this.transformStructure('row', index, 1); this.rows++; }
    deleteRow(index) { this.transformStructure('row', index, -1); this.rows = Math.max(1, this.rows - 1); }
    insertCol(index) { this.transformStructure('col', index, 1); this.cols++; }
    deleteCol(index) { this.transformStructure('col', index, -1); this.cols = Math.max(1, this.cols - 1); }
    transformStructure(axis, index, delta) {
      const next = {};
      Object.entries(this.cells).forEach(([address, raw]) => {
        const p = parseAddress(address);
        if (!p) return;
        if (axis === 'row') {
          if (delta < 0 && p.row === index) return;
          if (p.row >= index) p.row += delta;
        } else {
          if (delta < 0 && p.col === index) return;
          if (p.col >= index) p.col += delta;
        }
        if (p.row >= 0 && p.col >= 0) next[makeAddress(p.row, p.col)] = transformFormulaForStructure(raw, axis, index, delta);
      });
      this.cells = next;
      this.undoStack = [];
      this.redoStack = [];
      this.save();
    }
  }

  function shiftFormulaReferences(formula, rowDelta, colDelta) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absCol, col, absRow, row) => {
      const nextCol = absCol ? nameToCol(col) : nameToCol(col) + colDelta;
      const nextRow = absRow ? Number(row) - 1 : Number(row) - 1 + rowDelta;
      if (nextCol < 0 || nextRow < 0) return REF;
      return `${absCol}${colToName(nextCol)}${absRow}${nextRow + 1}`;
    });
  }

  function transformFormulaForStructure(raw, axis, index, delta) {
    if (!raw.startsWith('=')) return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absCol, col, absRow, row) => {
      let c = nameToCol(col), r = Number(row) - 1;
      if (axis === 'row') {
        if (delta < 0 && r === index) return REF;
        if (r >= index) r += delta;
      } else {
        if (delta < 0 && c === index) return REF;
        if (c >= index) c += delta;
      }
      return `${absCol}${colToName(c)}${absRow}${r + 1}`;
    });
  }

  function storageAdapter() {
    if (!global.localStorage) return null;
    const ns = global.SPREADSHEET_STORAGE_NAMESPACE || global.__SPREADSHEET_STORAGE_NAMESPACE__ || global.__BENCHMARK_STORAGE_NAMESPACE__ || global.BENCHMARK_STORAGE_NAMESPACE || 'sheet';
    return { getItem: key => global.localStorage.getItem(`${ns}:${key}`), setItem: (key, value) => global.localStorage.setItem(`${ns}:${key}`, value) };
  }

  function initUi() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const formulaBar = document.getElementById('formulaBar');
    const cellName = document.getElementById('cellName');
    const menu = document.getElementById('contextMenu');
    const model = new SpreadsheetModel({ rows: DEFAULT_ROWS, cols: DEFAULT_COLS, storage: storageAdapter() });
    let editing = null;
    let drag = false;
    let copySource = null;
    let cutSource = null;

    function selectedRect() {
      const s = model.selection;
      return { r1: Math.min(s.row, s.endRow), c1: Math.min(s.col, s.endCol), r2: Math.max(s.row, s.endRow), c2: Math.max(s.col, s.endCol) };
    }
    function render() {
      grid.style.setProperty('--rows', model.rows);
      grid.style.setProperty('--cols', model.cols);
      grid.innerHTML = '<div class="corner" title="Right-click row or column headers for insert/delete"></div>';
      for (let c = 0; c < model.cols; c++) grid.append(header('col-header', colToName(c), c));
      const rect = selectedRect();
      for (let r = 0; r < model.rows; r++) {
        grid.append(header('row-header', String(r + 1), r));
        for (let c = 0; c < model.cols; c++) {
          const address = makeAddress(r, c);
          const raw = model.getRaw(address);
          const display = model.getDisplay(address);
          const div = document.createElement('div');
          div.className = 'cell';
          div.dataset.row = r; div.dataset.col = c; div.dataset.address = address;
          div.setAttribute('role', 'gridcell');
          div.textContent = display;
          if (display.startsWith('#')) div.classList.add('error');
          else if (display === 'TRUE' || display === 'FALSE') div.classList.add('boolean');
          else if (raw !== '' && !Number.isNaN(Number(display))) div.classList.add('number');
          if (r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2) div.classList.add('in-range');
          if (r === model.selection.row && c === model.selection.col) div.classList.add('active');
          div.addEventListener('mousedown', e => beginSelect(e, r, c));
          div.addEventListener('mouseenter', () => { if (drag) extendSelect(r, c); });
          div.addEventListener('dblclick', () => startEdit(r, c, false));
          grid.append(div);
        }
      }
      const active = makeAddress(model.selection.row, model.selection.col);
      cellName.textContent = active;
      if (document.activeElement !== formulaBar) formulaBar.value = model.getRaw(active);
      document.getElementById('undoBtn').disabled = !model.undoStack.length;
      document.getElementById('redoBtn').disabled = !model.redoStack.length;
    }
    function header(cls, text, index) {
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = text;
      div.title = 'Right-click to insert or delete';
      div.addEventListener('contextmenu', e => showMenu(e, cls.startsWith('row') ? 'row' : 'col', index));
      return div;
    }
    function select(row, col, extend) {
      row = Math.max(0, Math.min(model.rows - 1, row));
      col = Math.max(0, Math.min(model.cols - 1, col));
      const s = extend ? { row: model.selection.row, col: model.selection.col, endRow: row, endCol: col } : { row, col, endRow: row, endCol: col };
      model.setSelection(s); render();
    }
    function beginSelect(e, row, col) { hideMenu(); drag = true; select(row, col, e.shiftKey); document.addEventListener('mouseup', () => drag = false, { once: true }); }
    function extendSelect(row, col) { select(row, col, true); }
    function startEdit(row, col, replace, first) {
      select(row, col, false);
      const cell = grid.querySelector(`[data-address="${makeAddress(row, col)}"]`);
      editing = { row, col, original: model.getRaw(makeAddress(row, col)) };
      cell.contentEditable = 'true';
      cell.classList.add('editing');
      cell.textContent = replace ? (first || '') : editing.original;
      cell.focus();
      document.execCommand('selectAll', false, null);
    }
    function commitEdit(move) {
      if (!editing) return;
      const address = makeAddress(editing.row, editing.col);
      const cell = grid.querySelector(`[data-address="${address}"]`);
      model.setCell(address, cell.textContent);
      editing = null;
      render();
      if (move === 'down') select(model.selection.row + 1, model.selection.col, false);
      if (move === 'right') select(model.selection.row, model.selection.col + 1, false);
    }
    function cancelEdit() { if (!editing) return; model.applyChanges([{ address: makeAddress(editing.row, editing.col), value: editing.original }], { silent: true }); editing = null; render(); }
    function clearRange() {
      const rect = selectedRect(), changes = [];
      for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) changes.push({ address: makeAddress(r, c), value: '' });
      model.applyChanges(changes); render();
    }
    function copyText(cut) {
      const rect = selectedRect(), rows = [];
      for (let r = rect.r1; r <= rect.r2; r++) {
        const cols = [];
        for (let c = rect.c1; c <= rect.c2; c++) cols.push(model.getRaw(makeAddress(r, c)));
        rows.push(cols.join('\t'));
      }
      copySource = rect;
      cutSource = cut ? rect : null;
      return rows.join('\n');
    }
    function pasteText(text) {
      const rows = text.replace(/\r/g, '').split('\n').map(r => r.split('\t'));
      const changes = [];
      rows.forEach((row, rr) => row.forEach((value, cc) => {
        const targetRow = model.selection.row + rr, targetCol = model.selection.col + cc;
        if (targetRow >= model.rows || targetCol >= model.cols) return;
        const source = cutSource || copySource;
        if (value.startsWith('=') && source) value = shiftFormulaReferences(value, targetRow - source.r1, targetCol - source.c1);
        changes.push({ address: makeAddress(targetRow, targetCol), value });
      }));
      if (cutSource) for (let r = cutSource.r1; r <= cutSource.r2; r++) for (let c = cutSource.c1; c <= cutSource.c2; c++) changes.push({ address: makeAddress(r, c), value: '' });
      copySource = null;
      cutSource = null;
      model.applyChanges(changes); render();
    }
    function showMenu(e, axis, index) {
      e.preventDefault();
      menu.innerHTML = '';
      const labels = axis === 'row' ? [['Insert row above', () => model.insertRow(index)], ['Insert row below', () => model.insertRow(index + 1)], ['Delete row', () => model.deleteRow(index)]] : [['Insert column left', () => model.insertCol(index)], ['Insert column right', () => model.insertCol(index + 1)], ['Delete column', () => model.deleteCol(index)]];
      labels.forEach(([label, action]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { action(); hideMenu(); render(); }; menu.append(b); });
      menu.hidden = false; menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
    }
    function hideMenu() { menu.hidden = true; }

    document.addEventListener('click', hideMenu);
    document.addEventListener('keydown', e => {
      if (document.activeElement === formulaBar) return;
      if (editing) {
        if (e.key === 'Enter') { e.preventDefault(); commitEdit('down'); }
        if (e.key === 'Tab') { e.preventDefault(); commitEdit('right'); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? model.redo() : model.undo(); render(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); model.redo(); render(); return; }
      if (mod && e.key.toLowerCase() === 'x') { navigator.clipboard && navigator.clipboard.writeText(copyText(true)); clearRange(); return; }
      if (mod && e.key.toLowerCase() === 'c') { navigator.clipboard && navigator.clipboard.writeText(copyText(false)); return; }
      if (mod && e.key.toLowerCase() === 'v') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearRange(); return; }
      if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); startEdit(model.selection.row, model.selection.col, false); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
        select((e.shiftKey ? model.selection.endRow : model.selection.row) + d[0], (e.shiftKey ? model.selection.endCol : model.selection.col) + d[1], e.shiftKey);
        return;
      }
      if (e.key.length === 1 && !mod) { e.preventDefault(); startEdit(model.selection.row, model.selection.col, true, e.key); }
    });
    document.addEventListener('copy', e => { e.clipboardData.setData('text/plain', copyText(false)); e.preventDefault(); });
    document.addEventListener('cut', e => { e.clipboardData.setData('text/plain', copyText(true)); clearRange(); e.preventDefault(); });
    document.addEventListener('paste', e => { pasteText(e.clipboardData.getData('text/plain')); e.preventDefault(); });
    formulaBar.addEventListener('input', () => { model.setCell(makeAddress(model.selection.row, model.selection.col), formulaBar.value); render(); formulaBar.focus(); });
    document.getElementById('undoBtn').onclick = () => { model.undo(); render(); };
    document.getElementById('redoBtn').onclick = () => { model.redo(); render(); };
    render();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { SpreadsheetModel, shiftFormulaReferences, colToName, nameToCol };
  if (global.document) global.addEventListener('DOMContentLoaded', initUi);
})(typeof window !== 'undefined' ? window : globalThis);
