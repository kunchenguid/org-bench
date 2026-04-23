(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Spreadsheet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ERR = '#ERR!';
  const REF = '#REF!';
  const CIRC = '#CIRC!';

  function colToName(col) {
    let n = col + 1;
    let out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function nameToCol(name) {
    let n = 0;
    for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function parseCellAddress(address) {
    const m = /^([A-Z]+)(\d+)$/.exec(address.toUpperCase());
    if (!m) throw new Error('bad address');
    return { row: Number(m[2]) - 1, col: nameToCol(m[1]) };
  }

  function formatCellAddress(cell) {
    return colToName(cell.col) + String(cell.row + 1);
  }

  function isError(v) {
    return typeof v === 'string' && v[0] === '#';
  }

  function display(v) {
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
    return String(v);
  }

  function scalar(v) {
    if (Array.isArray(v)) return v.flat(Infinity)[0] ?? 0;
    return v;
  }

  function num(v) {
    v = scalar(v);
    if (isError(v)) return v;
    if (v === true) return 1;
    if (v === false || v === '' || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function truthy(v) {
    v = scalar(v);
    if (isError(v)) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return String(v).length > 0;
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let s = '';
        i++;
        while (i < input.length && input[i] !== '"') s += input[i++];
        if (input[i] !== '"') throw new Error('string');
        i++;
        tokens.push({ type: 'string', value: s });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&=(),:<>'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      const numMatch = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (numMatch) { tokens.push({ type: 'number', value: Number(numMatch[0]) }); i += numMatch[0].length; continue; }
      const refMatch = /^\$?[A-Z]+\$?\d+/i.exec(input.slice(i));
      if (refMatch) { tokens.push({ type: 'ref', value: refMatch[0].toUpperCase() }); i += refMatch[0].length; continue; }
      const nameMatch = /^[A-Z_][A-Z0-9_]*/i.exec(input.slice(i));
      if (nameMatch) { tokens.push({ type: 'name', value: nameMatch[0].toUpperCase() }); i += nameMatch[0].length; continue; }
      throw new Error('token');
    }
    return tokens;
  }

  class Parser {
    constructor(model, cell, text, stack) {
      this.model = model;
      this.cell = cell;
      this.tokens = tokenize(text);
      this.i = 0;
      this.stack = stack;
    }
    peek(v) { return this.tokens[this.i] && (!v || this.tokens[this.i].value === v) ? this.tokens[this.i] : null; }
    take(v) { const t = this.peek(v); if (t) this.i++; return t; }
    need(v) { if (!this.take(v)) throw new Error('expected ' + v); }
    parse() { const v = this.compare(); if (this.i !== this.tokens.length) throw new Error('tail'); return v; }
    compare() {
      let left = this.concat();
      while (this.peek() && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
        const op = this.tokens[this.i++].value;
        const right = this.concat();
        if (isError(left)) return left;
        if (isError(right)) return right;
        const a = scalar(left), b = scalar(right);
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
      let left = this.add();
      while (this.take('&')) {
        const right = this.add();
        if (isError(left)) return left;
        if (isError(right)) return right;
        left = display(scalar(left)) + display(scalar(right));
      }
      return left;
    }
    add() {
      let left = this.mul();
      while (this.peek('+') || this.peek('-')) {
        const op = this.tokens[this.i++].value;
        const right = this.mul();
        left = this.math(left, right, op);
      }
      return left;
    }
    mul() {
      let left = this.unary();
      while (this.peek('*') || this.peek('/')) {
        const op = this.tokens[this.i++].value;
        const right = this.unary();
        left = this.math(left, right, op);
      }
      return left;
    }
    math(a, b, op) {
      a = num(a); b = num(b);
      if (isError(a)) return a;
      if (isError(b)) return b;
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (op === '/') return b === 0 ? '#DIV/0!' : a / b;
      return ERR;
    }
    unary() {
      if (this.take('-')) {
        const v = num(this.unary());
        return isError(v) ? v : -v;
      }
      return this.primary();
    }
    primary() {
      const t = this.tokens[this.i++];
      if (!t) throw new Error('missing');
      if (t.type === 'number' || t.type === 'string') return t.value;
      if (t.type === 'name') {
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        if (this.take('(')) return this.fn(t.value);
        throw new Error('name');
      }
      if (t.type === 'ref') {
        if (t.value === REF) return REF;
        const start = refTokenToCell(t.value);
        if (this.take(':')) {
          const endTok = this.tokens[this.i++];
          if (!endTok || endTok.type !== 'ref') throw new Error('range');
          return this.model.rangeValues(start, refTokenToCell(endTok.value), this.stack);
        }
        return this.model.evaluate(start, this.stack);
      }
      if (t.value === '(') {
        const v = this.compare();
        this.need(')');
        return v;
      }
      throw new Error('primary');
    }
    args() {
      const args = [];
      if (this.take(')')) return args;
      do args.push(this.compare()); while (this.take(','));
      this.need(')');
      return args;
    }
    fn(name) {
      const args = this.args();
      const flat = args.flat(Infinity);
      const nums = flat.map(num).filter(v => !isError(v));
      if (flat.some(isError)) return flat.find(isError);
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return flat.filter(v => v !== '' && Number.isFinite(Number(v))).length;
      if (name === 'IF') return truthy(args[0]) ? args[1] ?? '' : args[2] ?? '';
      if (name === 'AND') return args.every(v => truthy(v) === true);
      if (name === 'OR') return args.some(v => truthy(v) === true);
      if (name === 'NOT') return !truthy(args[0]);
      if (name === 'ABS') return Math.abs(num(args[0]));
      if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] === undefined ? 0 : num(args[1])));
      if (name === 'CONCAT') return flat.map(display).join('');
      throw new Error('function');
    }
  }

  function refTokenToCell(token) {
    if (token === REF) return null;
    const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(token);
    if (!m) return null;
    return { row: Number(m[2]) - 1, col: nameToCol(m[1]) };
  }

  function adjustFormulaReferences(raw, from, to) {
    if (!raw || raw[0] !== '=') return raw;
    const dr = to.row - from.row;
    const dc = to.col - from.col;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, ac, col, ar, row) => {
      const nextCol = ac ? nameToCol(col) : nameToCol(col) + dc;
      const nextRow = ar ? Number(row) - 1 : Number(row) - 1 + dr;
      if (nextCol < 0 || nextRow < 0) return REF;
      return ac + colToName(nextCol) + ar + String(nextRow + 1);
    });
  }

  function shiftFormula(raw, type, index, delta) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, ac, col, ar, row) => {
      let c = nameToCol(col), r = Number(row) - 1;
      if (type === 'row') {
        if (delta > 0 && r >= index) r += delta;
        else if (delta < 0 && r === index) return REF;
        else if (delta < 0 && r > index) r += delta;
      } else {
        if (delta > 0 && c >= index) c += delta;
        else if (delta < 0 && c === index) return REF;
        else if (delta < 0 && c > index) c += delta;
      }
      return ac + colToName(c) + ar + String(r + 1);
    });
  }

  class Model {
    constructor(rows, cols, data) {
      this.rows = rows;
      this.cols = cols;
      this.cells = new Map(data || []);
    }
    key(cell) { return cell.row + ',' + cell.col; }
    inBounds(cell) { return cell && cell.row >= 0 && cell.col >= 0 && cell.row < this.rows && cell.col < this.cols; }
    getRaw(cell) { return this.cells.get(this.key(cell)) || ''; }
    setRaw(cell, raw) {
      if (!this.inBounds(cell)) return;
      if (raw) this.cells.set(this.key(cell), String(raw));
      else this.cells.delete(this.key(cell));
    }
    evaluate(cell, stack) {
      if (!this.inBounds(cell)) return REF;
      const key = this.key(cell);
      stack = stack || new Set();
      if (stack.has(key)) return CIRC;
      const raw = this.getRaw(cell);
      if (!raw) return '';
      if (raw[0] !== '=') {
        const n = Number(raw);
        return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
      }
      if (raw.includes(REF)) return REF;
      stack.add(key);
      try {
        const v = new Parser(this, cell, raw.slice(1), stack).parse();
        stack.delete(key);
        return v;
      } catch (_) {
        stack.delete(key);
        return ERR;
      }
    }
    getDisplayValue(cell) { return display(this.evaluate(cell)); }
    rangeValues(a, b, stack) {
      if (!this.inBounds(a) || !this.inBounds(b)) return REF;
      const out = [];
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
        const row = [];
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) row.push(this.evaluate({ row: r, col: c }, stack));
        out.push(row);
      }
      return out;
    }
    snapshot() { return Array.from(this.cells.entries()); }
    restore(entries) { this.cells = new Map(entries || []); }
    insertRow(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [r, c] = key.split(',').map(Number);
        next.set((r >= index ? r + 1 : r) + ',' + c, shiftFormula(raw, 'row', index, 1));
      }
      this.rows += 1; this.cells = next;
    }
    deleteRow(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [r, c] = key.split(',').map(Number);
        if (r !== index) next.set((r > index ? r - 1 : r) + ',' + c, shiftFormula(raw, 'row', index, -1));
      }
      this.rows = Math.max(1, this.rows - 1); this.cells = next;
    }
    insertCol(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [r, c] = key.split(',').map(Number);
        next.set(r + ',' + (c >= index ? c + 1 : c), shiftFormula(raw, 'col', index, 1));
      }
      this.cols += 1; this.cells = next;
    }
    deleteCol(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [r, c] = key.split(',').map(Number);
        if (c !== index) next.set(r + ',' + (c > index ? c - 1 : c), shiftFormula(raw, 'col', index, -1));
      }
      this.cols = Math.max(1, this.cols - 1); this.cells = next;
    }
  }

  return { Model, parseCellAddress, formatCellAddress, colToName, nameToCol, adjustFormulaReferences };
});
