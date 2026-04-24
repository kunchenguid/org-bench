(function (root) {
  'use strict';

  class CellRefError extends Error {
    constructor() {
      super('#REF!');
      this.name = 'CellRefError';
    }
  }

  class FormulaError extends Error {
    constructor(message) {
      super(message || '#ERR!');
      this.name = 'FormulaError';
    }
  }

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }

  function indexToCol(index) {
    let s = '';
    while (index > 0) {
      index -= 1;
      s = String.fromCharCode(65 + (index % 26)) + s;
      index = Math.floor(index / 26);
    }
    return s;
  }

  function parseRef(text) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/i.exec(text);
    if (!match) return null;
    return {
      colAbs: match[1] === '$',
      col: colToIndex(match[2]),
      rowAbs: match[3] === '$',
      row: Number(match[4]),
    };
  }

  function formatRef(ref) {
    return `${ref.colAbs ? '$' : ''}${indexToCol(ref.col)}${ref.rowAbs ? '$' : ''}${ref.row}`;
  }

  function adjustRefForStructure(ref, op) {
    const next = Object.assign({}, ref);
    const start = op.index;
    const end = op.index + (op.count || 1) - 1;
    if (op.type === 'insertRow' && ref.row >= start) next.row += op.count || 1;
    if (op.type === 'insertColumn' && ref.col >= start) next.col += op.count || 1;
    if (op.type === 'deleteRow') {
      if (ref.row >= start && ref.row <= end) throw new CellRefError();
      if (ref.row > end) next.row -= op.count || 1;
    }
    if (op.type === 'deleteColumn') {
      if (ref.col >= start && ref.col <= end) throw new CellRefError();
      if (ref.col > end) next.col -= op.count || 1;
    }
    if (next.row < 1 || next.col < 1) throw new CellRefError();
    return next;
  }

  function adjustFormulaForStructure(raw, op) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?[A-Z]+\$?\d+)/gi, (token) => {
      try {
        return formatRef(adjustRefForStructure(parseRef(token), op));
      } catch (error) {
        if (error instanceof CellRefError) return '#REF!';
        throw error;
      }
    });
  }

  function adjustFormulaForPaste(raw, rowOffset, colOffset) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (token, ca, col, ra, row) => {
      const ref = parseRef(token);
      if (!ref) return token;
      if (!ref.colAbs) ref.col += colOffset;
      if (!ref.rowAbs) ref.row += rowOffset;
      if (ref.col < 1 || ref.row < 1) return '#REF!';
      return formatRef(ref);
    });
  }

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (expr.slice(i, i + 5).toUpperCase() === '#REF!') { tokens.push({ type: 'referr', value: '#REF!' }); i += 5; continue; }
      if (ch === '"') {
        let j = i + 1, s = '';
        while (j < expr.length && expr[j] !== '"') s += expr[j++];
        if (j >= expr.length) throw new FormulaError('#ERR!');
        tokens.push({ type: 'string', value: s }); i = j + 1; continue;
      }
      const two = expr.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&()=,<:>'.includes(ch)) { tokens.push({ type: ch === '(' || ch === ')' || ch === ',' || ch === ':' ? ch : 'op', value: ch }); i += 1; continue; }
      const num = /^\d+(?:\.\d+)?/.exec(expr.slice(i));
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const word = /^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/i.exec(expr.slice(i));
      if (word) {
        const value = word[0].toUpperCase();
        tokens.push({ type: parseRef(value) ? 'ref' : 'name', value });
        i += word[0].length; continue;
      }
      throw new FormulaError('#ERR!');
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function evaluateFormula(raw, sheet, pos, visiting) {
    if (!raw || raw[0] !== '=') return coerceLiteral(raw);
    const tokens = tokenize(raw.slice(1));
    let p = 0;
    const peek = () => tokens[p];
    const take = (type, value) => {
      const t = tokens[p];
      if (t.type === type && (value === undefined || t.value === value)) { p += 1; return t; }
      throw new FormulaError('#ERR!');
    };
    const cellValue = (refText) => {
      const ref = parseRef(refText);
      const key = `${ref.row},${ref.col}`;
      if (visiting.has(key)) throw new FormulaError('#CIRC!');
      const value = sheet.getRaw(ref.row, ref.col);
      if (!value) return 0;
      visiting.add(key);
      try { return evaluateFormula(value, sheet, { row: ref.row, col: ref.col }, visiting); }
      finally { visiting.delete(key); }
    };
    const rangeValues = (a, b) => {
      const r1 = parseRef(a), r2 = parseRef(b);
      const out = [];
      for (let row = Math.min(r1.row, r2.row); row <= Math.max(r1.row, r2.row); row += 1) {
        for (let col = Math.min(r1.col, r2.col); col <= Math.max(r1.col, r2.col); col += 1) out.push(cellValue(`${indexToCol(col)}${row}`));
      }
      return out;
    };
    const flatNums = (args) => args.flat(Infinity).map(toNumber).filter((n) => !Number.isNaN(n));
    const callFn = (name, args) => {
      const nums = flatNums(args);
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return nums.length;
      if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
      if (name === 'AND') return args.every(truthy);
      if (name === 'OR') return args.some(truthy);
      if (name === 'NOT') return !truthy(args[0]);
      if (name === 'ABS') return Math.abs(toNumber(args[0]));
      if (name === 'ROUND') return Math.round(toNumber(args[0]));
      if (name === 'CONCAT') return args.flat(Infinity).map(displayValue).join('');
      throw new FormulaError('#NAME?');
    };
    const primary = () => {
      const t = peek();
      if (t.type === 'referr') { take('referr'); throw new CellRefError(); }
      if (t.type === 'number') return take('number').value;
      if (t.type === 'string') return take('string').value;
      if (t.type === 'ref') {
        const first = take('ref').value;
        if (peek().type === ':') { take(':'); return rangeValues(first, take('ref').value); }
        return cellValue(first);
      }
      if (t.type === 'name') {
        const name = take('name').value;
        if (name === 'TRUE') return true;
        if (name === 'FALSE') return false;
        take('(');
        const args = [];
        if (peek().type !== ')') {
          do { args.push(compare()); if (peek().type !== ',') break; take(','); } while (true);
        }
        take(')');
        return callFn(name, args);
      }
      if (t.type === '(') { take('('); const v = compare(); take(')'); return v; }
      throw new FormulaError('#ERR!');
    };
    const unary = () => peek().type === 'op' && peek().value === '-' ? (take('op', '-'), -toNumber(unary())) : primary();
    const mul = () => bin(unary, ['*', '/'], (a, op, b) => op === '*' ? toNumber(a) * toNumber(b) : (toNumber(b) === 0 ? (() => { throw new FormulaError('#DIV/0!'); })() : toNumber(a) / toNumber(b)));
    const add = () => bin(mul, ['+', '-'], (a, op, b) => op === '+' ? toNumber(a) + toNumber(b) : toNumber(a) - toNumber(b));
    const concat = () => bin(add, ['&'], (a, op, b) => displayValue(a) + displayValue(b));
    function compare() {
      let left = concat();
      if (peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const op = take('op').value, right = concat();
        if (op === '=') return left == right;
        if (op === '<>') return left != right;
        if (op === '<') return left < right;
        if (op === '<=') return left <= right;
        if (op === '>') return left > right;
        return left >= right;
      }
      return left;
    }
    function bin(next, ops, fn) {
      let left = next();
      while (peek().type === 'op' && ops.includes(peek().value)) left = fn(left, take('op').value, next());
      return left;
    }
    const result = compare();
    if (peek().type !== 'eof') throw new FormulaError('#ERR!');
    return result;
  }

  function coerceLiteral(raw) {
    if (raw == null || raw === '') return '';
    const n = Number(raw);
    return raw.trim && raw.trim() !== '' && !Number.isNaN(n) ? n : raw;
  }
  function toNumber(v) { return v === '' || v == null ? 0 : Number(v); }
  function truthy(v) { return v === true || v === 'TRUE' || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v !== ''); }
  function displayValue(v) { return v === true ? 'TRUE' : v === false ? 'FALSE' : v == null ? '' : String(v); }

  const api = { CellRefError, FormulaError, colToIndex, indexToCol, parseRef, formatRef, adjustFormulaForStructure, adjustFormulaForPaste, evaluateFormula, displayValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
