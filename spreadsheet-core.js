(function (root) {
  'use strict';

  const COLS = 26;
  const ROWS = 100;

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.replace(/\$/g, '')) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function indexToCol(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function addr(row, col) {
    return indexToCol(col) + (row + 1);
  }

  function parseAddr(ref) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
    if (!m) return null;
    return { row: Number(m[2]) - 1, col: colToIndex(m[1]) };
  }

  function formatValue(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value)) return String(Number(value.toFixed(10)));
    return String(value);
  }

  function numeric(value) {
    if (value && value.error) return value;
    if (value === '' || value === null || value === undefined) return 0;
    if (value === true) return 1;
    if (value === false) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  class SpreadsheetModel {
    constructor(rows = ROWS, cols = COLS) {
      this.rows = rows;
      this.cols = cols;
      this.cells = new Map();
    }

    setCell(ref, raw) {
      const key = ref.toUpperCase();
      const text = String(raw || '');
      if (text) this.cells.set(key, text);
      else this.cells.delete(key);
    }

    getRaw(ref) {
      return this.cells.get(ref.toUpperCase()) || '';
    }

    getDisplay(ref) {
      return formatValue(this.evaluate(ref.toUpperCase(), []));
    }

    evaluate(ref, stack) {
      if (stack.includes(ref)) return { error: '#CIRC!' };
      const raw = this.getRaw(ref);
      if (!raw) return '';
      if (raw[0] !== '=') {
        const n = Number(raw);
        return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
      }
      try {
        const parser = new FormulaParser(raw.slice(1), this, stack.concat(ref));
        const value = parser.parse();
        return value && value.error ? value : value;
      } catch (error) {
        return { error: error.message === '#DIV/0!' ? '#DIV/0!' : '#ERR!' };
      }
    }

    valuesInRange(startRef, endRef, stack) {
      const start = parseAddr(startRef);
      const end = parseAddr(endRef);
      if (!start || !end) return [{ error: '#REF!' }];
      const values = [];
      const r1 = Math.min(start.row, end.row);
      const r2 = Math.max(start.row, end.row);
      const c1 = Math.min(start.col, end.col);
      const c2 = Math.max(start.col, end.col);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) values.push(this.evaluate(addr(r, c), stack));
      }
      return values;
    }

    toJSON() {
      return Array.from(this.cells.entries());
    }

    load(entries) {
      this.cells = new Map(entries || []);
    }
  }

  class FormulaParser {
    constructor(input, sheet, stack) {
      this.tokens = tokenize(input);
      this.pos = 0;
      this.sheet = sheet;
      this.stack = stack;
    }

    parse() {
      const value = this.comparison();
      if (this.peek()) throw new Error('#ERR!');
      return value;
    }

    comparison() {
      let left = this.concat();
      while (this.match('op', '=', '<>', '<', '<=', '>', '>=')) {
        const op = this.previous().value;
        const right = this.concat();
        const a = numeric(left);
        const b = numeric(right);
        if (a && a.error) return a;
        if (b && b.error) return b;
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
      let left = this.term();
      while (this.match('op', '&')) left = formatValue(left) + formatValue(this.term());
      return left;
    }

    term() {
      let left = this.factor();
      while (this.match('op', '+', '-')) {
        const op = this.previous().value;
        const right = this.factor();
        const a = numeric(left);
        const b = numeric(right);
        if (a && a.error) return a;
        if (b && b.error) return b;
        left = op === '+' ? a + b : a - b;
      }
      return left;
    }

    factor() {
      let left = this.unary();
      while (this.match('op', '*', '/')) {
        const op = this.previous().value;
        const right = this.unary();
        const a = numeric(left);
        const b = numeric(right);
        if (a && a.error) return a;
        if (b && b.error) return b;
        if (op === '/' && b === 0) throw new Error('#DIV/0!');
        left = op === '*' ? a * b : a / b;
      }
      return left;
    }

    unary() {
      if (this.match('op', '-')) return -numeric(this.unary());
      return this.primary();
    }

    primary() {
      if (this.match('number')) return Number(this.previous().value);
      if (this.match('string')) return this.previous().value;
      if (this.match('ident')) {
        const name = this.previous().value.toUpperCase();
        if (name === 'TRUE') return true;
        if (name === 'FALSE') return false;
        if (this.match('paren', '(')) return this.call(name);
        if (parseAddr(name)) return this.sheet.evaluate(name, this.stack);
        throw new Error('#ERR!');
      }
      if (this.match('paren', '(')) {
        const value = this.comparison();
        this.consume('paren', ')');
        return value;
      }
      throw new Error('#ERR!');
    }

    call(name) {
      const args = [];
      if (!this.check('paren', ')')) {
        do args.push(this.argument());
        while (this.match('comma', ','));
      }
      this.consume('paren', ')');
      const flat = args.flat();
      const nums = flat.map(numeric).filter((v) => !(v && v.error));
      if (flat.some((v) => v && v.error)) return flat.find((v) => v && v.error);
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return nums.length;
      if (name === 'ABS') return Math.abs(numeric(flat[0]));
      if (name === 'ROUND') return Math.round(numeric(flat[0]));
      if (name === 'AND') return flat.every(Boolean);
      if (name === 'OR') return flat.some(Boolean);
      if (name === 'NOT') return !flat[0];
      if (name === 'IF') return flat[0] ? flat[1] : flat[2];
      if (name === 'CONCAT') return flat.map(formatValue).join('');
      throw new Error('#ERR!');
    }

    argument() {
      if (this.check('ident') && this.tokens[this.pos + 1] && this.tokens[this.pos + 1].type === 'colon') {
        const first = this.consume('ident').value.toUpperCase();
        this.consume('colon', ':');
        const second = this.consume('ident').value.toUpperCase();
        return this.sheet.valuesInRange(first, second, this.stack);
      }
      const first = this.comparison();
      return first;
    }

    match(type, ...values) {
      if (!this.check(type, ...values)) return false;
      this.pos++;
      return true;
    }

    consume(type, value) {
      if (value === undefined ? !this.check(type) : !this.check(type, value)) throw new Error('#ERR!');
      return this.tokens[this.pos++];
    }

    check(type, ...values) {
      const token = this.peek();
      if (!token || token.type !== type) return false;
      return values.length === 0 || values.includes(token.value);
    }

    peek() {
      return this.tokens[this.pos];
    }

    previous() {
      return this.tokens[this.pos - 1];
    }
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) {
        i++;
      } else if (ch === '"') {
        let s = '';
        i++;
        while (i < input.length && input[i] !== '"') s += input[i++];
        i++;
        tokens.push({ type: 'string', value: s });
      } else if (/[0-9.]/.test(ch)) {
        const m = /^[0-9]+(?:\.[0-9]+)?/.exec(input.slice(i));
        tokens.push({ type: 'number', value: m[0] });
        i += m[0].length;
      } else if (/[A-Za-z$]/.test(ch)) {
        const m = /^\$?[A-Za-z]+\$?[0-9]*|^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
        tokens.push({ type: 'ident', value: m[0].toUpperCase() });
        i += m[0].length;
      } else if (input.slice(i, i + 2) === '<=' || input.slice(i, i + 2) === '>=' || input.slice(i, i + 2) === '<>') {
        tokens.push({ type: 'op', value: input.slice(i, i + 2) });
        i += 2;
      } else if ('+-*/&=<>'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
      } else if (ch === '(' || ch === ')') {
        tokens.push({ type: 'paren', value: ch });
        i++;
      } else if (ch === ',') {
        tokens.push({ type: 'comma', value: ch });
        i++;
      } else if (ch === ':') {
        tokens.push({ type: 'colon', value: ch });
        i++;
      } else {
        throw new Error('#ERR!');
      }
    }
    return tokens;
  }

  const api = { SpreadsheetModel, colToIndex, indexToCol, addr, parseAddr, formatValue };
  if (typeof module !== 'undefined') module.exports = api;
  root.SpreadsheetCore = api;
})(typeof window === 'undefined' ? global : window);
