(function () {
  'use strict';

  const ERR = { CIRC: '#CIRC!', DIV: '#DIV/0!', REF: '#REF!', BAD: '#ERR!' };

  function colName(col) {
    let s = '';
    for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }
  function colIndex(name) { let n = 0; for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
  function addr(row, col) { return colName(col) + (row + 1); }
  function key(row, col) { return row + ',' + col; }
  function parseAddr(text) {
    const m = /^([A-Z]+)(\d+)$/.exec(text);
    return m ? { row: Number(m[2]) - 1, col: colIndex(m[1]) } : null;
  }
  function flatten(v) { return Array.isArray(v) ? v.flatMap(flatten) : [v]; }
  function num(v) { if (v === true) return 1; if (v === false || v === '') return 0; const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function truth(v) { return Array.isArray(v) ? v.some(truth) : !!(typeof v === 'number' ? v : String(v).toUpperCase() === 'TRUE' || (v && v !== '0')); }
  function display(v) {
    if (v && v.error) return v.error;
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
    return v == null ? '' : String(v);
  }

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') { let j = ++i, s = ''; while (j < src.length && src[j] !== '"') s += src[j++]; out.push({ t: 'str', v: s }); i = j + 1; continue; }
      const two = src.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/()&,=:<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
      const n = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      if (n) { out.push({ t: 'num', v: Number(n[0]) }); i += n[0].length; continue; }
      const id = /^\$?[A-Za-z]+\$?\d+|[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      if (id) { out.push({ t: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
      throw new Error(ERR.BAD);
    }
    return out;
  }

  class Parser {
    constructor(sheet, src, stack) { this.sheet = sheet; this.ts = tokenize(src); this.i = 0; this.stack = stack; }
    peek(v) { const t = this.ts[this.i]; return t && (v == null || t.v === v); }
    take(v) { if (this.peek(v)) return this.ts[this.i++]; return null; }
    need(v) { const t = this.take(v); if (!t) throw new Error(ERR.BAD); return t; }
    parse() { const v = this.compare(); if (this.i !== this.ts.length) throw new Error(ERR.BAD); return v; }
    compare() { let a = this.concat(); while (this.peek() && ['=', '<>', '<', '<=', '>', '>='].includes(this.ts[this.i].v)) { const op = this.ts[this.i++].v, b = this.concat(); const x = num(a), y = num(b); a = op === '=' ? display(a) === display(b) : op === '<>' ? display(a) !== display(b) : op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y; } return a; }
    concat() { let a = this.add(); while (this.take('&')) a = display(a) + display(this.add()); return a; }
    add() { let a = this.mul(); while (this.peek('+') || this.peek('-')) { const op = this.ts[this.i++].v, b = this.mul(); a = op === '+' ? num(a) + num(b) : num(a) - num(b); } return a; }
    mul() { let a = this.unary(); while (this.peek('*') || this.peek('/')) { const op = this.ts[this.i++].v, b = this.unary(); if (op === '/' && num(b) === 0) throw new Error(ERR.DIV); a = op === '*' ? num(a) * num(b) : num(a) / num(b); } return a; }
    unary() { if (this.take('-')) return -num(this.unary()); if (this.take('+')) return num(this.unary()); return this.primary(); }
    primary() {
      if (this.take('(')) { const v = this.compare(); this.need(')'); return v; }
      const t = this.ts[this.i++]; if (!t) throw new Error(ERR.BAD);
      if (t.t === 'num' || t.t === 'str') return t.v;
      if (t.t !== 'id') throw new Error(ERR.BAD);
      if (t.v === 'TRUE') return true; if (t.v === 'FALSE') return false;
      if (this.peek('(')) return this.call(t.v);
      const ref = parseRef(t.v); if (!ref) throw new Error(ERR.BAD);
      if (this.take(':')) { const endTok = this.ts[this.i++], end = endTok && parseRef(endTok.v); if (!end) throw new Error(ERR.REF); return this.sheet.rangeValues(ref, end, this.stack); }
      return this.sheet.valueAt(ref.row, ref.col, this.stack);
    }
    call(name) {
      this.need('('); const args = [];
      if (!this.peek(')')) do args.push(this.compare()); while (this.take(','));
      this.need(')'); const vals = flatten(args).filter(v => !(v && v.error)); const nums = vals.map(num);
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min.apply(null, nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max.apply(null, nums) : 0;
      if (name === 'COUNT') return vals.filter(v => Number.isFinite(Number(v))).length;
      if (name === 'IF') return truth(args[0]) ? args[1] : args[2];
      if (name === 'AND') return vals.every(truth);
      if (name === 'OR') return vals.some(truth);
      if (name === 'NOT') return !truth(args[0]);
      if (name === 'ABS') return Math.abs(num(args[0]));
      if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
      if (name === 'CONCAT') return vals.map(display).join('');
      throw new Error(ERR.BAD);
    }
  }

  function parseRef(text) { const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(text); return m ? { colAbs: !!m[1], col: colIndex(m[2]), rowAbs: !!m[3], row: Number(m[4]) - 1 } : null; }
  function adjustFormula(formula, dRow, dCol) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (all, ca, c, ra, r) => {
      const nc = ca ? colIndex(c) : colIndex(c) + dCol;
      const nr = ra ? Number(r) - 1 : Number(r) - 1 + dRow;
      return nc < 0 || nr < 0 ? '#REF!' : ca + colName(nc) + ra + (nr + 1);
    });
  }
  function shiftFormulaRows(formula, rowIndex, delta, deleted) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (all, ca, c, ra, r) => {
      const row = Number(r) - 1;
      if (deleted && row === rowIndex) return '#REF!';
      const nr = row >= rowIndex ? row + delta : row;
      return nr < 0 ? '#REF!' : ca + c + ra + (nr + 1);
    });
  }
  function shiftFormulaCols(formula, colIndexValue, delta, deleted) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (all, ca, c, ra, r) => {
      const col = colIndex(c);
      if (deleted && col === colIndexValue) return '#REF!';
      const nc = col >= colIndexValue ? col + delta : col;
      return nc < 0 ? '#REF!' : ca + colName(nc) + ra + r;
    });
  }

  class SpreadsheetCore {
    constructor(rows, cols) { this.rows = rows; this.cols = cols; this.cells = {}; }
    getRaw(row, col) { return this.cells[key(row, col)] || ''; }
    setCell(row, col, raw) { if (raw == null || raw === '') delete this.cells[key(row, col)]; else this.cells[key(row, col)] = String(raw); }
    getDisplay(row, col) { return display(this.valueAt(row, col, new Set())); }
    isNumericDisplay(row, col) { const raw = this.getRaw(row, col), v = this.getDisplay(row, col); return raw !== '' && v !== '' && !v.startsWith('#') && Number.isFinite(Number(v)); }
    valueAt(row, col, stack) {
      if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return { error: ERR.REF };
      const k = key(row, col); if (stack.has(k)) return { error: ERR.CIRC };
      const raw = this.getRaw(row, col); if (!raw) return '';
      if (raw[0] !== '=') { const n = Number(raw); return raw.trim() !== '' && Number.isFinite(n) ? n : raw; }
      stack.add(k);
      try { const v = new Parser(this, raw.slice(1), stack).parse(); stack.delete(k); return v && v.error ? v : v; }
      catch (e) { stack.delete(k); return { error: e.message === ERR.DIV || e.message === ERR.CIRC || e.message === ERR.REF ? e.message : ERR.BAD }; }
    }
    rangeValues(a, b, stack) { const out = []; for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(this.valueAt(r, c, new Set(stack))); return out; }
    copyBlock(r1, c1, r2, c2) { const block = []; for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push({ raw: this.getRaw(r, c), row: r, col: c }); block.push(row); } return block; }
    pasteBlock(row, col, block) { block.forEach((line, rr) => line.forEach((cell, cc) => { const raw = cell.raw && cell.raw[0] === '=' ? adjustFormula(cell.raw, row + rr - cell.row, col + cc - cell.col) : cell.raw; this.setCell(row + rr, col + cc, raw); })); }
    insertRow(row) { const next = {}; Object.keys(this.cells).forEach(k => { const [r, c] = k.split(',').map(Number); next[key(r >= row ? r + 1 : r, c)] = this.cells[k]; }); this.rows++; this.cells = next; this.rewrite(f => shiftFormulaRows(f, row, 1, false)); }
    deleteRow(row) { const next = {}; Object.keys(this.cells).forEach(k => { const [r, c] = k.split(',').map(Number); if (r !== row) next[key(r > row ? r - 1 : r, c)] = this.cells[k]; }); this.rows--; this.cells = next; this.rewrite(f => shiftFormulaRows(f, row, -1, true)); }
    insertCol(col) { const next = {}; Object.keys(this.cells).forEach(k => { const [r, c] = k.split(',').map(Number); next[key(r, c >= col ? c + 1 : c)] = this.cells[k]; }); this.cols++; this.cells = next; this.rewrite(f => shiftFormulaCols(f, col, 1, false)); }
    deleteCol(col) { const next = {}; Object.keys(this.cells).forEach(k => { const [r, c] = k.split(',').map(Number); if (c !== col) next[key(r, c > col ? c - 1 : c)] = this.cells[k]; }); this.cols--; this.cells = next; this.rewrite(f => shiftFormulaCols(f, col, -1, true)); }
    rewrite(fn) { Object.keys(this.cells).forEach(k => { if (this.cells[k][0] === '=') this.cells[k] = fn(this.cells[k]); }); }
    snapshot() { return JSON.stringify({ rows: this.rows, cols: this.cols, cells: this.cells }); }
    restore(s) { const data = JSON.parse(s); this.rows = data.rows; this.cols = data.cols; this.cells = data.cells || {}; }
  }

  window.SpreadsheetCore = SpreadsheetCore;
  window.SpreadsheetUtils = { colName, addr, adjustFormula };

  if (!window.document) return;

  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__BENCH_STORAGE_NAMESPACE__ || 'quicksheet:';
  const storageKey = ns + ':state';
  const sheet = new SpreadsheetCore(100, 26);
  const grid = document.getElementById('grid'), wrap = document.getElementById('grid-wrap'), bar = document.getElementById('formula-bar'), nameBox = document.getElementById('name-box');
  let active = { row: 0, col: 0 }, anchor = { row: 0, col: 0 }, editing = null, undo = [], redo = [], copiedBlock = null, dragging = false;

  function selection() { return { r1: Math.min(anchor.row, active.row), c1: Math.min(anchor.col, active.col), r2: Math.max(anchor.row, active.row), c2: Math.max(anchor.col, active.col) }; }
  function save() { localStorage.setItem(storageKey, JSON.stringify({ sheet: sheet.snapshot(), active, anchor })); }
  function pushHistory() { undo.push(JSON.stringify({ sheet: sheet.snapshot(), active, anchor })); if (undo.length > 50) undo.shift(); redo = []; }
  function restoreState(s) { const data = JSON.parse(s); sheet.restore(data.sheet); active = data.active || active; anchor = data.anchor || active; render(); save(); }
  function load() { try { const s = localStorage.getItem(storageKey); if (s) { const data = JSON.parse(s); sheet.restore(data.sheet); active = data.active || active; anchor = data.anchor || active; } } catch (_) {} }
  function cellEl(r, c) { return grid.querySelector(`td[data-row="${r}"][data-col="${c}"]`); }
  function build() {
    const head = document.createElement('tr'); head.innerHTML = '<th class="corner"></th>' + Array.from({ length: sheet.cols }, (_, c) => `<th data-col="${c}">${colName(c)}</th>`).join(''); grid.appendChild(head);
    for (let r = 0; r < sheet.rows; r++) { const tr = document.createElement('tr'); tr.innerHTML = `<th class="row-head" data-row="${r}">${r + 1}</th>` + Array.from({ length: sheet.cols }, (_, c) => `<td tabindex="-1" data-row="${r}" data-col="${c}"></td>`).join(''); grid.appendChild(tr); }
  }
  function rebuild() { grid.innerHTML = ''; build(); bindCells(); render(); }
  function render() {
    const sel = selection();
    grid.querySelectorAll('td').forEach(td => {
      const r = Number(td.dataset.row), c = Number(td.dataset.col), v = sheet.getDisplay(r, c);
      if (!editing || editing.td !== td) td.textContent = v;
      td.className = '';
      if (r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2) td.classList.add('in-range');
      if (r === active.row && c === active.col) td.classList.add('active');
      if (sheet.isNumericDisplay(r, c)) td.classList.add('num');
      if (v.startsWith('#')) td.classList.add('error');
    });
    nameBox.textContent = addr(active.row, active.col); bar.value = sheet.getRaw(active.row, active.col); cellEl(active.row, active.col)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); save();
  }
  function select(row, col, extend) { active = { row: Math.max(0, Math.min(sheet.rows - 1, row)), col: Math.max(0, Math.min(sheet.cols - 1, col)) }; if (!extend) anchor = { ...active }; render(); wrap.focus(); }
  function commit(raw) { pushHistory(); sheet.setCell(active.row, active.col, raw); stopEdit(); select(active.row + 1, active.col, false); }
  function stopEdit() { if (editing) { editing.td.classList.remove('editing'); editing = null; } }
  function startEdit(seed, preserve) {
    stopEdit(); const td = cellEl(active.row, active.col); if (!td) return;
    td.classList.add('editing'); td.textContent = ''; const input = document.createElement('input'); input.value = preserve ? sheet.getRaw(active.row, active.col) : seed; td.appendChild(input); editing = { td, input, original: sheet.getRaw(active.row, active.col) }; input.focus(); input.select();
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(input.value); } else if (e.key === 'Tab') { e.preventDefault(); pushHistory(); sheet.setCell(active.row, active.col, input.value); stopEdit(); select(active.row, active.col + 1, false); } else if (e.key === 'Escape') { e.preventDefault(); stopEdit(); render(); } });
    input.addEventListener('blur', () => { if (editing && editing.input === input) { pushHistory(); sheet.setCell(active.row, active.col, input.value); stopEdit(); render(); } });
  }
  function selectedBlockText() { const s = selection(), lines = []; for (let r = s.r1; r <= s.r2; r++) { const line = []; for (let c = s.c1; c <= s.c2; c++) line.push(sheet.getRaw(r, c)); lines.push(line.join('\t')); } return lines.join('\n'); }
  function clearSelection() { const s = selection(); pushHistory(); for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) sheet.setCell(r, c, ''); render(); }
  function pasteText(text) { const rows = text.replace(/\r/g, '').split('\n').filter((line, i, a) => line || i < a.length - 1).map(line => line.split('\t').map(raw => ({ raw, row: active.row, col: active.col }))); pushHistory(); sheet.pasteBlock(active.row, active.col, rows); copiedBlock = null; render(); }
  function pasteInternal() { if (!copiedBlock) return false; pushHistory(); sheet.pasteBlock(active.row, active.col, copiedBlock); copiedBlock = null; render(); return true; }
  function bindCells() {
    grid.querySelectorAll('td').forEach(td => {
      td.addEventListener('mousedown', e => { dragging = true; select(Number(td.dataset.row), Number(td.dataset.col), e.shiftKey); });
      td.addEventListener('mouseenter', () => { if (dragging) select(Number(td.dataset.row), Number(td.dataset.col), true); });
      td.addEventListener('dblclick', () => startEdit('', true));
    });
  }
  function undoRedo(from, to) { if (!from.length) return; to.push(JSON.stringify({ sheet: sheet.snapshot(), active, anchor })); restoreState(from.pop()); }
  function mutateStructure(fn) { pushHistory(); fn(); rebuild(); }

  load(); build(); bindCells(); render(); wrap.tabIndex = 0; wrap.focus();
  document.addEventListener('mouseup', () => { dragging = false; });
  wrap.addEventListener('keydown', e => {
    if (editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? undoRedo(redo, undo) : undoRedo(undo, redo); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(redo, undo); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copiedBlock = sheet.copyBlock(selection().r1, selection().c1, selection().r2, selection().c2); navigator.clipboard?.writeText(selectedBlockText()); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copiedBlock = sheet.copyBlock(selection().r1, selection().c1, selection().r2, selection().c2); navigator.clipboard?.writeText(selectedBlockText()); clearSelection(); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); if (!pasteInternal()) navigator.clipboard?.readText().then(pasteText); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelection(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit('', true); return; }
    if (e.key === 'Tab') { e.preventDefault(); select(active.row, active.col + 1, e.shiftKey); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { e.preventDefault(); select(active.row + arrows[e.key][0], active.col + arrows[e.key][1], e.shiftKey); return; }
    if (e.key.length === 1 && !mod) startEdit(e.key, false);
  });
  bar.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pushHistory(); sheet.setCell(active.row, active.col, bar.value); select(active.row + 1, active.col, false); } else if (e.key === 'Escape') { bar.value = sheet.getRaw(active.row, active.col); wrap.focus(); } });
  bar.addEventListener('blur', () => { if (bar.value !== sheet.getRaw(active.row, active.col)) { pushHistory(); sheet.setCell(active.row, active.col, bar.value); render(); } });
  document.getElementById('insert-row').onclick = () => mutateStructure(() => sheet.insertRow(active.row));
  document.getElementById('delete-row').onclick = () => mutateStructure(() => sheet.deleteRow(active.row));
  document.getElementById('insert-col').onclick = () => mutateStructure(() => sheet.insertCol(active.col));
  document.getElementById('delete-col').onclick = () => mutateStructure(() => sheet.deleteCol(active.col));
})();
