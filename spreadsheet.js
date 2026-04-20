(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const COLS = 26;
  const ROWS = 100;
  const ERR = {
    generic: '#ERR!',
    div0: '#DIV/0!',
    circ: '#CIRC!',
    ref: '#REF!',
  };

  function key(row, col) {
    return row + ',' + col;
  }

  function createSheet() {
    return { cells: Object.create(null) };
  }

  function setCellRaw(sheet, row, col, raw) {
    const next = String(raw ?? '');
    if (next) {
      sheet.cells[key(row, col)] = next;
      return;
    }
    delete sheet.cells[key(row, col)];
  }

  function getCellRaw(sheet, row, col) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
      return null;
    }
    return sheet.cells[key(row, col)] ?? '';
  }

  function getCellComputed(sheet, row, col) {
    const cache = new Map();
    return evaluateCell(sheet, row, col, cache, new Set());
  }

  function evaluateCell(sheet, row, col, cache, visiting) {
    const cellKey = key(row, col);
    if (cache.has(cellKey)) {
      return cache.get(cellKey);
    }
    const raw = getCellRaw(sheet, row, col);
    if (raw === null) {
      return computed(raw, errorValue(ERR.ref));
    }
    if (!raw) {
      return computed('', '');
    }
    if (!raw.startsWith('=')) {
      return computed(raw, parseLiteral(raw));
    }
    if (visiting.has(cellKey)) {
      return computed(raw, errorValue(ERR.circ));
    }

    visiting.add(cellKey);
    let result;
    try {
      const parser = createParser(raw.slice(1));
      const ast = parser.parseExpression();
      parser.expectEnd();
      result = computed(raw, evaluateAst(ast, makeContext(sheet, cache, visiting, row, col)));
    } catch (error) {
      result = computed(raw, normalizeError(error));
    }
    visiting.delete(cellKey);
    cache.set(cellKey, result);
    return result;
  }

  function computed(raw, value) {
    if (isError(value)) {
      return { raw, value, display: value.error };
    }
    return { raw, value, display: formatValue(value) };
  }

  function normalizeError(error) {
    if (isError(error)) {
      return error;
    }
    if (error && error.code && ERR[error.code]) {
      return errorValue(ERR[error.code]);
    }
    return errorValue(ERR.generic);
  }

  function errorValue(code) {
    return { type: 'error', error: code };
  }

  function isError(value) {
    return Boolean(value && value.type === 'error');
  }

  function parseLiteral(raw) {
    const trimmed = raw.trim();
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (trimmed.toUpperCase() === 'TRUE') {
      return true;
    }
    if (trimmed.toUpperCase() === 'FALSE') {
      return false;
    }
    return raw;
  }

  function formatValue(value) {
    if (value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ERR.generic;
      }
      const rounded = Math.abs(value) < 1e-12 ? 0 : value;
      return String(Number(rounded.toFixed(12))).replace(/\.0$/, '');
    }
    return String(value);
  }

  function numericValue(value) {
    if (isError(value)) {
      throw value;
    }
    if (value === '' || value == null) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function textValue(value) {
    if (isError(value)) {
      throw value;
    }
    if (value === '' || value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function truthyValue(value) {
    if (isError(value)) {
      throw value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (value === '' || value == null) {
      return false;
    }
    return String(value).length > 0;
  }

  function flattenArgs(args) {
    const flat = [];
    for (const arg of args) {
      if (Array.isArray(arg)) {
        flat.push(...flattenArgs(arg));
      } else {
        flat.push(arg);
      }
    }
    return flat;
  }

  function makeContext(sheet, cache, visiting) {
    return {
      getCell(ref) {
        const coords = refToCoords(ref);
        if (!coords) {
          return errorValue(ERR.ref);
        }
        return evaluateCell(sheet, coords.row, coords.col, cache, visiting).value;
      },
      getRange(startRef, endRef) {
        const start = refToCoords(startRef);
        const end = refToCoords(endRef);
        if (!start || !end) {
          throw errorValue(ERR.ref);
        }
        const rowStart = Math.min(start.row, end.row);
        const rowEnd = Math.max(start.row, end.row);
        const colStart = Math.min(start.col, end.col);
        const colEnd = Math.max(start.col, end.col);
        const values = [];
        for (let row = rowStart; row <= rowEnd; row += 1) {
          for (let col = colStart; col <= colEnd; col += 1) {
            values.push(evaluateCell(sheet, row, col, cache, visiting).value);
          }
        }
        return values;
      },
      callFunction(name, args) {
        const flat = flattenArgs(args);
        switch (name) {
          case 'SUM':
            return flat.reduce((sum, value) => sum + numericValue(value), 0);
          case 'AVERAGE':
            return flat.length ? flat.reduce((sum, value) => sum + numericValue(value), 0) / flat.length : 0;
          case 'MIN':
            return flat.length ? Math.min(...flat.map(numericValue)) : 0;
          case 'MAX':
            return flat.length ? Math.max(...flat.map(numericValue)) : 0;
          case 'COUNT':
            return flat.filter((value) => value !== '' && value != null).length;
          case 'IF':
            return truthyValue(args[0]) ? args[1] : args[2];
          case 'AND':
            return flat.every(truthyValue);
          case 'OR':
            return flat.some(truthyValue);
          case 'NOT':
            return !truthyValue(args[0]);
          case 'ABS':
            return Math.abs(numericValue(args[0]));
          case 'ROUND':
            return roundTo(numericValue(args[0]), numericValue(args[1] ?? 0));
          case 'CONCAT':
            return flat.map(textValue).join('');
          default:
            throw errorValue(ERR.generic);
        }
      },
    };
  }

  function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function evaluateAst(node, context) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'cell':
        return context.getCell(node.ref);
      case 'range':
        return context.getRange(node.start, node.end);
      case 'unary': {
        const value = evaluateAst(node.value, context);
        if (node.op === '-') {
          return -numericValue(value);
        }
        return numericValue(value);
      }
      case 'binary': {
        const left = evaluateAst(node.left, context);
        const right = evaluateAst(node.right, context);
        switch (node.op) {
          case '+':
            return numericValue(left) + numericValue(right);
          case '-':
            return numericValue(left) - numericValue(right);
          case '*':
            return numericValue(left) * numericValue(right);
          case '/': {
            const divisor = numericValue(right);
            if (divisor === 0) {
              throw errorValue(ERR.div0);
            }
            return numericValue(left) / divisor;
          }
          case '&':
            return textValue(left) + textValue(right);
          case '=':
            return compareValues(left, right) === 0;
          case '<>':
            return compareValues(left, right) !== 0;
          case '<':
            return compareValues(left, right) < 0;
          case '<=':
            return compareValues(left, right) <= 0;
          case '>':
            return compareValues(left, right) > 0;
          case '>=':
            return compareValues(left, right) >= 0;
          default:
            throw errorValue(ERR.generic);
        }
      }
      case 'call':
        return context.callFunction(node.name, node.args.map((arg) => evaluateAst(arg, context)));
      default:
        throw errorValue(ERR.generic);
    }
  }

  function compareValues(left, right) {
    const leftNumber = numericMaybe(left);
    const rightNumber = numericMaybe(right);
    if (leftNumber != null && rightNumber != null) {
      return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
    }
    const leftText = textValue(left);
    const rightText = textValue(right);
    return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
  }

  function numericMaybe(value) {
    if (value === '' || value == null) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function createParser(input) {
    let index = 0;

    return {
      parseExpression() {
        return parseComparison();
      },
      expectEnd() {
        skipWhitespace();
        if (index < input.length) {
          throw new Error('Unexpected token');
        }
      },
    };

    function parseComparison() {
      let node = parseConcat();
      skipWhitespace();
      while (true) {
        const op = matchOne(['<>', '<=', '>=', '=', '<', '>']);
        if (!op) {
          return node;
        }
        const right = parseConcat();
        node = { type: 'binary', op, left: node, right };
        skipWhitespace();
      }
    }

    function parseConcat() {
      let node = parseAddSub();
      skipWhitespace();
      while (match('&')) {
        const right = parseAddSub();
        node = { type: 'binary', op: '&', left: node, right };
        skipWhitespace();
      }
      return node;
    }

    function parseAddSub() {
      let node = parseMulDiv();
      skipWhitespace();
      while (true) {
        const op = matchOne(['+', '-']);
        if (!op) {
          return node;
        }
        const right = parseMulDiv();
        node = { type: 'binary', op, left: node, right };
        skipWhitespace();
      }
    }

    function parseMulDiv() {
      let node = parseUnary();
      skipWhitespace();
      while (true) {
        const op = matchOne(['*', '/']);
        if (!op) {
          return node;
        }
        const right = parseUnary();
        node = { type: 'binary', op, left: node, right };
        skipWhitespace();
      }
    }

    function parseUnary() {
      skipWhitespace();
      if (match('-')) {
        return { type: 'unary', op: '-', value: parseUnary() };
      }
      if (match('+')) {
        return { type: 'unary', op: '+', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      skipWhitespace();
      if (match('(')) {
        const node = parseComparison();
        if (!match(')')) {
          throw new Error('Missing close paren');
        }
        return node;
      }

      const string = readString();
      if (string != null) {
        return { type: 'string', value: string };
      }

      const number = readNumber();
      if (number != null) {
        return { type: 'number', value: number };
      }

      const name = readIdentifier();
      if (name) {
        const upper = name.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE') {
          return { type: 'boolean', value: upper === 'TRUE' };
        }
        if (isCellRefToken(name)) {
          if (match(':')) {
            const end = readCellRef();
            if (!end) {
              throw new Error('Bad range');
            }
            return { type: 'range', start: normalizeRef(name), end: normalizeRef(end) };
          }
          return { type: 'cell', ref: normalizeRef(name) };
        }
        if (match('(')) {
          const args = [];
          skipWhitespace();
          if (!match(')')) {
            do {
              args.push(parseComparison());
              skipWhitespace();
            } while (match(','));
            if (!match(')')) {
              throw new Error('Missing function close paren');
            }
          }
          return { type: 'call', name: upper, args };
        }
      }

      throw new Error('Unexpected token');
    }

    function skipWhitespace() {
      while (index < input.length && /\s/.test(input[index])) {
        index += 1;
      }
    }

    function match(token) {
      skipWhitespace();
      if (input.slice(index, index + token.length) === token) {
        index += token.length;
        return true;
      }
      return false;
    }

    function matchOne(tokens) {
      skipWhitespace();
      for (const token of tokens) {
        if (input.slice(index, index + token.length) === token) {
          index += token.length;
          return token;
        }
      }
      return null;
    }

    function readString() {
      skipWhitespace();
      if (input[index] !== '"') {
        return null;
      }
      index += 1;
      let value = '';
      while (index < input.length && input[index] !== '"') {
        value += input[index];
        index += 1;
      }
      if (input[index] !== '"') {
        throw new Error('Unterminated string');
      }
      index += 1;
      return value;
    }

    function readNumber() {
      skipWhitespace();
      const matchResult = input.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/);
      if (!matchResult) {
        return null;
      }
      index += matchResult[0].length;
      return Number(matchResult[0]);
    }

    function readIdentifier() {
      skipWhitespace();
      const matchResult = input.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (!matchResult) {
        return null;
      }
      index += matchResult[0].length;
      return matchResult[0];
    }

    function readCellRef() {
      skipWhitespace();
      const matchResult = input.slice(index).match(/^\$?[A-Za-z]+\$?\d+/);
      if (!matchResult) {
        return null;
      }
      index += matchResult[0].length;
      return matchResult[0];
    }
  }

  function isCellRefToken(token) {
    return /^\$?[A-Za-z]+\$?\d+$/.test(token);
  }

  function normalizeRef(ref) {
    const match = ref.match(/^(\$?)([A-Za-z]+)(\$?)(\d+)$/);
    return match[1] + match[2].toUpperCase() + match[3] + match[4];
  }

  function refToCoords(ref) {
    const match = normalizeRef(ref).match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      return null;
    }
    const col = lettersToColumn(match[2]);
    const row = Number(match[4]) - 1;
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
      return null;
    }
    return { row, col };
  }

  function lettersToColumn(letters) {
    let col = 0;
    for (let index = 0; index < letters.length; index += 1) {
      col = col * 26 + (letters.charCodeAt(index) - 64);
    }
    return col - 1;
  }

  function columnToLetters(col) {
    let value = col + 1;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function shiftFormula(raw, rowOffset, colOffset) {
    if (!raw || raw[0] !== '=') {
      return raw;
    }
    return '=' + raw.slice(1).replace(/(\$?)([A-Za-z]+)(\$?)(\d+)/g, function (_, absCol, colLetters, absRow, rowDigits) {
      const nextCol = absCol ? lettersToColumn(colLetters.toUpperCase()) : lettersToColumn(colLetters.toUpperCase()) + colOffset;
      const nextRow = absRow ? Number(rowDigits) - 1 : Number(rowDigits) - 1 + rowOffset;
      return (absCol ? '$' : '') + columnToLetters(Math.max(0, nextCol)) + (absRow ? '$' : '') + String(Math.max(0, nextRow) + 1);
    });
  }

  return {
    COLS,
    ROWS,
    ERR,
    createSheet,
    setCellRaw,
    getCellRaw,
    getCellComputed,
    shiftFormula,
    refToCoords,
    columnToLetters,
  };
});
