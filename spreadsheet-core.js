(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const ERROR = {
    ERR: '#ERR!',
    CIRC: '#CIRC!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
  };

  const FUNCTION_NAMES = new Set([
    'SUM',
    'AVERAGE',
    'MIN',
    'MAX',
    'COUNT',
    'IF',
    'AND',
    'OR',
    'NOT',
    'ABS',
    'ROUND',
    'CONCAT',
  ]);

  function isCellRef(value) {
    return /^\$?[A-Z]+\$?\d+$/.test(value);
  }

  function columnToIndex(label) {
    let value = 0;
    for (let i = 0; i < label.length; i += 1) {
      value = value * 26 + (label.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToColumn(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function parseCellRef(ref) {
    const match = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      throw new Error(ERROR.REF);
    }
    return {
      columnAbsolute: Boolean(match[1]),
      columnLabel: match[2],
      rowAbsolute: Boolean(match[3]),
      rowNumber: Number(match[4]),
      col: columnToIndex(match[2]),
      row: Number(match[4]) - 1,
    };
  }

  function makeCellRef(row, col) {
    if (row < 0 || col < 0) {
      throw new Error(ERROR.REF);
    }
    return `${indexToColumn(col)}${row + 1}`;
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
      const char = input[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (/[0-9.]/.test(char)) {
        let end = index + 1;
        while (end < input.length && /[0-9.]/.test(input[end])) {
          end += 1;
        }
        tokens.push({ type: 'number', value: Number(input.slice(index, end)) });
        index = end;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < input.length && input[end] !== '"') {
          value += input[end];
          end += 1;
        }
        if (input[end] !== '"') {
          throw new Error(ERROR.ERR);
        }
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      const twoChar = input.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }
      if ('+-*/&=<>():,'.includes(char)) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? char : 'operator', value: char });
        index += 1;
        continue;
      }
      if (/[A-Z$]/i.test(char)) {
        let end = index + 1;
        while (end < input.length && /[A-Z0-9$]/i.test(input[end])) {
          end += 1;
        }
        tokens.push({ type: 'identifier', value: input.slice(index, end).toUpperCase() });
        index = end;
        continue;
      }
      throw new Error(ERROR.ERR);
    }

    return tokens;
  }

  function parseFormula(input) {
    const tokens = tokenize(input);
    let index = 0;

    function peek(offset) {
      return tokens[index + (offset || 0)];
    }

    function consume(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw new Error(ERROR.ERR);
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek() && peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = consume('operator').value;
        node = { type: 'binary', operator, left: node, right: parseConcat() };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAddSub();
      while (peek() && peek().type === 'operator' && peek().value === '&') {
        consume('operator', '&');
        node = { type: 'binary', operator: '&', left: node, right: parseAddSub() };
      }
      return node;
    }

    function parseAddSub() {
      let node = parseMulDiv();
      while (peek() && peek().type === 'operator' && ['+', '-'].includes(peek().value)) {
        const operator = consume('operator').value;
        node = { type: 'binary', operator, left: node, right: parseMulDiv() };
      }
      return node;
    }

    function parseMulDiv() {
      let node = parseUnary();
      while (peek() && peek().type === 'operator' && ['*', '/'].includes(peek().value)) {
        const operator = consume('operator').value;
        node = { type: 'binary', operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (peek() && peek().type === 'operator' && peek().value === '-') {
        consume('operator', '-');
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parseArguments() {
      const args = [];
      if (peek() && peek().type === ')') {
        return args;
      }
      do {
        let argument = parseExpression();
        if (argument.type === 'ref' && peek() && peek().type === ':') {
          consume(':', ':');
          argument = { type: 'range', start: argument, end: parsePrimary() };
        }
        args.push(argument);
        if (!peek() || peek().type !== ',') {
          break;
        }
        consume(',', ',');
      } while (true);
      return args;
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new Error(ERROR.ERR);
      }
      if (token.type === 'number') {
        consume('number');
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        consume('string');
        return { type: 'string', value: token.value };
      }
      if (token.type === '(') {
        consume('(', '(');
        const node = parseExpression();
        consume(')', ')');
        return node;
      }
      if (token.type === 'identifier') {
        const value = consume('identifier').value;
        if (peek() && peek().type === '(') {
          consume('(', '(');
          const args = parseArguments();
          consume(')', ')');
          if (!FUNCTION_NAMES.has(value)) {
            throw new Error(ERROR.ERR);
          }
          return { type: 'call', name: value, args };
        }
        if (value === 'TRUE' || value === 'FALSE') {
          return { type: 'boolean', value: value === 'TRUE' };
        }
        if (isCellRef(value)) {
          return { type: 'ref', value };
        }
      }
      throw new Error(ERROR.ERR);
    }

    const ast = parseExpression();
    if (index !== tokens.length) {
      throw new Error(ERROR.ERR);
    }
    return ast;
  }

  function flatten(values) {
    const result = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        result.push.apply(result, flatten(value));
      } else {
        result.push(value);
      }
    });
    return result;
  }

  function isErrorValue(value) {
    return typeof value === 'string' && value[0] === '#';
  }

  function coerceNumber(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === '' || value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function coerceBoolean(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function coerceText(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function formatDisplay(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function enumerateRange(startRef, endRef) {
    const start = parseCellRef(startRef);
    const end = parseCellRef(endRef);
    const rowStart = Math.min(start.row, end.row);
    const rowEnd = Math.max(start.row, end.row);
    const colStart = Math.min(start.col, end.col);
    const colEnd = Math.max(start.col, end.col);
    const refs = [];

    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        refs.push(makeCellRef(row, col));
      }
    }
    return refs;
  }

  function applyFunction(name, args) {
    const values = flatten(args);
    const numericValues = values.map(coerceNumber);
    const firstError = numericValues.find(isErrorValue) || values.find(isErrorValue);
    if (firstError) {
      return firstError;
    }

    switch (name) {
      case 'SUM':
        return numericValues.reduce((sum, value) => sum + value, 0);
      case 'AVERAGE':
        return numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : 0;
      case 'MIN':
        return numericValues.length ? Math.min.apply(null, numericValues) : 0;
      case 'MAX':
        return numericValues.length ? Math.max.apply(null, numericValues) : 0;
      case 'COUNT':
        return values.filter((value) => value !== '').length;
      case 'IF':
        return coerceBoolean(args[0]) ? args[1] : args[2];
      case 'AND':
        return values.every((value) => coerceBoolean(value));
      case 'OR':
        return values.some((value) => coerceBoolean(value));
      case 'NOT':
        return !coerceBoolean(args[0]);
      case 'ABS':
        return Math.abs(coerceNumber(args[0]));
      case 'ROUND':
        return Number(coerceNumber(args[0]).toFixed(args[1] === undefined ? 0 : coerceNumber(args[1])));
      case 'CONCAT':
        return values.map(coerceText).join('');
      default:
        return ERROR.ERR;
    }
  }

  function evaluateAst(node, getCellValue) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'unary': {
        const value = evaluateAst(node.value, getCellValue);
        const number = coerceNumber(value);
        return isErrorValue(number) ? number : -number;
      }
      case 'ref':
        return getCellValue(node.value);
      case 'range':
        return enumerateRange(node.start.value, node.end.value).map(getCellValue);
      case 'call':
        return applyFunction(node.name, node.args.map((arg) => evaluateAst(arg, getCellValue)));
      case 'binary': {
        const left = evaluateAst(node.left, getCellValue);
        const right = evaluateAst(node.right, getCellValue);
        if (isErrorValue(left)) {
          return left;
        }
        if (isErrorValue(right)) {
          return right;
        }
        if (node.operator === '&') {
          return coerceText(left) + coerceText(right);
        }
        if (['=', '<>', '<', '<=', '>', '>='].includes(node.operator)) {
          switch (node.operator) {
            case '=': return left === right;
            case '<>': return left !== right;
            case '<': return left < right;
            case '<=': return left <= right;
            case '>': return left > right;
            case '>=': return left >= right;
          }
        }
        const a = coerceNumber(left);
        const b = coerceNumber(right);
        if (isErrorValue(a)) {
          return a;
        }
        if (isErrorValue(b)) {
          return b;
        }
        switch (node.operator) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? ERROR.DIV0 : a / b;
          default: return ERROR.ERR;
        }
      }
      default:
        return ERROR.ERR;
    }
  }

  function evaluateRaw(raw, getCellValue) {
    if (raw === undefined || raw === null || raw === '') {
      return { value: '', display: '' };
    }
    if (raw[0] !== '=') {
      const numeric = Number(raw);
      const value = raw.trim() !== '' && !Number.isNaN(numeric) ? numeric : raw;
      return { value, display: formatDisplay(value) };
    }
    try {
      const value = evaluateAst(parseFormula(raw.slice(1)), getCellValue);
      return { value, display: formatDisplay(value) };
    } catch (error) {
      const marker = error && typeof error.message === 'string' && error.message[0] === '#' ? error.message : ERROR.ERR;
      return { value: marker, display: marker };
    }
  }

  function evaluateSheet(cells) {
    const result = {};
    const cache = {};
    const visiting = new Set();

    function evaluateCell(ref) {
      if (cache[ref]) {
        return cache[ref];
      }
      if (visiting.has(ref)) {
        cache[ref] = { raw: cells[ref] || '', value: ERROR.CIRC, display: ERROR.CIRC };
        return cache[ref];
      }
      visiting.add(ref);
      const entry = evaluateRaw(cells[ref] || '', function (nextRef) {
        return evaluateCell(nextRef).value;
      });
      cache[ref] = { raw: cells[ref] || '', value: entry.value, display: entry.display };
      visiting.delete(ref);
      return cache[ref];
    }

    Object.keys(cells).forEach(function (ref) {
      result[ref] = evaluateCell(ref);
    });

    return result;
  }

  return {
    ERROR,
    evaluateSheet,
    parseCellRef,
    makeCellRef,
    indexToColumn,
  };
});
