(function (root) {
  'use strict';

  const ERR = '#ERR!';
  const DIV0 = '#DIV/0!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.replace(/\$/g, '')) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }

  function indexToCol(n) {
    let s = '';
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  function parseRef(ref) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
    if (!match) return null;
    return { absCol: !!match[1], col: colToIndex(match[2]), absRow: !!match[3], row: Number(match[4]) };
  }

  function refToString(ref) {
    if (!ref || ref.col < 1 || ref.row < 1) return REF;
    return (ref.absCol ? '$' : '') + indexToCol(ref.col) + (ref.absRow ? '$' : '') + ref.row;
  }

  function plainRef(ref) {
    const parsed = parseRef(ref);
    return parsed ? indexToCol(parsed.col) + parsed.row : ref;
  }

  function formatValue(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function isError(value) {
    return value && value.error;
  }

  function toNumber(value) {
    if (isError(value)) return value;
    if (value === '' || value === null || value === undefined) return 0;
    if (value === true) return 1;
    if (value === false) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function compare(a, op, b) {
    const left = typeof a === 'number' && typeof b === 'number' ? a : formatValue(a);
    const right = typeof a === 'number' && typeof b === 'number' ? b : formatValue(b);
    if (op === '=') return left === right;
    if (op === '<>') return left !== right;
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === '>') return left > right;
    if (op === '>=') return left >= right;
    return false;
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let j = i + 1, s = '';
        while (j < input.length && input[j] !== '"') s += input[j++];
        if (input[j] !== '"') throw new Error('string');
        tokens.push({ type: 'string', value: s });
        i = j + 1;
        continue;
      }
      const num = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const ref = /^\$?[A-Za-z]+\$?\d+/.exec(input.slice(i));
      if (ref) { tokens.push({ type: 'ref', value: ref[0].toUpperCase() }); i += ref[0].length; continue; }
      const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
      if (ident) { tokens.push({ type: 'ident', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      const two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&=<>(),:'.includes(ch)) { tokens.push({ type: ch === ',' || ch === '(' || ch === ')' || ch === ':' ? ch : 'op', value: ch }); i++; continue; }
      throw new Error('token');
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function evaluateCell(cells, address, stack) {
    stack = stack || [];
    address = plainRef(address);
    if (stack.includes(address)) return { error: CIRC };
    const raw = cells[address] || '';
    if (raw === '') return '';
    if (typeof raw === 'string' && raw[0] === '=') return evaluateFormula(raw, cells, address, stack.concat(address));
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : raw;
  }

  function evaluateFormula(raw, cells, address, stack) {
    try {
      const tokens = tokenize(raw.slice(1));
      let pos = 0;
      const peek = () => tokens[pos];
      const take = (type, value) => {
        const tok = tokens[pos];
        if (tok.type !== type || (value && tok.value !== value)) throw new Error('parse');
        pos++;
        return tok;
      };
      const parseExpression = () => parseCompare();
      const parseCompare = () => {
        let left = parseConcat();
        while (peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
          const op = take('op').value;
          const right = parseConcat();
          if (isError(left)) return left;
          if (isError(right)) return right;
          left = compare(left, op, right);
        }
        return left;
      };
      const parseConcat = () => {
        let left = parseAdd();
        while (peek().type === 'op' && peek().value === '&') {
          take('op');
          const right = parseAdd();
          if (isError(left)) return left;
          if (isError(right)) return right;
          left = formatValue(left) + formatValue(right);
        }
        return left;
      };
      const parseAdd = () => {
        let left = parseMul();
        while (peek().type === 'op' && ['+', '-'].includes(peek().value)) {
          const op = take('op').value;
          const right = parseMul();
          if (isError(left)) return left;
          if (isError(right)) return right;
          left = op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
        }
        return left;
      };
      const parseMul = () => {
        let left = parseUnary();
        while (peek().type === 'op' && ['*', '/'].includes(peek().value)) {
          const op = take('op').value;
          const right = parseUnary();
          if (isError(left)) return left;
          if (isError(right)) return right;
          if (op === '/' && toNumber(right) === 0) return { error: DIV0 };
          left = op === '*' ? toNumber(left) * toNumber(right) : toNumber(left) / toNumber(right);
        }
        return left;
      };
      const parseUnary = () => {
        if (peek().type === 'op' && peek().value === '-') { take('op'); return -toNumber(parseUnary()); }
        return parsePrimary();
      };
      const parsePrimary = () => {
        const tok = peek();
        if (tok.type === 'number') return take('number').value;
        if (tok.type === 'string') return take('string').value;
        if (tok.type === '(') { take('('); const v = parseExpression(); take(')'); return v; }
        if (tok.type === 'ref') {
          const start = take('ref').value;
          if (peek().type === ':') { take(':'); return rangeValues(start, take('ref').value); }
          return evaluateCell(cells, start, stack);
        }
        if (tok.type === 'ident') {
          const name = take('ident').value;
          if (name === 'TRUE') return true;
          if (name === 'FALSE') return false;
          take('(');
          const args = [];
          if (peek().type !== ')') {
            do { args.push(parseExpression()); if (peek().type !== ',') break; take(','); } while (true);
          }
          take(')');
          return callFunction(name, args);
        }
        throw new Error('primary');
      };
      const rangeValues = (a, b) => {
        const left = parseRef(a), right = parseRef(b);
        if (!left || !right) return { error: REF };
        const values = [];
        const r1 = Math.min(left.row, right.row), r2 = Math.max(left.row, right.row);
        const c1 = Math.min(left.col, right.col), c2 = Math.max(left.col, right.col);
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) values.push(evaluateCell(cells, indexToCol(c) + r, stack));
        return values;
      };
      const value = parseExpression();
      if (peek().type !== 'eof') throw new Error('trailing');
      return value;
    } catch (error) {
      return { error: ERR };
    }
  }

  function flatten(args) {
    return args.flatMap((arg) => Array.isArray(arg) ? flatten(arg) : [arg]);
  }

  function callFunction(name, args) {
    const values = flatten(args);
    const error = values.find(isError);
    if (error) return error;
    const nums = values.map(toNumber).filter((n) => Number.isFinite(n));
    if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
    if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
    if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
    if (name === 'COUNT') return nums.length;
    if (name === 'IF') return args[0] ? args[1] : args[2];
    if (name === 'AND') return values.every(Boolean);
    if (name === 'OR') return values.some(Boolean);
    if (name === 'NOT') return !values[0];
    if (name === 'ABS') return Math.abs(toNumber(values[0]));
    if (name === 'ROUND') return Number(toNumber(values[0]).toFixed(toNumber(values[1] || 0)));
    if (name === 'CONCAT') return values.map(formatValue).join('');
    return { error: ERR };
  }

  function adjustFormula(raw, rowOffset, colOffset) {
    return replaceRefs(raw, (ref) => {
      if (ref === REF) return ref;
      const parsed = parseRef(ref);
      if (!parsed) return ref;
      if (!parsed.absCol) parsed.col += colOffset;
      if (!parsed.absRow) parsed.row += rowOffset;
      return refToString(parsed);
    });
  }

  function transformFormula(raw, change) {
    return replaceRefs(raw, (ref) => transformRef(ref, change));
  }

  function transformRef(ref, change) {
    const parsed = parseRef(ref);
    if (!parsed) return ref;
    const isRow = change.type.endsWith('Row');
    const isInsert = change.type.startsWith('insert');
    const value = isRow ? parsed.row : parsed.col;
    if (isInsert) {
      if (value >= change.index) {
        if (isRow && !parsed.absRow) parsed.row += change.count;
        if (!isRow && !parsed.absCol) parsed.col += change.count;
      }
    } else {
      if (value >= change.index && value < change.index + change.count) return REF;
      if (value >= change.index + change.count) {
        if (isRow && !parsed.absRow) parsed.row -= change.count;
        if (!isRow && !parsed.absCol) parsed.col -= change.count;
      }
    }
    return refToString(parsed);
  }

  function replaceRefs(raw, mapper) {
    return raw.replace(/\$?[A-Z]+\$?\d+/g, mapper);
  }

  const api = { colToIndex, indexToCol, evaluateCell, evaluateFormula, formatValue, adjustFormula, transformFormula, parseRef, plainRef, REF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpreadsheetEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
