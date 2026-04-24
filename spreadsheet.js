(function (root) {
  'use strict';

  const ERROR = Object.freeze({ err: '#ERR!', div: '#DIV/0!', ref: '#REF!', circ: '#CIRC!' });

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.replace(/\$/g, '')) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }

  function indexToCol(index) {
    let result = '';
    while (index > 0) {
      const rem = (index - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      index = Math.floor((index - 1) / 26);
    }
    return result;
  }

  function parseRef(ref) {
    if (ref === '#REF!') return { invalid: true };
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
    if (!match) return null;
    return {
      colAbs: !!match[1],
      col: colToIndex(match[2]),
      rowAbs: !!match[3],
      row: Number(match[4]),
    };
  }

  function refToA1(ref) {
    return `${ref.colAbs ? '$' : ''}${indexToCol(ref.col)}${ref.rowAbs ? '$' : ''}${ref.row}`;
  }

  function keyToPoint(key) {
    const ref = parseRef(key.replace(/\$/g, ''));
    return { row: ref.row, col: ref.col };
  }

  function pointToKey(row, col) {
    return `${indexToCol(col)}${row}`;
  }

  function isError(value) {
    return typeof value === 'string' && /^#/.test(value);
  }

  function flatten(values) {
    const out = [];
    values.forEach((value) => Array.isArray(value) ? out.push(...flatten(value)) : out.push(value));
    return out;
  }

  function toNumber(value) {
    if (isError(value)) return value;
    if (value === '' || value === false) return 0;
    if (value === true) return 1;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function toText(value) {
    if (isError(value)) return value;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value == null) return '';
    return String(value);
  }

  class FormulaParser {
    constructor(core, homeKey, source) {
      this.core = core;
      this.homeKey = homeKey;
      this.source = source;
      this.pos = 0;
    }

    parse() {
      const value = this.parseComparison();
      this.skipWs();
      if (this.pos !== this.source.length) return ERROR.err;
      return value;
    }

    skipWs() {
      while (/\s/.test(this.source[this.pos] || '')) this.pos++;
    }

    peek(text) {
      this.skipWs();
      return this.source.slice(this.pos, this.pos + text.length).toUpperCase() === text;
    }

    eat(text) {
      if (!this.peek(text)) return false;
      this.pos += text.length;
      return true;
    }

    parseComparison() {
      let left = this.parseConcat();
      while (true) {
        this.skipWs();
        const op = ['>=', '<=', '<>', '=', '<', '>'].find((item) => this.source.slice(this.pos, this.pos + item.length) === item);
        if (!op) return left;
        this.pos += op.length;
        const right = this.parseConcat();
        if (isError(left)) return left;
        if (isError(right)) return right;
        const a = typeof left === 'number' && typeof right === 'number' ? left : toText(left);
        const b = typeof left === 'number' && typeof right === 'number' ? right : toText(right);
        left = op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
      }
    }

    parseConcat() {
      let left = this.parseAdd();
      while (this.eat('&')) {
        const right = this.parseAdd();
        if (isError(left)) return left;
        if (isError(right)) return right;
        left = toText(left) + toText(right);
      }
      return left;
    }

    parseAdd() {
      let left = this.parseMul();
      while (true) {
        if (this.eat('+')) {
          const right = this.parseMul();
          if (isError(left)) return left;
          if (isError(right)) return right;
          left = toNumber(left) + toNumber(right);
        } else if (this.eat('-')) {
          const right = this.parseMul();
          if (isError(left)) return left;
          if (isError(right)) return right;
          left = toNumber(left) - toNumber(right);
        } else return left;
      }
    }

    parseMul() {
      let left = this.parseUnary();
      while (true) {
        if (this.eat('*')) {
          const right = this.parseUnary();
          if (isError(left)) return left;
          if (isError(right)) return right;
          left = toNumber(left) * toNumber(right);
        } else if (this.eat('/')) {
          const right = this.parseUnary();
          if (isError(left)) return left;
          if (isError(right)) return right;
          const divisor = toNumber(right);
          left = divisor === 0 ? ERROR.div : toNumber(left) / divisor;
        } else return left;
      }
    }

    parseUnary() {
      if (this.eat('-')) {
        const value = this.parseUnary();
        return isError(value) ? value : -toNumber(value);
      }
      return this.parsePrimary();
    }

    parsePrimary() {
      this.skipWs();
      const ch = this.source[this.pos];
      if (ch === '(') {
        this.pos++;
        const value = this.parseComparison();
        if (!this.eat(')')) return ERROR.err;
        return value;
      }
      if (ch === '"') return this.parseString();
      if (/\d|\./.test(ch || '')) return this.parseNumber();
      if (/[A-Z_$#]/i.test(ch || '')) return this.parseIdentifier();
      return ERROR.err;
    }

    parseString() {
      this.pos++;
      let value = '';
      while (this.pos < this.source.length && this.source[this.pos] !== '"') value += this.source[this.pos++];
      if (this.source[this.pos] !== '"') return ERROR.err;
      this.pos++;
      return value;
    }

    parseNumber() {
      const start = this.pos;
      while (/[\d.]/.test(this.source[this.pos] || '')) this.pos++;
      const value = Number(this.source.slice(start, this.pos));
      return Number.isFinite(value) ? value : ERROR.err;
    }

    parseIdentifier() {
      const refMatch = /^(#REF!|\$?[A-Z]+\$?\d+)/i.exec(this.source.slice(this.pos));
      if (refMatch) {
        const first = refMatch[1].toUpperCase();
        this.pos += refMatch[1].length;
        if (this.eat(':')) {
          const secondMatch = /^(#REF!|\$?[A-Z]+\$?\d+)/i.exec(this.source.slice(this.pos));
          if (!secondMatch) return ERROR.err;
          const second = secondMatch[1].toUpperCase();
          this.pos += secondMatch[1].length;
          return this.core.getRangeValues(first, second, this.homeKey);
        }
        return this.core.evaluateCell(first, this.homeKey);
      }
      const nameMatch = /^[A-Z_][A-Z0-9_]*/i.exec(this.source.slice(this.pos));
      if (!nameMatch) return ERROR.err;
      const name = nameMatch[0].toUpperCase();
      this.pos += nameMatch[0].length;
      if (name === 'TRUE') return true;
      if (name === 'FALSE') return false;
      if (!this.eat('(')) return ERROR.err;
      const args = [];
      if (!this.peek(')')) {
        do args.push(this.parseComparison());
        while (this.eat(','));
      }
      if (!this.eat(')')) return ERROR.err;
      return this.callFunction(name, args);
    }

    callFunction(name, args) {
      const values = flatten(args);
      const firstError = values.find(isError);
      if (firstError) return firstError;
      const nums = values.map(toNumber).filter((n) => typeof n === 'number' && Number.isFinite(n));
      switch (name) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVERAGE': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'MIN': return nums.length ? Math.min(...nums) : 0;
        case 'MAX': return nums.length ? Math.max(...nums) : 0;
        case 'COUNT': return nums.length;
        case 'IF': return args[0] ? args[1] : args[2];
        case 'AND': return values.every(Boolean);
        case 'OR': return values.some(Boolean);
        case 'NOT': return !args[0];
        case 'ABS': return Math.abs(toNumber(args[0]));
        case 'ROUND': return Number(toNumber(args[0]).toFixed(args.length > 1 ? toNumber(args[1]) : 0));
        case 'CONCAT': return values.map(toText).join('');
        default: return ERROR.err;
      }
    }
  }

  class SpreadsheetCore {
    constructor(rows, cols, data) {
      this.rows = rows;
      this.cols = cols;
      this.cells = Object.assign({}, data || {});
      this.cache = {};
      this.stack = [];
    }

    normalizeKey(key) {
      if (key === '#REF!') return key;
      const parsed = parseRef(key.toUpperCase());
      if (!parsed || parsed.invalid) return '#REF!';
      if (parsed.row < 1 || parsed.col < 1 || parsed.row > this.rows || parsed.col > this.cols) return '#REF!';
      return pointToKey(parsed.row, parsed.col);
    }

    setCell(key, raw) {
      key = this.normalizeKey(key);
      if (key === '#REF!') return;
      if (raw == null || raw === '') delete this.cells[key];
      else this.cells[key] = String(raw);
      this.cache = {};
    }

    getRaw(key) {
      return this.cells[this.normalizeKey(key)] || '';
    }

    getDisplay(key) {
      const value = this.evaluateCell(key);
      if (value === true) return 'TRUE';
      if (value === false) return 'FALSE';
      if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
      return value == null ? '' : String(value);
    }

    evaluateCell(key) {
      key = this.normalizeKey(key);
      if (key === '#REF!') return ERROR.ref;
      if (this.cache[key] !== undefined) return this.cache[key];
      if (this.stack.includes(key)) {
        this.stack.forEach((stackKey) => { this.cache[stackKey] = ERROR.circ; });
        return ERROR.circ;
      }
      const raw = this.cells[key] || '';
      if (raw === '') return 0;
      if (!raw.startsWith('=')) {
        const n = Number(raw);
        return Number.isFinite(n) && raw.trim() !== '' ? n : raw;
      }
      this.stack.push(key);
      const value = new FormulaParser(this, key, raw.slice(1)).parse();
      this.stack.pop();
      this.cache[key] = value;
      return value;
    }

    getRangeValues(a, b, homeKey) {
      const start = parseRef(a);
      const end = parseRef(b);
      if (!start || !end || start.invalid || end.invalid) return ERROR.ref;
      const values = [];
      for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
        for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) {
          values.push(this.evaluateCell(pointToKey(row, col), homeKey));
        }
      }
      return values;
    }

    adjustFormulaForMove(raw, fromKey, toKey) {
      if (!raw.startsWith('=')) return raw;
      const from = keyToPoint(fromKey);
      const to = keyToPoint(toKey);
      const dr = to.row - from.row;
      const dc = to.col - from.col;
      return raw.replace(/#REF!|\$?[A-Z]+\$?\d+/g, (token) => {
        const ref = parseRef(token);
        if (!ref || ref.invalid) return token;
        const next = Object.assign({}, ref);
        if (!next.rowAbs) next.row += dr;
        if (!next.colAbs) next.col += dc;
        if (next.row < 1 || next.col < 1 || next.row > this.rows || next.col > this.cols) return '#REF!';
        return refToA1(next);
      });
    }

    remapFormulas(mapper) {
      Object.keys(this.cells).forEach((key) => {
        const raw = this.cells[key];
        if (!raw.startsWith('=')) return;
        this.cells[key] = raw.replace(/#REF!|\$?[A-Z]+\$?\d+/g, (token) => {
          const ref = parseRef(token);
          if (!ref || ref.invalid) return '#REF!';
          const next = mapper(ref);
          return next ? refToA1(Object.assign({}, ref, next)) : '#REF!';
        });
      });
      this.cache = {};
    }

    insertRow(row) {
      const next = {};
      Object.keys(this.cells).forEach((key) => {
        const p = keyToPoint(key);
        next[pointToKey(p.row >= row ? p.row + 1 : p.row, p.col)] = this.cells[key];
      });
      this.cells = next;
      this.rows += 1;
      this.remapFormulas((ref) => ({ row: ref.row >= row ? ref.row + 1 : ref.row }));
    }

    deleteRow(row) {
      const next = {};
      Object.keys(this.cells).forEach((key) => {
        const p = keyToPoint(key);
        if (p.row !== row) next[pointToKey(p.row > row ? p.row - 1 : p.row, p.col)] = this.cells[key];
      });
      this.cells = next;
      this.rows = Math.max(1, this.rows - 1);
      this.remapFormulas((ref) => ref.row === row ? null : { row: ref.row > row ? ref.row - 1 : ref.row });
    }

    insertCol(col) {
      const next = {};
      Object.keys(this.cells).forEach((key) => {
        const p = keyToPoint(key);
        next[pointToKey(p.row, p.col >= col ? p.col + 1 : p.col)] = this.cells[key];
      });
      this.cells = next;
      this.cols += 1;
      this.remapFormulas((ref) => ({ col: ref.col >= col ? ref.col + 1 : ref.col }));
    }

    deleteCol(col) {
      const next = {};
      Object.keys(this.cells).forEach((key) => {
        const p = keyToPoint(key);
        if (p.col !== col) next[pointToKey(p.row, p.col > col ? p.col - 1 : p.col)] = this.cells[key];
      });
      this.cells = next;
      this.cols = Math.max(1, this.cols - 1);
      this.remapFormulas((ref) => ref.col === col ? null : { col: ref.col > col ? ref.col - 1 : ref.col });
    }
  }

  const api = { SpreadsheetCore, colToIndex, indexToCol, pointToKey, keyToPoint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpreadsheetCore = SpreadsheetCore;
  root.SheetUtil = api;
})(typeof window !== 'undefined' ? window : globalThis);
