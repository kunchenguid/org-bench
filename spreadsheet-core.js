(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpreadsheetCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = 26;
  const ROWS = 100;

  function colName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      name = String.fromCharCode(65 + r) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function colIndex(name) {
    let n = 0;
    for (const ch of name.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function addr(row, col) { return `${colName(col)}${row + 1}`; }

  function parseRef(ref) {
    const m = /^([$]?)([A-Z]+)([$]?)(\d+)$/i.exec(ref);
    if (!m) return null;
    return { colAbs: !!m[1], col: colIndex(m[2]), rowAbs: !!m[3], row: Number(m[4]) - 1 };
  }

  function formatRef(ref) {
    if (ref.row < 0 || ref.col < 0 || ref.row >= ROWS || ref.col >= COLS) return '#REF!';
    return `${ref.colAbs ? '$' : ''}${colName(ref.col)}${ref.rowAbs ? '$' : ''}${ref.row + 1}`;
  }

  function adjustFormulaReferences(formula, rowDelta, colDelta) {
    if (!formula || formula[0] !== '=') return formula;
    return formula.replace(/(\$?[A-Z]+\$?\d+)/gi, (token) => {
      const ref = parseRef(token);
      if (!ref) return token;
      if (!ref.rowAbs) ref.row += rowDelta;
      if (!ref.colAbs) ref.col += colDelta;
      return formatRef(ref);
    });
  }

  function shiftFormulaForInsert(formula, type, index) {
    if (!formula || formula[0] !== '=') return formula;
    return formula.replace(/(\$?[A-Z]+\$?\d+)/gi, (token) => {
      const ref = parseRef(token);
      if (!ref) return token;
      if (type === 'row' && ref.row >= index) ref.row += 1;
      if (type === 'col' && ref.col >= index) ref.col += 1;
      return formatRef(ref);
    });
  }

  function shiftFormulaForDelete(formula, type, index) {
    if (!formula || formula[0] !== '=') return formula;
    return formula.replace(/(\$?[A-Z]+\$?\d+)/gi, (token) => {
      const ref = parseRef(token);
      if (!ref) return token;
      if (type === 'row') {
        if (ref.row === index) return '#REF!';
        if (ref.row > index) ref.row -= 1;
      }
      if (type === 'col') {
        if (ref.col === index) return '#REF!';
        if (ref.col > index) ref.col -= 1;
      }
      return formatRef(ref);
    });
  }

  function flatten(values) {
    const out = [];
    values.forEach((v) => Array.isArray(v) ? out.push(...flatten(v)) : out.push(v));
    return out;
  }

  function toNumber(value) {
    if (value === true) return 1;
    if (value === false || value == null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function toDisplay(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    return value == null ? '' : String(value);
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '"') {
        let s = '';
        i += 1;
        while (i < input.length && input[i] !== '"') s += input[i++];
        if (input[i] !== '"') throw new Error('#ERR!');
        i += 1;
        tokens.push({ type: 'string', value: s });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&=(),:<>'.includes(ch)) { tokens.push({ type: ch === ',' || ch === '(' || ch === ')' || ch === ':' ? ch : 'op', value: ch }); i += 1; continue; }
      const num = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const word = /^(?:\$?[A-Z]+\$?\d+|[A-Z_][A-Z0-9_]*)/i.exec(input.slice(i));
      if (word) { tokens.push({ type: 'word', value: word[0].toUpperCase() }); i += word[0].length; continue; }
      throw new Error('#ERR!');
    }
    return tokens;
  }

  class Parser {
    constructor(tokens, model, visiting) { this.tokens = tokens; this.i = 0; this.model = model; this.visiting = visiting; }
    peek() { return this.tokens[this.i]; }
    take(value) { const t = this.peek(); if (t && (t.value === value || t.type === value)) { this.i += 1; return t; } return null; }
    expect(value) { const t = this.take(value); if (!t) throw new Error('#ERR!'); return t; }
    parse() { const v = this.comparison(); if (this.peek()) throw new Error('#ERR!'); return v; }
    comparison() {
      let left = this.concat();
      while (this.peek() && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
        const op = this.peek().value; this.i += 1;
        const right = this.concat();
        const a = typeof left === 'number' && typeof right === 'number' ? left : String(left);
        const b = typeof left === 'number' && typeof right === 'number' ? right : String(right);
        if (op === '=') left = a === b;
        if (op === '<>') left = a !== b;
        if (op === '<') left = a < b;
        if (op === '<=') left = a <= b;
        if (op === '>') left = a > b;
        if (op === '>=') left = a >= b;
      }
      return left;
    }
    concat() {
      let left = this.sum();
      while (this.take('&')) left = String(toDisplay(left)) + String(toDisplay(this.sum()));
      return left;
    }
    sum() {
      let left = this.product();
      while (this.peek() && ['+', '-'].includes(this.peek().value)) {
        const op = this.peek().value; this.i += 1;
        const right = this.product();
        left = op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
      }
      return left;
    }
    product() {
      let left = this.unary();
      while (this.peek() && ['*', '/'].includes(this.peek().value)) {
        const op = this.peek().value; this.i += 1;
        const right = this.unary();
        if (op === '/' && toNumber(right) === 0) throw new Error('#DIV/0!');
        left = op === '*' ? toNumber(left) * toNumber(right) : toNumber(left) / toNumber(right);
      }
      return left;
    }
    unary() {
      if (this.take('-')) return -toNumber(this.unary());
      return this.primary();
    }
    primary() {
      const t = this.peek();
      if (!t) throw new Error('#ERR!');
      if (this.take('(')) { const v = this.comparison(); this.expect(')'); return v; }
      if (t.type === 'number' || t.type === 'string') { this.i += 1; return t.value; }
      if (t.type === 'word') {
        this.i += 1;
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        const ref = parseRef(t.value);
        if (ref && this.take(':')) return this.range(ref, this.expect('word').value);
        if (ref) return this.model.evaluateCell(ref.row, ref.col, this.visiting);
        if (this.take('(')) return this.call(t.value);
      }
      throw new Error('#ERR!');
    }
    range(start, endToken) {
      const end = parseRef(endToken);
      if (!end) throw new Error('#REF!');
      const values = [];
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r += 1) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c += 1) values.push(this.model.evaluateCell(r, c, this.visiting));
      }
      return values;
    }
    call(name) {
      const args = [];
      if (!this.take(')')) {
        do { args.push(this.comparison()); } while (this.take(','));
        this.expect(')');
      }
      const vals = flatten(args);
      if (name === 'SUM') return vals.reduce((s, v) => s + toNumber(v), 0);
      if (name === 'AVERAGE') return vals.length ? vals.reduce((s, v) => s + toNumber(v), 0) / vals.length : 0;
      if (name === 'MIN') return Math.min(...vals.map(toNumber));
      if (name === 'MAX') return Math.max(...vals.map(toNumber));
      if (name === 'COUNT') return vals.filter((v) => v !== '' && Number.isFinite(Number(v))).length;
      if (name === 'IF') return args[0] ? args[1] : args[2];
      if (name === 'AND') return vals.every(Boolean);
      if (name === 'OR') return vals.some(Boolean);
      if (name === 'NOT') return !args[0];
      if (name === 'ABS') return Math.abs(toNumber(args[0]));
      if (name === 'ROUND') return Number(toNumber(args[0]).toFixed(args[1] == null ? 0 : toNumber(args[1])));
      if (name === 'CONCAT') return vals.map(toDisplay).join('');
      throw new Error('#NAME?');
    }
  }

  class SpreadsheetModel {
    constructor(options) {
      this.storage = options && options.storage;
      this.storageKey = options && options.storageKey || 'amazon-sheet:v1';
      this.cells = {};
      this.selected = { row: 0, col: 0 };
      this.undoStack = [];
      this.redoStack = [];
      this.load();
    }
    key(row, col) { return `${row},${col}`; }
    rawAt(row, col) { return this.cells[this.key(row, col)] || ''; }
    getRaw(a) { const r = typeof a === 'string' ? parseRef(a) : a; return this.rawAt(r.row, r.col); }
    setCell(a, value, opts) {
      const r = typeof a === 'string' ? parseRef(a) : a;
      this.applyChanges([{ row: r.row, col: r.col, value }], opts);
    }
    applyChanges(changes, opts) {
      const beforeByKey = new Map();
      const afterByKey = new Map();
      changes.forEach((c) => {
        const k = this.key(c.row, c.col);
        if (!beforeByKey.has(k)) beforeByKey.set(k, { row: c.row, col: c.col, value: this.rawAt(c.row, c.col) });
        afterByKey.set(k, { row: c.row, col: c.col, value: c.value });
      });
      const before = Array.from(beforeByKey.values());
      const after = Array.from(afterByKey.values());
      after.forEach((c) => { const k = this.key(c.row, c.col); if (c.value) this.cells[k] = String(c.value); else delete this.cells[k]; });
      if (!opts || !opts.silent) this.pushUndo(before, after);
      this.save();
    }
    pushUndo(before, after) {
      this.undoStack.push({ before, after });
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }
    undo() { const a = this.undoStack.pop(); if (!a) return; this.applyChanges(a.before, { silent: true }); this.redoStack.push(a); }
    redo() { const a = this.redoStack.pop(); if (!a) return; this.applyChanges(a.after, { silent: true }); this.undoStack.push(a); }
    clearRange(r1, c1, r2, c2) {
      const changes = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) changes.push({ row: r, col: c, value: '' });
      this.applyChanges(changes);
    }
    copyRange(r1, c1, r2, c2) {
      const out = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
        const row = [];
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) row.push(this.rawAt(r, c));
        out.push(row);
      }
      return out;
    }
    pasteRange(startRow, startCol, block, source, target) {
      const changes = [];
      const rows = target && target.rows ? target.rows : block.length;
      const cols = target && target.cols ? target.cols : block[0].length;
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
        const raw = block[r % block.length][c % block[r % block.length].length];
        const value = source ? adjustFormulaReferences(raw, startRow + r - source.row, startCol + c - source.col) : raw;
        if (startRow + r < ROWS && startCol + c < COLS) changes.push({ row: startRow + r, col: startCol + c, value });
      }
      this.applyChanges(changes);
    }
    moveRange(r1, c1, r2, c2, toRow, toCol) {
      const source = this.copyRange(r1, c1, r2, c2);
      const rows = source.length;
      const cols = source[0].length;
      const changes = [];
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) changes.push({ row: Math.min(r1, r2) + r, col: Math.min(c1, c2) + c, value: '' });
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
        const row = toRow + r, col = toCol + c;
        if (row < ROWS && col < COLS) changes.push({ row, col, value: adjustFormulaReferences(source[r][c], row - (Math.min(r1, r2) + r), col - (Math.min(c1, c2) + c)) });
      }
      this.applyChanges(changes);
    }
    insertRow(index) { this.shiftGrid('row', index, 1); }
    deleteRow(index) { this.shiftGrid('row', index, -1); }
    insertColumn(index) { this.shiftGrid('col', index, 1); }
    deleteColumn(index) { this.shiftGrid('col', index, -1); }
    shiftGrid(type, index, dir) {
      const before = Object.keys(this.cells).map((k) => { const [row, col] = k.split(',').map(Number); return { row, col, value: this.cells[k] }; });
      const next = {};
      before.forEach((cell) => {
        let row = cell.row, col = cell.col;
        if (type === 'row' && row >= index) row += dir;
        if (type === 'col' && col >= index) col += dir;
        if (dir < 0 && ((type === 'row' && cell.row === index) || (type === 'col' && cell.col === index))) return;
        if (row >= 0 && row < ROWS && col >= 0 && col < COLS) next[this.key(row, col)] = cell.value;
      });
      Object.keys(next).forEach((k) => { next[k] = dir > 0 ? shiftFormulaForInsert(next[k], type, index) : shiftFormulaForDelete(next[k], type, index); });
      this.cells = next;
      const after = Object.keys(this.cells).map((k) => { const [row, col] = k.split(',').map(Number); return { row, col, value: this.cells[k] }; });
      this.pushUndo(before, after);
      this.save();
    }
    evaluateCell(row, col, visiting) {
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return { error: '#REF!' };
      const k = this.key(row, col);
      if (visiting && visiting.has(k)) return { error: '#CIRC!' };
      const raw = this.rawAt(row, col);
      if (!raw) return 0;
      if (raw[0] !== '=') {
        const n = Number(raw);
        return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
      }
      if (raw.includes('#REF!')) return { error: '#REF!' };
      const next = new Set(visiting || []);
      next.add(k);
      try {
        const value = new Parser(tokenize(raw.slice(1)), this, next).parse();
        return value && value.error ? value : value;
      } catch (e) { return { error: e.message && e.message[0] === '#' ? e.message : '#ERR!' }; }
    }
    getDisplay(a) {
      const r = typeof a === 'string' ? parseRef(a) : a;
      if (this.rawAt(r.row, r.col) === '') return '';
      return toDisplay(this.evaluateCell(r.row, r.col, new Set()));
    }
    save() {
      if (!this.storage) return;
      this.storage.setItem(this.storageKey, JSON.stringify({ cells: this.cells, selected: this.selected }));
    }
    load() {
      if (!this.storage) return;
      try {
        const data = JSON.parse(this.storage.getItem(this.storageKey) || '{}');
        this.cells = data.cells || {};
        this.selected = data.selected || this.selected;
      } catch (_) {}
    }
  }

  return { COLS, ROWS, SpreadsheetModel, adjustFormulaReferences, addr, colName, parseRef };
});
