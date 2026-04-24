(function () {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    var workbookApi = require('./workbook.js');
    var Workbook = workbookApi.Workbook;
    var rewriteFormulaReferences = workbookApi.rewriteFormulaReferences;
    var indexToCol = workbookApi.indexToCol;

    function nodeAddr(row, col) { return indexToCol(col) + (row + 1); }
    function SpreadsheetEngine(cols, rows) { this.book = new Workbook({ rows: rows, cols: cols }); }
    SpreadsheetEngine.prototype.setCell = function (row, col, raw) { this.book.setCell(nodeAddr(row, col), raw); };
    SpreadsheetEngine.prototype.getRaw = function (row, col) { return this.book.getCell(nodeAddr(row, col)); };
    SpreadsheetEngine.prototype.getDisplay = function (row, col) {
      var display = this.book.getDisplay(nodeAddr(row, col));
      return display === '#REF!' ? '#ERR!' : display;
    };
    SpreadsheetEngine.prototype.insertRows = function (atRow, count) { this.book.insertRows(atRow, count || 1); };
    SpreadsheetEngine.prototype.deleteRows = function (atRow, count) { this.book.deleteRows(atRow, count || 1); };
    SpreadsheetEngine.prototype.insertCols = function (atCol, count) { this.book.insertCols(atCol, count || 1); };
    SpreadsheetEngine.prototype.deleteCols = function (atCol, count) { this.book.deleteCols(atCol, count || 1); };

    SpreadsheetEngine.prototype.applyRawChanges = function (updates) {
      var byAddress = {};
      var self = this;
      updates.forEach(function (item) {
        var address = nodeAddr(item.row, item.col);
        if (!byAddress[address]) byAddress[address] = { row: item.row, col: item.col, oldRaw: self.book.getCell(address), newRaw: '' };
        byAddress[address].newRaw = String(item.raw == null ? '' : item.raw);
      });
      var changes = Object.keys(byAddress).map(function (address) { return byAddress[address]; }).filter(function (change) { return change.oldRaw !== change.newRaw; });
      this.book.applyCells(changes.map(function (change) { return [nodeAddr(change.row, change.col), change.newRaw]; }), true);
      return changes;
    };

    SpreadsheetEngine.prototype.copyRange = function (range) {
      var data = [];
      for (var row = Math.min(range.r1, range.r2); row <= Math.max(range.r1, range.r2); row++) {
        var line = [];
        for (var col = Math.min(range.c1, range.c2); col <= Math.max(range.c1, range.c2); col++) line.push(this.getRaw(row, col));
        data.push(line);
      }
      return data;
    };

    SpreadsheetEngine.prototype.pasteBlock = function (block, startRow, startCol, sourceRange, targetSize) {
      var rows = targetSize && targetSize.rows ? targetSize.rows : block.length;
      var cols = targetSize && targetSize.cols ? targetSize.cols : block[0].length;
      var updates = [];
      for (var r = 0; r < rows; r++) {
        var sourceRow = block[r % block.length];
        for (var c = 0; c < cols; c++) {
          var raw = sourceRow[c % sourceRow.length];
          var fromRow = sourceRange ? sourceRange.r1 + (r % block.length) : startRow + r;
          var fromCol = sourceRange ? sourceRange.c1 + (c % sourceRow.length) : startCol + c;
          updates.push({ row: startRow + r, col: startCol + c, raw: adjustFormulaReferences(raw, fromRow, fromCol, startRow + r, startCol + c) });
        }
      }
      return this.applyRawChanges(updates);
    };

    SpreadsheetEngine.prototype.moveRange = function (range, startRow, startCol) {
      var source = this.copyRange(range);
      var r1 = Math.min(range.r1, range.r2);
      var c1 = Math.min(range.c1, range.c2);
      var updates = [];
      for (var r = 0; r < source.length; r++) for (var c = 0; c < source[r].length; c++) updates.push({ row: r1 + r, col: c1 + c, raw: '' });
      for (var pr = 0; pr < source.length; pr++) for (var pc = 0; pc < source[pr].length; pc++) {
        updates.push({ row: startRow + pr, col: startCol + pc, raw: adjustFormulaReferences(source[pr][pc], r1 + pr, c1 + pc, startRow + pr, startCol + pc) });
      }
      return this.applyRawChanges(updates);
    };

    function adjustFormulaReferences(raw, fromRow, fromCol, toRow, toCol) {
      return rewriteFormulaReferences(raw, toRow - fromRow, toCol - fromCol);
    }

    function describeSelection(anchor, active, maxRows, maxCols) {
      function clamp(value, max) { return Math.max(0, Math.min(max - 1, value)); }
      var activeRow = clamp(active.row, maxRows);
      var activeCol = clamp(active.col, maxCols);
      var anchorRow = clamp(anchor.row, maxRows);
      var anchorCol = clamp(anchor.col, maxCols);
      var r1 = Math.min(anchorRow, activeRow);
      var c1 = Math.min(anchorCol, activeCol);
      var r2 = Math.max(anchorRow, activeRow);
      var c2 = Math.max(anchorCol, activeCol);
      var start = nodeAddr(r1, c1);
      var end = nodeAddr(r2, c2);
      return { r1: r1, c1: c1, r2: r2, c2: c2, activeRow: activeRow, activeCol: activeCol, label: start === end ? start : start + ':' + end };
    }

    module.exports = { SpreadsheetEngine: SpreadsheetEngine, adjustFormulaReferences: adjustFormulaReferences, describeSelection: describeSelection };
    return;
  }

  var ROWS = 100;
  var COLS = 26;
  var STORAGE_NS = window.__SPREADSHEET_STORAGE_NAMESPACE__ || window.STORAGE_NAMESPACE || 'amazon-sheet:';
  var KEY = STORAGE_NS + 'state';
  var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function colToName(col) { return letters[col]; }
  function addr(row, col) { return colToName(col) + (row + 1); }
  function parseAddr(name) {
    var m = /^([A-Z])(\d+)$/.exec(name);
    if (!m) return null;
    var row = Number(m[2]) - 1;
    var col = letters.indexOf(m[1]);
    return row >= 0 && row < ROWS && col >= 0 ? { row: row, col: col } : null;
  }
  function formatValue(value) {
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1e10) / 1e10) : '#ERR!';
    return value == null ? '' : String(value);
  }
  function rawToValue(raw) {
    if (raw === '') return 0;
    if (/^true$/i.test(raw)) return true;
    if (/^false$/i.test(raw)) return false;
    if (!Number.isNaN(Number(raw))) return Number(raw);
    return raw;
  }
  function flatten(args) {
    var out = [];
    args.forEach(function (arg) { Array.isArray(arg) ? out.push.apply(out, flatten(arg)) : out.push(arg); });
    return out;
  }
  function num(v) { return typeof v === 'number' ? v : Number(v) || 0; }
  function truthy(v) { return v === true || (typeof v === 'number' ? v !== 0 : String(v).length > 0); }

  function tokenize(expr) {
    var tokens = [];
    var i = 0;
    while (i < expr.length) {
      var ch = expr[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        var s = '';
        i++;
        while (i < expr.length && expr[i] !== '"') s += expr[i++];
        if (expr[i] !== '"') throw new Error('#ERR!');
        i++;
        tokens.push({ type: 'str', value: s });
        continue;
      }
      var two = expr.slice(i, i + 2);
      if (['<>', '<=', '>='].indexOf(two) >= 0) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/()&,:=<>'.indexOf(ch) >= 0) { tokens.push({ type: ch === '(' || ch === ')' || ch === ',' || ch === ':' ? ch : 'op', value: ch }); i++; continue; }
      var n = /^\d+(?:\.\d+)?/.exec(expr.slice(i));
      if (n) { tokens.push({ type: 'num', value: Number(n[0]) }); i += n[0].length; continue; }
      var id = /^\$?[A-Z]+\$?\d+|[A-Z_][A-Z0-9_]*/.exec(expr.slice(i));
      if (id) { tokens.push({ type: 'id', value: id[0] }); i += id[0].length; continue; }
      throw new Error('#ERR!');
    }
    return tokens;
  }

  function Parser(tokens, sheet, stack) { this.tokens = tokens; this.i = 0; this.sheet = sheet; this.stack = stack || {}; }
  Parser.prototype.peek = function () { return this.tokens[this.i]; };
  Parser.prototype.take = function (type, value) {
    var t = this.peek();
    if (t && t.type === type && (value == null || t.value === value)) { this.i++; return t; }
    return null;
  };
  Parser.prototype.parse = function () {
    var v = this.compare();
    if (this.peek()) throw new Error('#ERR!');
    return v;
  };
  Parser.prototype.compare = function () {
    var left = this.concat();
    while (this.peek() && this.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.peek().value) >= 0) {
      var op = this.take('op').value, right = this.concat();
      if (op === '=') left = left == right;
      if (op === '<>') left = left != right;
      if (op === '<') left = left < right;
      if (op === '<=') left = left <= right;
      if (op === '>') left = left > right;
      if (op === '>=') left = left >= right;
    }
    return left;
  };
  Parser.prototype.concat = function () {
    var left = this.add();
    while (this.take('op', '&')) left = formatValue(left) + formatValue(this.add());
    return left;
  };
  Parser.prototype.add = function () {
    var left = this.mul();
    while (this.peek() && this.peek().type === 'op' && ['+', '-'].indexOf(this.peek().value) >= 0) {
      var op = this.take('op').value, right = this.mul();
      left = op === '+' ? num(left) + num(right) : num(left) - num(right);
    }
    return left;
  };
  Parser.prototype.mul = function () {
    var left = this.unary();
    while (this.peek() && this.peek().type === 'op' && ['*', '/'].indexOf(this.peek().value) >= 0) {
      var op = this.take('op').value, right = this.unary();
      if (op === '/' && num(right) === 0) throw new Error('#DIV/0!');
      left = op === '*' ? num(left) * num(right) : num(left) / num(right);
    }
    return left;
  };
  Parser.prototype.unary = function () { return this.take('op', '-') ? -num(this.unary()) : this.primary(); };
  Parser.prototype.primary = function () {
    var t = this.peek();
    if (!t) throw new Error('#ERR!');
    if (this.take('num')) return t.value;
    if (this.take('str')) return t.value;
    if (this.take('(')) { var v = this.compare(); if (!this.take(')')) throw new Error('#ERR!'); return v; }
    if (this.take('id')) {
      var id = t.value.toUpperCase();
      if (id === 'TRUE') return true;
      if (id === 'FALSE') return false;
      if (this.take('(')) return this.call(id);
      if (/^\$?[A-Z]+\$?\d+$/.test(id)) {
        if (this.take(':')) return this.rangeValues(id, this.take('id').value.toUpperCase());
        return this.cellValue(id);
      }
      throw new Error('#NAME?');
    }
    throw new Error('#ERR!');
  };
  Parser.prototype.call = function (name) {
    var args = [];
    if (!this.take(')')) {
      do { args.push(this.compare()); } while (this.take(','));
      if (!this.take(')')) throw new Error('#ERR!');
    }
    var values = flatten(args);
    if (name === 'SUM') return values.reduce(function (a, b) { return a + num(b); }, 0);
    if (name === 'AVERAGE') return values.length ? values.reduce(function (a, b) { return a + num(b); }, 0) / values.length : 0;
    if (name === 'MIN') return Math.min.apply(Math, values.map(num));
    if (name === 'MAX') return Math.max.apply(Math, values.map(num));
    if (name === 'COUNT') return values.filter(function (v) { return typeof v === 'number' || !Number.isNaN(Number(v)); }).length;
    if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
    if (name === 'AND') return values.every(truthy);
    if (name === 'OR') return values.some(truthy);
    if (name === 'NOT') return !truthy(args[0]);
    if (name === 'ABS') return Math.abs(num(args[0]));
    if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
    if (name === 'CONCAT') return values.map(formatValue).join('');
    throw new Error('#NAME?');
  };
  Parser.prototype.cellValue = function (ref) {
    var clean = ref.replace(/\$/g, '');
    if (this.stack[clean]) throw new Error('#CIRC!');
    return evaluateCell(clean, this.sheet, Object.assign({}, this.stack, Object.fromEntries([[clean, true]]))).value;
  };
  Parser.prototype.rangeValues = function (a, b) {
    var pa = parseAddr(a.replace(/\$/g, '')), pb = parseAddr(b.replace(/\$/g, ''));
    if (!pa || !pb) throw new Error('#REF!');
    var values = [];
    for (var r = Math.min(pa.row, pb.row); r <= Math.max(pa.row, pb.row); r++) {
      for (var c = Math.min(pa.col, pb.col); c <= Math.max(pa.col, pb.col); c++) values.push(this.cellValue(addr(r, c)));
    }
    return values;
  };

  function evaluateCell(address, sheet, stack) {
    var raw = sheet.getRaw(address);
    if (!raw || raw[0] !== '=') { var v = rawToValue(raw || ''); return { value: v, display: raw === '' ? '' : formatValue(v), type: typeof v === 'number' ? 'number' : 'text' }; }
    try {
      var value = new Parser(tokenize(raw.slice(1)), sheet, stack || Object.fromEntries([[address, true]])).parse();
      return { value: value, display: formatValue(value), type: typeof value === 'number' ? 'number' : 'text' };
    } catch (e) {
      var msg = e.message && e.message[0] === '#' ? e.message : '#ERR!';
      return { value: msg, display: msg, type: 'error' };
    }
  }

  function shiftFormula(raw, rowDelta, colDelta) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z])(\$?)(\d+)/g, function (m, absCol, col, absRow, row) {
      var c = letters.indexOf(col), r = Number(row) - 1;
      if (!absCol) c += colDelta;
      if (!absRow) r += rowDelta;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return '#REF!';
      return absCol + colToName(c) + absRow + (r + 1);
    });
  }

  window.SpreadsheetCore = { evaluateCell: evaluateCell, shiftFormula: shiftFormula, addr: addr };
  if (!document.getElementById('sheet')) return;

  var cells = {};
  var selected = { row: 0, col: 0, row2: 0, col2: 0 };
  var editing = null;
  var undoStack = [], redoStack = [];
  var sheetEl = document.getElementById('sheet');
  var formulaBar = document.getElementById('formulaBar');
  var cellName = document.getElementById('cellName');
  var nodes = {};
  var clipboard = null;
  var dragStart = null;
  var model = { getRaw: function (a) { return cells[a] || ''; } };

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      cells = saved.cells || {};
      selected = saved.selected || selected;
    } catch (e) {}
  }
  function save() { localStorage.setItem(KEY, JSON.stringify({ cells: cells, selected: selected })); }
  function snapshot() { return JSON.stringify(cells); }
  function restore(s) { cells = JSON.parse(s); renderValues(); updateSelection(); save(); }
  function pushHistory(before) { undoStack.push({ before: before, after: snapshot() }); if (undoStack.length > 50) undoStack.shift(); redoStack = []; }
  function setRaw(r, c, raw) { var a = addr(r, c); raw ? cells[a] = raw : delete cells[a]; }
  function selectedBounds() { return { r1: Math.min(selected.row, selected.row2), c1: Math.min(selected.col, selected.col2), r2: Math.max(selected.row, selected.row2), c2: Math.max(selected.col, selected.col2) }; }
  function renderGrid() {
    load();
    var grid = document.createElement('div');
    grid.className = 'grid';
    var corner = document.createElement('div'); corner.className = 'corner'; grid.appendChild(corner);
    for (var c = 0; c < COLS; c++) grid.appendChild(header('col-header', colToName(c), c));
    for (var r = 0; r < ROWS; r++) {
      grid.appendChild(header('row-header', String(r + 1), r));
      for (c = 0; c < COLS; c++) {
        var div = document.createElement('div');
        div.className = 'cell'; div.dataset.row = r; div.dataset.col = c; div.tabIndex = 0;
        div.addEventListener('mousedown', onMouseDown); div.addEventListener('mouseenter', onMouseEnter); div.addEventListener('dblclick', function (e) { beginEdit(Number(e.currentTarget.dataset.row), Number(e.currentTarget.dataset.col), true); });
        nodes[addr(r, c)] = div; grid.appendChild(div);
      }
    }
    document.addEventListener('mouseup', function () { dragStart = null; });
    sheetEl.appendChild(grid); renderValues(); updateSelection();
  }
  function header(cls, text, index) {
    var el = document.createElement('div'); el.className = cls; el.textContent = text; el.title = 'Right-click for insert/delete';
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); if (cls === 'row-header') rowMenu(index); else colMenu(index); });
    return el;
  }
  function renderValues() {
    Object.keys(nodes).forEach(function (a) {
      var result = evaluateCell(a, model);
      nodes[a].textContent = result.display;
      nodes[a].classList.toggle('number', result.type === 'number');
      nodes[a].classList.toggle('error', result.type === 'error');
    });
  }
  function updateSelection() {
    var b = selectedBounds();
    Object.keys(nodes).forEach(function (a) {
      var p = parseAddr(a), inRange = p.row >= b.r1 && p.row <= b.r2 && p.col >= b.c1 && p.col <= b.c2;
      nodes[a].classList.toggle('in-range', inRange);
      nodes[a].classList.toggle('active', p.row === selected.row && p.col === selected.col);
    });
    cellName.textContent = addr(selected.row, selected.col);
    formulaBar.value = cells[addr(selected.row, selected.col)] || '';
    save();
  }
  function select(r, c, extend) {
    r = Math.max(0, Math.min(ROWS - 1, r)); c = Math.max(0, Math.min(COLS - 1, c));
    if (extend) { selected.row2 = r; selected.col2 = c; } else selected = { row: r, col: c, row2: r, col2: c };
    updateSelection(); nodes[addr(r, c)].focus();
  }
  function onMouseDown(e) { var r = Number(e.currentTarget.dataset.row), c = Number(e.currentTarget.dataset.col); dragStart = { row: selected.row, col: selected.col }; select(r, c, e.shiftKey); }
  function onMouseEnter(e) { if (dragStart) select(Number(e.currentTarget.dataset.row), Number(e.currentTarget.dataset.col), true); }
  function beginEdit(r, c, preserve, initial) {
    select(r, c, false);
    var node = nodes[addr(r, c)], raw = cells[addr(r, c)] || '';
    node.classList.add('editing'); node.textContent = '';
    var input = document.createElement('input'); input.className = 'cell-input'; input.value = preserve ? raw : (initial || '');
    node.appendChild(input); editing = { input: input, row: r, col: c, before: raw }; input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', editKeys);
  }
  function commitEdit(moveRow, moveCol) {
    if (!editing) return;
    var before = snapshot(); setRaw(editing.row, editing.col, editing.input.value); cleanupEdit(); renderValues(); pushHistory(before); select(selected.row + moveRow, selected.col + moveCol, false);
  }
  function cancelEdit() { if (!editing) return; cleanupEdit(); renderValues(); updateSelection(); }
  function cleanupEdit() { nodes[addr(editing.row, editing.col)].classList.remove('editing'); editing = null; }
  function editKeys(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(1, 0); }
    if (e.key === 'Tab') { e.preventDefault(); commitEdit(0, 1); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }
  function writeRange(writer) { var before = snapshot(); writer(); renderValues(); pushHistory(before); updateSelection(); }
  function clearSelection() { writeRange(function () { var b = selectedBounds(); for (var r = b.r1; r <= b.r2; r++) for (var c = b.c1; c <= b.c2; c++) setRaw(r, c, ''); }); }
  function copy(cut) {
    var b = selectedBounds(), data = [];
    for (var r = b.r1; r <= b.r2; r++) { var row = []; for (var c = b.c1; c <= b.c2; c++) row.push(cells[addr(r, c)] || ''); data.push(row); }
    clipboard = { data: data, source: b, cut: cut };
    navigator.clipboard && navigator.clipboard.writeText(data.map(function (row) { return row.join('\t'); }).join('\n')).catch(function () {});
  }
  function pasteText(text) {
    var data = clipboard && clipboard.data ? clipboard.data : text.split(/\r?\n/).map(function (r) { return r.split('\t'); });
    var target = selectedBounds();
    var selectedRows = target.r2 - target.r1 + 1;
    var selectedCols = target.c2 - target.c1 + 1;
    var rows = selectedRows === 1 && selectedCols === 1 ? data.length : selectedRows;
    var cols = selectedRows === 1 && selectedCols === 1 ? data[0].length : selectedCols;
    writeRange(function () {
      if (clipboard && clipboard.cut) {
        for (var cr = clipboard.source.r1; cr <= clipboard.source.r2; cr++) for (var cc = clipboard.source.c1; cc <= clipboard.source.c2; cc++) setRaw(cr, cc, '');
      }
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var raw = data[r % data.length][c % data[r % data.length].length], targetR = selected.row + r, targetC = selected.col + c;
        if (targetR < ROWS && targetC < COLS) setRaw(targetR, targetC, clipboard ? shiftFormula(raw, targetR - clipboard.source.r1, targetC - clipboard.source.c1) : raw);
      }
    });
    if (clipboard && clipboard.cut) clipboard = null;
  }
  function undo() { var x = undoStack.pop(); if (x) { redoStack.push({ before: snapshot(), after: x.after }); restore(x.before); } }
  function redo() { var x = redoStack.pop(); if (x) { undoStack.push({ before: snapshot(), after: x.after }); restore(x.after); } }
  function rowMenu(row) { var choice = prompt('Row ' + (row + 1) + ': type insert above, insert below, or delete'); if (!choice) return; writeRange(function () { shiftRows(row + (/below/i.test(choice) ? 1 : 0), /delete/i.test(choice) ? -1 : 1); }); }
  function colMenu(col) { var choice = prompt('Column ' + colToName(col) + ': type insert left, insert right, or delete'); if (!choice) return; writeRange(function () { shiftCols(col + (/right/i.test(choice) ? 1 : 0), /delete/i.test(choice) ? -1 : 1); }); }
  function shiftRows(at, delta) {
    var next = {};
    Object.keys(cells).forEach(function (a) { var p = parseAddr(a); if (delta < 0 && p.row === at) return; var nr = p.row >= at ? p.row + delta : p.row; if (nr >= 0 && nr < ROWS) next[addr(nr, p.col)] = adjustForInsertDelete(cells[a], at, delta, true); });
    cells = next;
  }
  function shiftCols(at, delta) {
    var next = {};
    Object.keys(cells).forEach(function (a) { var p = parseAddr(a); if (delta < 0 && p.col === at) return; var nc = p.col >= at ? p.col + delta : p.col; if (nc >= 0 && nc < COLS) next[addr(p.row, nc)] = adjustForInsertDelete(cells[a], at, delta, false); });
    cells = next;
  }
  function adjustForInsertDelete(raw, at, delta, rows) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z])(\$?)(\d+)/g, function (m, ac, col, ar, row) {
      var c = letters.indexOf(col), r = Number(row) - 1, target = rows ? r : c;
      if (delta < 0 && target === at) return '#REF!';
      if (target >= at) rows ? r += delta : c += delta;
      return c < 0 || c >= COLS || r < 0 || r >= ROWS ? '#REF!' : ac + colToName(c) + ar + (r + 1);
    });
  }
  formulaBar.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var before = snapshot(); setRaw(selected.row, selected.col, formulaBar.value); renderValues(); pushHistory(before); select(selected.row + 1, selected.col, false); } });
  formulaBar.addEventListener('input', function () { setRaw(selected.row, selected.col, formulaBar.value); renderValues(); save(); });
  document.addEventListener('keydown', function (e) {
    if (editing) { editKeys(e); return; }
    if (e.target === formulaBar) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(false); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(true); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); navigator.clipboard ? navigator.clipboard.readText().then(pasteText).catch(function () { pasteText(''); }) : pasteText(''); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelection(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit(selected.row, selected.col, true); return; }
    if (e.key === 'Tab') { e.preventDefault(); select(selected.row, selected.col + 1, false); return; }
    if (e.key.indexOf('Arrow') === 0) { e.preventDefault(); select(selected.row + (e.key === 'ArrowDown') - (e.key === 'ArrowUp'), selected.col + (e.key === 'ArrowRight') - (e.key === 'ArrowLeft'), e.shiftKey); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) beginEdit(selected.row, selected.col, false, e.key);
  });
  renderGrid();
})();
