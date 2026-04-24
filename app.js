(function (root) {
  'use strict';

  var COLS = 26;
  var ROWS = 100;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function colName(col) { return LETTERS[col]; }
  function addr(row, col) { return colName(col) + (row + 1); }
  function parseAddr(address) {
    var m = /^([A-Z])(\d+)$/.exec(address);
    if (!m) return null;
    return { col: LETTERS.indexOf(m[1]), row: Number(m[2]) - 1 };
  }
  function normalizeRange(a, b) {
    return { top: Math.min(a.row, b.row), left: Math.min(a.col, b.col), bottom: Math.max(a.row, b.row), right: Math.max(a.col, b.col) };
  }

  function adjustFormulaReferences(raw, rowDelta, colDelta) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z])(\$?)(\d+)/g, function (_, absCol, col, absRow, row) {
      var nextCol = absCol ? LETTERS.indexOf(col) : LETTERS.indexOf(col) + colDelta;
      var nextRow = absRow ? Number(row) - 1 : Number(row) - 1 + rowDelta;
      if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS) return '#REF!';
      return absCol + colName(nextCol) + absRow + (nextRow + 1);
    });
  }

  function adjustFormulaForStructureChange(raw, axis, index, delta) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z])(\$?)(\d+)/g, function (_, absCol, col, absRow, row) {
      var nextCol = LETTERS.indexOf(col);
      var nextRow = Number(row) - 1;
      if (axis === 'row') {
        if (delta < 0 && nextRow === index) return '#REF!';
        if (nextRow >= index) nextRow += delta;
      } else {
        if (delta < 0 && nextCol === index) return '#REF!';
        if (nextCol >= index) nextCol += delta;
      }
      if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS) return '#REF!';
      return absCol + colName(nextCol) + absRow + (nextRow + 1);
    });
  }

  function FormulaEngine(getRaw, cols, rows) {
    this.getRaw = getRaw;
    this.cols = cols || COLS;
    this.rows = rows || ROWS;
  }

  FormulaEngine.prototype.evaluateCell = function (address, raw, stack) {
    stack = stack || [];
    if (stack.indexOf(address) !== -1) return { value: '#CIRC!', display: '#CIRC!', error: true };
    if (raw == null || raw === '') return { value: '', display: '', error: false };
    if (String(raw)[0] !== '=') {
      var n = Number(raw);
      return raw !== '' && !Number.isNaN(n) ? { value: n, display: String(n), error: false } : { value: String(raw), display: String(raw), error: false };
    }
    try {
      var parser = new Parser(String(raw).slice(1), this, stack.concat(address));
      var value = parser.parseExpression();
      parser.skipSpaces();
      if (!parser.done()) throw new Error('syntax');
      if (value === Infinity || value === -Infinity) return { value: '#DIV/0!', display: '#DIV/0!', error: true };
      return { value: value, display: formatValue(value), error: false };
    } catch (e) {
      var msg = e.message === 'CIRC' ? '#CIRC!' : e.message === 'DIV0' ? '#DIV/0!' : e.message === 'REF' ? '#REF!' : '#ERR!';
      return { value: msg, display: msg, error: true };
    }
  };

  FormulaEngine.prototype.refValue = function (address, stack) {
    var p = parseAddr(address.replace(/\$/g, ''));
    if (!p || p.col < 0 || p.col >= this.cols || p.row < 0 || p.row >= this.rows) throw new Error('REF');
    var result = this.evaluateCell(addr(p.row, p.col), this.getRaw(addr(p.row, p.col)), stack);
    if (result.display === '#CIRC!') throw new Error('CIRC');
    if (result.error) throw new Error(result.display === '#DIV/0!' ? 'DIV0' : 'ERR');
    return result.value === '' ? 0 : result.value;
  };

  FormulaEngine.prototype.rangeValues = function (start, end, stack) {
    var a = parseAddr(start.replace(/\$/g, ''));
    var b = parseAddr(end.replace(/\$/g, ''));
    if (!a || !b) throw new Error('REF');
    var out = [];
    var r = normalizeRange(a, b);
    for (var row = r.top; row <= r.bottom; row++) for (var col = r.left; col <= r.right; col++) out.push(this.refValue(addr(row, col), stack));
    return out;
  };

  function formatValue(value) {
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    return String(value);
  }
  function asNumber(value) { var n = Number(value === '' ? 0 : value); return Number.isNaN(n) ? 0 : n; }
  function asBool(value) { return value === true || value === 'TRUE' || (typeof value === 'number' && value !== 0) || (typeof value === 'string' && value !== '' && value !== 'FALSE'); }

  function Parser(text, engine, stack) { this.text = text; this.i = 0; this.engine = engine; this.stack = stack; }
  Parser.prototype.done = function () { return this.i >= this.text.length; };
  Parser.prototype.skipSpaces = function () { while (/\s/.test(this.text[this.i])) this.i++; };
  Parser.prototype.match = function (s) { this.skipSpaces(); if (this.text.slice(this.i, this.i + s.length).toUpperCase() === s) { this.i += s.length; return true; } return false; };
  Parser.prototype.parseExpression = function () { return this.parseCompare(); };
  Parser.prototype.parseCompare = function () {
    var left = this.parseConcat();
    var ops = ['>=', '<=', '<>', '>', '<', '='];
    for (var k = 0; k < ops.length; k++) if (this.match(ops[k])) {
      var right = this.parseConcat();
      if (ops[k] === '=') return left == right;
      if (ops[k] === '<>') return left != right;
      if (ops[k] === '>') return left > right;
      if (ops[k] === '<') return left < right;
      if (ops[k] === '>=') return left >= right;
      return left <= right;
    }
    return left;
  };
  Parser.prototype.parseConcat = function () { var v = this.parseAdd(); while (this.match('&')) v = String(v) + String(this.parseAdd()); return v; };
  Parser.prototype.parseAdd = function () { var v = this.parseMul(); while (true) { if (this.match('+')) v = asNumber(v) + asNumber(this.parseMul()); else if (this.match('-')) v = asNumber(v) - asNumber(this.parseMul()); else return v; } };
  Parser.prototype.parseMul = function () { var v = this.parseUnary(); while (true) { if (this.match('*')) v = asNumber(v) * asNumber(this.parseUnary()); else if (this.match('/')) { var d = asNumber(this.parseUnary()); if (d === 0) throw new Error('DIV0'); v = asNumber(v) / d; } else return v; } };
  Parser.prototype.parseUnary = function () { if (this.match('-')) return -asNumber(this.parseUnary()); return this.parsePrimary(); };
  Parser.prototype.parsePrimary = function () {
    this.skipSpaces();
    var ch = this.text[this.i];
    if (ch === '(') { this.i++; var v = this.parseExpression(); if (!this.match(')')) throw new Error('syntax'); return v; }
    if (ch === '"') return this.parseString();
    if (/\d|\./.test(ch)) return this.parseNumber();
    if (/[A-Z_$]/i.test(ch)) return this.parseName();
    throw new Error('syntax');
  };
  Parser.prototype.parseString = function () { var s = ''; this.i++; while (!this.done() && this.text[this.i] !== '"') s += this.text[this.i++]; if (!this.match('"')) throw new Error('syntax'); return s; };
  Parser.prototype.parseNumber = function () { var m = /^(\d+(\.\d+)?|\.\d+)/.exec(this.text.slice(this.i)); if (!m) throw new Error('syntax'); this.i += m[0].length; return Number(m[0]); };
  Parser.prototype.parseName = function () {
    var m = /^(\$?[A-Z]+\$?\d+|[A-Z_][A-Z0-9_]*)/i.exec(this.text.slice(this.i));
    if (!m) throw new Error('syntax');
    var name = m[0].toUpperCase(); this.i += m[0].length;
    if (/^\$?[A-Z]\$?\d+$/.test(name)) {
      if (this.match(':')) { var end = /^(\$?[A-Z]\$?\d+)/i.exec(this.text.slice(this.i)); if (!end) throw new Error('syntax'); this.i += end[0].length; return this.engine.rangeValues(name, end[0].toUpperCase(), this.stack); }
      return this.engine.refValue(name, this.stack);
    }
    if (name === 'TRUE') return true;
    if (name === 'FALSE') return false;
    if (!this.match('(')) throw new Error('syntax');
    var args = [];
    if (!this.match(')')) { do { args.push(this.parseExpression()); } while (this.match(',')); if (!this.match(')')) throw new Error('syntax'); }
    return this.callFunction(name, args);
  };
  Parser.prototype.callFunction = function (name, args) {
    var flat = [].concat.apply([], args).filter(function (v) { return v !== ''; });
    if (name === 'SUM') return flat.reduce(function (s, v) { return s + asNumber(v); }, 0);
    if (name === 'AVERAGE') return flat.length ? flat.reduce(function (s, v) { return s + asNumber(v); }, 0) / flat.length : 0;
    if (name === 'MIN') return Math.min.apply(Math, flat.map(asNumber));
    if (name === 'MAX') return Math.max.apply(Math, flat.map(asNumber));
    if (name === 'COUNT') return flat.filter(function (v) { return typeof v === 'number' || (!Number.isNaN(Number(v)) && v !== ''); }).length;
    if (name === 'IF') return asBool(args[0]) ? args[1] : args[2];
    if (name === 'AND') return flat.every(asBool);
    if (name === 'OR') return flat.some(asBool);
    if (name === 'NOT') return !asBool(args[0]);
    if (name === 'ABS') return Math.abs(asNumber(args[0]));
    if (name === 'ROUND') return Number(asNumber(args[0]).toFixed(asNumber(args[1] || 0)));
    if (name === 'CONCAT') return flat.map(String).join('');
    throw new Error('ERR');
  };

  function SpreadsheetCore(rows, cols) {
    this.rows = rows || ROWS;
    this.cols = cols || COLS;
    this.cells = new Map();
    this.engine = new FormulaEngine(this.getRaw.bind(this), this.cols, this.rows);
  }
  SpreadsheetCore.prototype.setCell = function (address, raw) { raw ? this.cells.set(address, String(raw)) : this.cells.delete(address); };
  SpreadsheetCore.prototype.getRaw = function (address) { return this.cells.get(address) || ''; };
  SpreadsheetCore.prototype.getDisplay = function (address) { return this.engine.evaluateCell(address, this.getRaw(address)).display; };
  SpreadsheetCore.prototype.copyRange = function (from, to, dest, cut) {
    var r = normalizeRange(from, to);
    var writes = [];
    for (var row = r.top; row <= r.bottom; row++) for (var col = r.left; col <= r.right; col++) {
      var raw = this.getRaw(addr(row, col));
      writes.push({ row: dest.row + row - r.top, col: dest.col + col - r.left, raw: adjustFormulaReferences(raw, dest.row - r.top, dest.col - r.left) });
    }
    writes.forEach(function (w) { if (w.row < ROWS && w.col < COLS) this.setCell(addr(w.row, w.col), w.raw); }, this);
    if (cut) for (var rr = r.top; rr <= r.bottom; rr++) for (var cc = r.left; cc <= r.right; cc++) this.setCell(addr(rr, cc), '');
  };
  SpreadsheetCore.prototype.insertRow = function (index) { this.shiftStructure('row', index, 1); };
  SpreadsheetCore.prototype.deleteRow = function (index) { this.shiftStructure('row', index, -1); };
  SpreadsheetCore.prototype.insertCol = function (index) { this.shiftStructure('col', index, 1); };
  SpreadsheetCore.prototype.deleteCol = function (index) { this.shiftStructure('col', index, -1); };
  SpreadsheetCore.prototype.shiftStructure = function (axis, index, delta) {
    var next = new Map();
    this.cells.forEach(function (raw, a) {
      var p = parseAddr(a);
      if (axis === 'row') {
        if (delta < 0 && p.row === index) return;
        if (p.row >= index) p.row += delta;
      } else {
        if (delta < 0 && p.col === index) return;
        if (p.col >= index) p.col += delta;
      }
      if (p.row >= 0 && p.row < ROWS && p.col >= 0 && p.col < COLS) next.set(addr(p.row, p.col), adjustFormulaForStructureChange(raw, axis, index, delta));
    });
    this.cells = next;
  };

  function SpreadsheetUI() {
    this.core = new SpreadsheetCore(ROWS, COLS);
    this.active = { row: 0, col: 0 };
    this.anchor = { row: 0, col: 0 };
    this.editing = null;
    this.clip = null;
    this.undo = [];
    this.redo = [];
    this.ns = (root.__SPREADSHEET_STORAGE_NAMESPACE__ || root.__STORAGE_NAMESPACE__ || root.BENCH_STORAGE_NAMESPACE || root.localStorageNamespace || 'amazon-sheet') + ':';
    this.sheet = document.getElementById('sheet');
    this.formula = document.getElementById('formulaBar');
    this.cellName = document.getElementById('cellName');
    this.load();
    this.renderGrid();
    this.bind();
    this.refresh();
  }
  SpreadsheetUI.prototype.snapshot = function () { return { cells: Array.from(this.core.cells.entries()), active: this.active }; };
  SpreadsheetUI.prototype.restore = function (s) { this.core.cells = new Map(s.cells || []); this.active = s.active || { row: 0, col: 0 }; this.anchor = this.active; this.refresh(); this.save(); };
  SpreadsheetUI.prototype.record = function () { this.undo.push(this.snapshot()); if (this.undo.length > 50) this.undo.shift(); this.redo = []; };
  SpreadsheetUI.prototype.save = function () { try { localStorage.setItem(this.ns + 'state', JSON.stringify(this.snapshot())); } catch (e) {} };
  SpreadsheetUI.prototype.load = function () { try { var s = JSON.parse(localStorage.getItem(this.ns + 'state') || 'null'); if (s) { this.core.cells = new Map(s.cells || []); this.active = s.active || this.active; this.anchor = this.active; } } catch (e) {} };
  SpreadsheetUI.prototype.renderGrid = function () {
    var grid = document.createElement('div'); grid.className = 'grid';
    var corner = document.createElement('div'); corner.className = 'corner'; grid.appendChild(corner);
    for (var c = 0; c < COLS; c++) grid.appendChild(this.header('col-head', colName(c), c));
    for (var r = 0; r < ROWS; r++) { grid.appendChild(this.header('row-head', String(r + 1), r)); for (c = 0; c < COLS; c++) { var cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.row = r; cell.dataset.col = c; grid.appendChild(cell); } }
    this.sheet.appendChild(grid);
  };
  SpreadsheetUI.prototype.header = function (cls, text, index) { var h = document.createElement('div'); h.className = cls; h.textContent = text; h.dataset.index = index; return h; };
  SpreadsheetUI.prototype.bind = function () {
    var self = this;
    this.sheet.addEventListener('mousedown', function (e) { var cell = e.target.closest('.cell'); if (!cell) return; self.select(Number(cell.dataset.row), Number(cell.dataset.col), e.shiftKey); });
    this.sheet.addEventListener('dblclick', function () { self.startEdit(true); });
    this.sheet.addEventListener('keydown', function (e) { self.key(e); });
    this.formula.addEventListener('focus', function () { self.formula.value = self.core.getRaw(addr(self.active.row, self.active.col)); });
    this.formula.addEventListener('keydown', function (e) { if (e.key === 'Enter') { self.commit(self.formula.value, true); e.preventDefault(); } else if (e.key === 'Escape') { self.refresh(); self.sheet.focus(); } });
    document.addEventListener('contextmenu', function (e) { var head = e.target.closest('.row-head,.col-head'); if (!head) return; e.preventDefault(); self.openMenu(e, head); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.menu')) self.closeMenu(); });
  };
  SpreadsheetUI.prototype.key = function (e) {
    if (this.editing) return;
    var meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'z') { this.history(e.shiftKey ? 1 : -1); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'y') { this.history(1); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'c') { this.copy(false); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'x') { this.copy(true); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'v') { this.paste(); e.preventDefault(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.clearRange(); e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { this.startEdit(true); e.preventDefault(); return; }
    var d = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1], Tab: [0,1] }[e.key];
    if (d) { this.move(d[0], d[1], e.shiftKey); e.preventDefault(); return; }
    if (e.key.length === 1 && !meta) { this.startEdit(false, e.key); e.preventDefault(); }
  };
  SpreadsheetUI.prototype.select = function (row, col, extend) { this.active = { row: row, col: col }; if (!extend) this.anchor = this.active; this.refresh(); this.sheet.focus(); this.save(); };
  SpreadsheetUI.prototype.move = function (dr, dc, extend) { this.select(Math.max(0, Math.min(ROWS - 1, this.active.row + dr)), Math.max(0, Math.min(COLS - 1, this.active.col + dc)), extend); };
  SpreadsheetUI.prototype.startEdit = function (preserve, seed) {
    var el = this.cellEl(this.active.row, this.active.col); var input = document.createElement('input'); input.className = 'editor'; input.value = preserve ? this.core.getRaw(addr(this.active.row, this.active.col)) : (seed || ''); el.appendChild(input); this.editing = input; input.focus(); input.select();
    var self = this;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { self.commit(input.value, true); e.preventDefault(); } else if (e.key === 'Tab') { self.commit(input.value, false); self.move(0, 1, false); e.preventDefault(); } else if (e.key === 'Escape') { self.editing = null; self.refresh(); self.sheet.focus(); e.preventDefault(); } });
  };
  SpreadsheetUI.prototype.commit = function (raw, moveDown) { this.record(); this.core.setCell(addr(this.active.row, this.active.col), raw); this.editing = null; if (moveDown) this.move(1, 0, false); this.refresh(); this.save(); this.sheet.focus(); };
  SpreadsheetUI.prototype.range = function () { return normalizeRange(this.anchor, this.active); };
  SpreadsheetUI.prototype.clearRange = function () { this.record(); var r = this.range(); for (var row = r.top; row <= r.bottom; row++) for (var col = r.left; col <= r.right; col++) this.core.setCell(addr(row, col), ''); this.refresh(); this.save(); };
  SpreadsheetUI.prototype.copy = function (cut) { var r = this.range(); var data = []; for (var row = r.top; row <= r.bottom; row++) { var line = []; for (var col = r.left; col <= r.right; col++) line.push(this.core.getRaw(addr(row, col))); data.push(line); } this.clip = { data: data, from: r, cut: cut }; navigator.clipboard && navigator.clipboard.writeText(data.map(function (x) { return x.join('\t'); }).join('\n')).catch(function () {}); };
  SpreadsheetUI.prototype.paste = function () { if (!this.clip) return; this.record(); for (var r = 0; r < this.clip.data.length; r++) for (var c = 0; c < this.clip.data[r].length; c++) this.core.setCell(addr(this.active.row + r, this.active.col + c), adjustFormulaReferences(this.clip.data[r][c], this.active.row - this.clip.from.top, this.active.col - this.clip.from.left)); if (this.clip.cut) { for (var row = this.clip.from.top; row <= this.clip.from.bottom; row++) for (var col = this.clip.from.left; col <= this.clip.from.right; col++) this.core.setCell(addr(row, col), ''); this.clip.cut = false; } this.refresh(); this.save(); };
  SpreadsheetUI.prototype.history = function (dir) { var from = dir < 0 ? this.undo : this.redo; var to = dir < 0 ? this.redo : this.undo; if (!from.length) return; to.push(this.snapshot()); this.restore(from.pop()); };
  SpreadsheetUI.prototype.openMenu = function (e, head) { this.closeMenu(); var isRow = head.classList.contains('row-head'); var index = Number(head.dataset.index); var menu = document.createElement('div'); menu.className = 'menu'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; var self = this; [['Insert before', -1], ['Insert after', 1], ['Delete', 0]].forEach(function (item) { var b = document.createElement('button'); b.textContent = item[0]; b.onclick = function () { self.record(); isRow ? self.mutateRows(index, item[1]) : self.mutateCols(index, item[1]); self.closeMenu(); self.refresh(); self.save(); }; menu.appendChild(b); }); document.body.appendChild(menu); this.menu = menu; };
  SpreadsheetUI.prototype.closeMenu = function () { if (this.menu) this.menu.remove(); this.menu = null; };
  SpreadsheetUI.prototype.mutateRows = function (index, mode) { var delta = mode === 0 ? -1 : 1; var pivot = mode === 1 ? index + 1 : index; var next = new Map(); this.core.cells.forEach(function (raw, a) { var p = parseAddr(a); if (mode === 0 && p.row === index) return; if (p.row >= pivot) p.row += delta; next.set(addr(p.row, p.col), adjustFormulaForStructureChange(raw, 'row', pivot, delta)); }); this.core.cells = next; };
  SpreadsheetUI.prototype.mutateCols = function (index, mode) { var delta = mode === 0 ? -1 : 1; var pivot = mode === 1 ? index + 1 : index; var next = new Map(); this.core.cells.forEach(function (raw, a) { var p = parseAddr(a); if (mode === 0 && p.col === index) return; if (p.col >= pivot) p.col += delta; next.set(addr(p.row, p.col), adjustFormulaForStructureChange(raw, 'col', pivot, delta)); }); this.core.cells = next; };
  SpreadsheetUI.prototype.cellEl = function (row, col) { return this.sheet.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]'); };
  SpreadsheetUI.prototype.refresh = function () {
    var r = this.range(); this.cellName.textContent = addr(this.active.row, this.active.col); this.formula.value = this.core.getRaw(addr(this.active.row, this.active.col));
    this.sheet.querySelectorAll('.cell').forEach(function (el) { var row = Number(el.dataset.row), col = Number(el.dataset.col), a = addr(row, col), raw = this.core.getRaw(a), display = this.core.getDisplay(a); el.textContent = display; el.className = 'cell'; if (row >= r.top && row <= r.bottom && col >= r.left && col <= r.right) el.classList.add('in-range'); if (row === this.active.row && col === this.active.col) el.classList.add('active'); if (display && !Number.isNaN(Number(display))) el.classList.add('number'); if (display[0] === '#') el.classList.add('error'); el.title = raw; }, this);
  };

  root.SpreadsheetCore = { FormulaEngine: FormulaEngine, SpreadsheetCore: SpreadsheetCore, adjustFormulaReferences: adjustFormulaReferences, adjustFormulaForStructureChange: adjustFormulaForStructureChange };
  if (typeof module !== 'undefined') module.exports = { SpreadsheetCore: SpreadsheetCore, FormulaEngine: FormulaEngine, adjustFormulaReferences: adjustFormulaReferences, adjustFormulaForStructureChange: adjustFormulaForStructureChange };
  if (typeof document !== 'undefined' && document.getElementById('sheet')) document.addEventListener('DOMContentLoaded', function () { new SpreadsheetUI(); });
})(typeof window !== 'undefined' ? window : globalThis);
