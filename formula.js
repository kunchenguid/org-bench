(function (global) {
  var COLS = 26;
  var ROWS = 100;

  function colName(index) {
    var s = '';
    index += 1;
    while (index > 0) {
      var r = (index - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      index = Math.floor((index - 1) / 26);
    }
    return s;
  }

  function colIndex(name) {
    var n = 0;
    for (var i = 0; i < name.length; i++) n = n * 26 + name.charCodeAt(i) - 64;
    return n - 1;
  }

  function parseAddr(addr) {
    var m = /^([A-Z]+)([0-9]+)$/.exec(addr);
    if (!m) return null;
    return { row: parseInt(m[2], 10) - 1, col: colIndex(m[1]) };
  }

  function addr(row, col) { return colName(col) + (row + 1); }

  function normalizeCellKey(key) {
    key = String(key || '').toUpperCase().replace(/\$/g, '');
    return parseAddr(key) ? key : null;
  }

  function num(v) {
    if (v === true) return 1;
    if (v === false || v == null || v === '') return 0;
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function text(v) {
    if (v == null) return '';
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    return String(v);
  }

  function displayValue(v) {
    if (v && v.error) return v.error;
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (v == null) return '';
    if (typeof v === 'number' && Math.abs(v - Math.round(v)) < 1e-10) return String(Math.round(v));
    return String(v);
  }

  function Tokenizer(input) {
    this.input = input;
    this.i = 0;
    this.t = null;
    this.next();
  }
  Tokenizer.prototype.next = function () {
    var s = this.input;
    while (this.i < s.length && /\s/.test(s[this.i])) this.i++;
    if (this.i >= s.length) return this.t = { type: 'eof', value: '' };
    var ch = s[this.i];
    var two = s.slice(this.i, this.i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { this.i += 2; return this.t = { type: 'op', value: two }; }
    if ('+-*/&(),:<>= '.indexOf(ch) >= 0) { this.i++; return this.t = { type: ch === ',' || ch === '(' || ch === ')' || ch === ':' ? ch : 'op', value: ch }; }
    if (ch === '"') {
      var j = ++this.i, v = '';
      while (j < s.length && s[j] !== '"') { v += s[j++]; }
      this.i = j + 1;
      return this.t = { type: 'string', value: v };
    }
    if (/[0-9.]/.test(ch)) {
      var n0 = this.i++;
      while (this.i < s.length && /[0-9.]/.test(s[this.i])) this.i++;
      return this.t = { type: 'number', value: Number(s.slice(n0, this.i)) };
    }
    if (/[A-Za-z$]/.test(ch)) {
      var a0 = this.i++;
      while (this.i < s.length && /[A-Za-z0-9$]/.test(s[this.i])) this.i++;
      return this.t = { type: 'id', value: s.slice(a0, this.i).toUpperCase() };
    }
    this.i++;
    return this.t = { type: 'bad', value: ch };
  };

  function Parser(sheet, origin, stack) {
    this.sheet = sheet;
    this.origin = origin;
    this.stack = stack || {};
  }
  Parser.prototype.parse = function (input) {
    this.tok = new Tokenizer(input);
    var v = this.compare();
    if (this.tok.t.type !== 'eof') throw '#ERR!';
    return v;
  };
  Parser.prototype.eat = function (type, value) {
    if (this.tok.t.type === type && (value == null || this.tok.t.value === value)) { this.tok.next(); return true; }
    return false;
  };
  Parser.prototype.compare = function () {
    var left = this.concat();
    while (this.tok.t.type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.tok.t.value) >= 0) {
      var op = this.tok.t.value; this.tok.next();
      var right = this.concat();
      if (op === '=') left = text(left) === text(right);
      else if (op === '<>') left = text(left) !== text(right);
      else if (op === '<') left = num(left) < num(right);
      else if (op === '<=') left = num(left) <= num(right);
      else if (op === '>') left = num(left) > num(right);
      else left = num(left) >= num(right);
    }
    return left;
  };
  Parser.prototype.concat = function () {
    var left = this.add();
    while (this.eat('op', '&')) left = text(left) + text(this.add());
    return left;
  };
  Parser.prototype.add = function () {
    var left = this.mul();
    while (this.tok.t.type === 'op' && (this.tok.t.value === '+' || this.tok.t.value === '-')) {
      var op = this.tok.t.value; this.tok.next();
      var right = this.mul();
      left = op === '+' ? num(left) + num(right) : num(left) - num(right);
    }
    return left;
  };
  Parser.prototype.mul = function () {
    var left = this.unary();
    while (this.tok.t.type === 'op' && (this.tok.t.value === '*' || this.tok.t.value === '/')) {
      var op = this.tok.t.value; this.tok.next();
      var right = this.unary();
      if (op === '/' && num(right) === 0) throw '#DIV/0!';
      left = op === '*' ? num(left) * num(right) : num(left) / num(right);
    }
    return left;
  };
  Parser.prototype.unary = function () {
    if (this.eat('op', '-')) return -num(this.unary());
    return this.primary();
  };
  Parser.prototype.primary = function () {
    var t = this.tok.t;
    if (this.eat('number')) return t.value;
    if (this.eat('string')) return t.value;
    if (this.eat('(')) { var v = this.compare(); if (!this.eat(')')) throw '#ERR!'; return v; }
    if (t.type === 'id') {
      this.tok.next();
      if (t.value === 'TRUE') return true;
      if (t.value === 'FALSE') return false;
      if (this.eat('(')) return this.func(t.value);
      var start = normalizeCellKey(t.value);
      if (!start) throw '#NAME?';
      if (this.eat(':')) {
        if (this.tok.t.type !== 'id') throw '#REF!';
        var end = normalizeCellKey(this.tok.t.value); this.tok.next();
        if (!end) throw '#REF!';
        return { range: this.sheet.valuesInRange(start, end, this.stack) };
      }
      return this.sheet.valueOf(start, this.stack);
    }
    throw '#ERR!';
  };
  Parser.prototype.args = function () {
    var args = [];
    if (this.eat(')')) return args;
    do { args.push(this.compare()); } while (this.eat(','));
    if (!this.eat(')')) throw '#ERR!';
    return args;
  };
  Parser.prototype.func = function (name) {
    var args = this.args();
    var flat = [];
    args.forEach(function (a) { if (a && a.range) flat = flat.concat(a.range); else flat.push(a); });
    if (name === 'SUM') return flat.reduce(function (s, v) { return s + num(v); }, 0);
    if (name === 'AVERAGE') return flat.length ? flat.reduce(function (s, v) { return s + num(v); }, 0) / flat.length : 0;
    if (name === 'MIN') return Math.min.apply(Math, flat.map(num));
    if (name === 'MAX') return Math.max.apply(Math, flat.map(num));
    if (name === 'COUNT') return flat.filter(function (v) { return v !== '' && !isNaN(Number(v)); }).length;
    if (name === 'IF') return args[0] ? args[1] : args[2];
    if (name === 'AND') return flat.every(Boolean);
    if (name === 'OR') return flat.some(Boolean);
    if (name === 'NOT') return !args[0];
    if (name === 'ABS') return Math.abs(num(args[0]));
    if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
    if (name === 'CONCAT') return flat.map(text).join('');
    throw '#NAME?';
  };

  function SheetModel(cols, rows, namespace) {
    this.cols = cols || COLS;
    this.rows = rows || ROWS;
    this.namespace = namespace || 'sheet';
    this.cells = {};
    this.selection = { row: 0, col: 0, row2: 0, col2: 0 };
    this.undoStack = [];
    this.redoStack = [];
  }
  SheetModel.prototype.snapshot = function () { return JSON.parse(JSON.stringify({ cells: this.cells, selection: this.selection })); };
  SheetModel.prototype.restore = function (snap) { this.cells = snap.cells || {}; this.selection = snap.selection || this.selection; };
  SheetModel.prototype.pushHistory = function () { this.undoStack.push(this.snapshot()); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack = []; };
  SheetModel.prototype.setCell = function (key, raw, noHistory) { key = normalizeCellKey(key); if (!key) return; if (!noHistory) this.pushHistory(); if (raw == null || raw === '') delete this.cells[key]; else this.cells[key] = String(raw); };
  SheetModel.prototype.getRaw = function (key) { return this.cells[normalizeCellKey(key)] || ''; };
  SheetModel.prototype.getDisplay = function (key) { return displayValue(this.valueOf(normalizeCellKey(key), {})); };
  SheetModel.prototype.valueOf = function (key, stack) {
    if (!key) return { error: '#REF!' };
    if (stack[key]) return { error: '#CIRC!' };
    var raw = this.getRaw(key);
    if (raw === '') return '';
    if (raw.charAt(0) !== '=') {
      var n = Number(raw);
      return raw.trim() !== '' && !isNaN(n) ? n : raw;
    }
    var nextStack = Object.assign({}, stack); nextStack[key] = true;
    try {
      var v = new Parser(this, key, nextStack).parse(raw.slice(1));
      return v && v.error ? v : v;
    } catch (err) { return { error: typeof err === 'string' ? err : '#ERR!' }; }
  };
  SheetModel.prototype.valuesInRange = function (a, b, stack) {
    var p1 = parseAddr(a), p2 = parseAddr(b), vals = [];
    if (!p1 || !p2) return [{ error: '#REF!' }];
    for (var r = Math.min(p1.row, p2.row); r <= Math.max(p1.row, p2.row); r++) {
      for (var c = Math.min(p1.col, p2.col); c <= Math.max(p1.col, p2.col); c++) vals.push(this.valueOf(addr(r, c), stack));
    }
    return vals;
  };
  SheetModel.prototype.copyRange = function (fromA, fromB, toA, cut) {
    var p1 = parseAddr(fromA), p2 = parseAddr(fromB), dst = parseAddr(toA);
    if (!p1 || !p2 || !dst) return;
    this.pushHistory();
    var top = Math.min(p1.row, p2.row), left = Math.min(p1.col, p2.col);
    var bottom = Math.max(p1.row, p2.row), right = Math.max(p1.col, p2.col);
    var writes = [];
    for (var r = top; r <= bottom; r++) for (var c = left; c <= right; c++) {
      var raw = this.getRaw(addr(r, c));
      writes.push({ key: addr(dst.row + r - top, dst.col + c - left), raw: adjustFormula(raw, dst.row - top, dst.col - left) });
      if (cut) delete this.cells[addr(r, c)];
    }
    writes.forEach(function (w) { if (w.raw) this.cells[w.key] = w.raw; else delete this.cells[w.key]; }, this);
  };
  SheetModel.prototype.clearRange = function (a, b) {
    var p1 = parseAddr(a), p2 = parseAddr(b); if (!p1 || !p2) return;
    this.pushHistory();
    for (var r = Math.min(p1.row, p2.row); r <= Math.max(p1.row, p2.row); r++) for (var c = Math.min(p1.col, p2.col); c <= Math.max(p1.col, p2.col); c++) delete this.cells[addr(r, c)];
  };
  SheetModel.prototype.undo = function () { if (!this.undoStack.length) return false; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); return true; };
  SheetModel.prototype.redo = function () { if (!this.redoStack.length) return false; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); return true; };
  SheetModel.prototype.insertRow = function (row) { this.pushHistory(); shiftCells(this, row, 0, 1, 0); };
  SheetModel.prototype.deleteRow = function (row) { this.pushHistory(); deleteLine(this, row, true); };
  SheetModel.prototype.insertCol = function (col) { this.pushHistory(); shiftCells(this, 0, col, 0, 1); };
  SheetModel.prototype.deleteCol = function (col) { this.pushHistory(); deleteLine(this, col, false); };
  SheetModel.prototype.save = function () { localStorage.setItem(this.namespace + ':sheet', JSON.stringify(this.snapshot())); };
  SheetModel.prototype.load = function () { var raw = localStorage.getItem(this.namespace + ':sheet'); if (raw) this.restore(JSON.parse(raw)); };

  function adjustFormula(raw, dr, dc) {
    if (!raw || raw.charAt(0) !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)([0-9]+)/g, function (_, absC, c, absR, r) {
      var col = absC ? colIndex(c) : colIndex(c) + dc;
      var row = absR ? parseInt(r, 10) - 1 : parseInt(r, 10) - 1 + dr;
      if (col < 0 || row < 0) return '#REF!';
      return (absC ? '$' : '') + colName(col) + (absR ? '$' : '') + (row + 1);
    });
  }
  function mapFormulaRefs(raw, mapper) {
    if (!raw || raw.charAt(0) !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)([0-9]+)/g, function (_, absC, c, absR, r) {
      var mapped = mapper(parseInt(r, 10) - 1, colIndex(c));
      if (!mapped) return '#REF!';
      return (absC ? '$' : '') + colName(mapped.col) + (absR ? '$' : '') + (mapped.row + 1);
    });
  }
  function adjustFormulaForInsert(raw, startRow, startCol, dr, dc) {
    return mapFormulaRefs(raw, function (row, col) {
      if (dr && row >= startRow) row += dr;
      if (dc && col >= startCol) col += dc;
      return { row: row, col: col };
    });
  }
  function adjustFormulaForDelete(raw, index, isRow) {
    return mapFormulaRefs(raw, function (row, col) {
      if (isRow) {
        if (row === index) return null;
        if (row > index) row--;
      } else {
        if (col === index) return null;
        if (col > index) col--;
      }
      return { row: row, col: col };
    });
  }
  function shiftCells(sheet, startRow, startCol, dr, dc) {
    var next = {};
    Object.keys(sheet.cells).forEach(function (k) {
      var p = parseAddr(k), nr = p.row, nc = p.col;
      if (dr && p.row >= startRow) nr += dr;
      if (dc && p.col >= startCol) nc += dc;
      next[addr(nr, nc)] = adjustFormulaForInsert(sheet.cells[k], startRow, startCol, dr, dc);
    });
    sheet.cells = next;
  }
  function deleteLine(sheet, index, isRow) {
    var next = {};
    Object.keys(sheet.cells).forEach(function (k) {
      var p = parseAddr(k);
      if ((isRow && p.row === index) || (!isRow && p.col === index)) return;
      if (isRow && p.row > index) p.row--;
      if (!isRow && p.col > index) p.col--;
      next[addr(p.row, p.col)] = adjustFormulaForDelete(sheet.cells[k], index, isRow);
    });
    sheet.cells = next;
  }

  global.SheetModel = SheetModel;
  global.SheetUtils = { addr: addr, parseAddr: parseAddr, colName: colName, adjustFormula: adjustFormula };
})(this);
