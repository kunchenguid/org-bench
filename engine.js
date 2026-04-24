(function (root) {
  'use strict';

  const REF_RE = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/;
  const RANGE_RE = /^(\$?[A-Z]+\$?[1-9][0-9]*):(\$?[A-Z]+\$?[1-9][0-9]*)$/;

  function colToIndex(col) {
    let value = 0;
    for (let i = 0; i < col.length; i++) value = value * 26 + (col.charCodeAt(i) - 64);
    return value - 1;
  }

  function indexToCol(index) {
    let value = index + 1;
    let out = '';
    while (value > 0) {
      const rem = (value - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      value = Math.floor((value - 1) / 26);
    }
    return out;
  }

  function parseRef(ref) {
    const match = String(ref).toUpperCase().match(REF_RE);
    if (!match) return null;
    return {
      colAbs: match[1] === '$',
      col: colToIndex(match[2]),
      rowAbs: match[3] === '$',
      row: Number(match[4]) - 1,
    };
  }

  function refToA1(row, col, rowAbs, colAbs) {
    return `${colAbs ? '$' : ''}${indexToCol(col)}${rowAbs ? '$' : ''}${row + 1}`;
  }

  function coordToA1(row, col) {
    return refToA1(row, col, false, false);
  }

  function normalizeValue(value) {
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '#ERR!';
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    }
    return String(value);
  }

  function isError(value) {
    return typeof value === 'string' && value.startsWith('#');
  }

  function toNumber(value) {
    if (isError(value)) return value;
    if (value === true) return 1;
    if (value === false) return 0;
    if (value === '' || value === null || value === undefined) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function truthy(value) {
    if (isError(value)) return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0 && value.toUpperCase() !== 'FALSE';
    return Boolean(value);
  }

  class FormulaParser {
    constructor(engine, formula, currentKey, visiting) {
      this.engine = engine;
      this.formula = formula;
      this.currentKey = currentKey;
      this.visiting = visiting;
      this.tokens = this.tokenize(formula);
      this.pos = 0;
    }

    tokenize(input) {
      const tokens = [];
      let i = 0;
      while (i < input.length) {
        const ch = input[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '"') {
          let s = '';
          i++;
          while (i < input.length && input[i] !== '"') s += input[i++];
          if (input[i] !== '"') throw new Error('#ERR!');
          i++;
          tokens.push({ type: 'string', value: s });
          continue;
        }
        const two = input.slice(i, i + 2);
        if (['<=', '>=', '<>'].includes(two)) {
          tokens.push({ type: 'op', value: two });
          i += 2;
          continue;
        }
        if ('+-*/()&,:=<>'.includes(ch)) {
          tokens.push({ type: 'op', value: ch });
          i++;
          continue;
        }
        if (/[0-9.]/.test(ch)) {
          let n = '';
          while (i < input.length && /[0-9.]/.test(input[i])) n += input[i++];
          tokens.push({ type: 'number', value: Number(n) });
          continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
          let id = '';
          while (i < input.length && /[A-Za-z0-9_$]/.test(input[i])) id += input[i++];
          tokens.push({ type: 'id', value: id.toUpperCase() });
          continue;
        }
        throw new Error('#ERR!');
      }
      return tokens;
    }

    peek(value) { return this.tokens[this.pos] && this.tokens[this.pos].value === value; }
    next() { return this.tokens[this.pos++]; }
    expect(value) { if (!this.peek(value)) throw new Error('#ERR!'); this.pos++; }

    parse() {
      const value = this.parseCompare();
      if (this.pos !== this.tokens.length) throw new Error('#ERR!');
      return value;
    }

    parseCompare() {
      let left = this.parseConcat();
      while (this.tokens[this.pos] && ['=', '<>', '<', '<=', '>', '>='].includes(this.tokens[this.pos].value)) {
        const op = this.next().value;
        const right = this.parseConcat();
        const ln = Number(left);
        const rn = Number(right);
        const numeric = Number.isFinite(ln) && Number.isFinite(rn);
        const a = numeric ? ln : String(left);
        const b = numeric ? rn : String(right);
        if (op === '=') left = a === b;
        if (op === '<>') left = a !== b;
        if (op === '<') left = a < b;
        if (op === '<=') left = a <= b;
        if (op === '>') left = a > b;
        if (op === '>=') left = a >= b;
      }
      return left;
    }

    parseConcat() {
      let left = this.parseAdd();
      while (this.peek('&')) {
        this.next();
        left = normalizeValue(left) + normalizeValue(this.parseAdd());
      }
      return left;
    }

    parseAdd() {
      let left = this.parseMul();
      while (this.peek('+') || this.peek('-')) {
        const op = this.next().value;
        const right = this.parseMul();
        left = op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
      }
      return left;
    }

    parseMul() {
      let left = this.parseUnary();
      while (this.peek('*') || this.peek('/')) {
        const op = this.next().value;
        const right = this.parseUnary();
        if (op === '/' && toNumber(right) === 0) throw new Error('#DIV/0!');
        left = op === '*' ? toNumber(left) * toNumber(right) : toNumber(left) / toNumber(right);
      }
      return left;
    }

    parseUnary() {
      if (this.peek('-')) { this.next(); return -toNumber(this.parseUnary()); }
      if (this.peek('+')) { this.next(); return toNumber(this.parseUnary()); }
      return this.parsePrimary();
    }

    parsePrimary() {
      const token = this.next();
      if (!token) throw new Error('#ERR!');
      if (token.type === 'number' || token.type === 'string') return token.value;
      if (token.value === '(') { const value = this.parseCompare(); this.expect(')'); return value; }
      if (token.type === 'id') {
        if (token.value === 'TRUE') return true;
        if (token.value === 'FALSE') return false;
        if (this.peek('(')) return this.parseFunction(token.value);
        const ref = parseRef(token.value);
        if (ref) return this.engine.evaluateCell(coordToA1(ref.row, ref.col), this.visiting);
      }
      throw new Error('#ERR!');
    }

    parseFunction(name) {
      this.expect('(');
      const args = [];
      if (!this.peek(')')) {
        do {
          args.push(this.parseArgument());
          if (!this.peek(',')) break;
          this.next();
        } while (true);
      }
      this.expect(')');
      return this.callFunction(name, args.flat());
    }

    parseArgument() {
      const first = this.tokens[this.pos];
      const second = this.tokens[this.pos + 1];
      const third = this.tokens[this.pos + 2];
      if (first && first.type === 'id' && second && second.value === ':' && third && third.type === 'id') {
        const start = parseRef(first.value);
        const end = parseRef(third.value);
        if (start && end) {
          this.pos += 3;
          return this.engine.getRangeValues(start, end, this.visiting);
        }
      }
      return this.parseCompare();
    }

    callFunction(name, args) {
      const nums = args.map(toNumber).filter((n) => typeof n === 'number' && Number.isFinite(n));
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return nums.length;
      if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
      if (name === 'AND') return args.every((v) => truthy(v) === true);
      if (name === 'OR') return args.some((v) => truthy(v) === true);
      if (name === 'NOT') return !truthy(args[0]);
      if (name === 'ABS') return Math.abs(toNumber(args[0]));
      if (name === 'ROUND') return Number(toNumber(args[0]).toFixed(args[1] === undefined ? 0 : toNumber(args[1])));
      if (name === 'CONCAT') return args.map(normalizeValue).join('');
      throw new Error('#NAME?');
    }
  }

  class SpreadsheetEngine {
    constructor(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.cells = Object.create(null);
    }

    setCell(a1, raw) {
      const key = String(a1).toUpperCase();
      if (raw === '') delete this.cells[key];
      else this.cells[key] = String(raw);
    }

    getRaw(a1) { return this.cells[String(a1).toUpperCase()] || ''; }

    getDisplay(a1) { return normalizeValue(this.evaluateCell(String(a1).toUpperCase(), new Set())); }

    evaluateCell(key, visiting) {
      if (visiting.has(key)) return '#CIRC!';
      const raw = this.getRaw(key);
      if (raw === '') return '';
      if (raw[0] !== '=') {
        const n = Number(raw);
        return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
      }
      visiting.add(key);
      try {
        const value = new FormulaParser(this, raw.slice(1), key, visiting).parse();
        visiting.delete(key);
        return value;
      } catch (error) {
        visiting.delete(key);
        return error.message && error.message[0] === '#' ? error.message : '#ERR!';
      }
    }

    getRangeValues(start, end, visiting) {
      const values = [];
      const r1 = Math.min(start.row, end.row);
      const r2 = Math.max(start.row, end.row);
      const c1 = Math.min(start.col, end.col);
      const c2 = Math.max(start.col, end.col);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) values.push(this.evaluateCell(coordToA1(r, c), visiting));
      }
      return values;
    }

    copyCell(fromA1, toA1) {
      const raw = this.getRaw(fromA1);
      this.setCell(toA1, raw[0] === '=' ? adjustFormula(raw, fromA1, toA1) : raw);
    }
  }

  function adjustFormula(raw, fromA1, toA1) {
    const from = parseRef(fromA1);
    const to = parseRef(toA1);
    if (!from || !to || raw[0] !== '=') return raw;
    const dr = to.row - from.row;
    const dc = to.col - from.col;
    return raw.replace(/\$?[A-Z]+\$?[1-9][0-9]*/g, (match) => {
      const ref = parseRef(match);
      if (!ref) return match;
      const row = ref.rowAbs ? ref.row : ref.row + dr;
      const col = ref.colAbs ? ref.col : ref.col + dc;
      if (row < 0 || col < 0) return '#REF!';
      return refToA1(row, col, ref.rowAbs, ref.colAbs);
    });
  }

  const api = { SpreadsheetEngine, colToIndex, indexToCol, parseRef, coordToA1, adjustFormula };
  root.SpreadsheetEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
