;(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const COLS = 26;
  const ROWS = 100;

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

  function normalizeAddress(address) {
    const match = /^([A-Z]+)(\d+)$/.exec(String(address || '').toUpperCase());
    if (!match) return null;
    return { col: columnToIndex(match[1]), row: Number(match[2]) - 1 };
  }

  function toAddress(col, row) {
    if (col < 0 || row < 0) return null;
    return indexToColumn(col) + String(row + 1);
  }

  function createSheet(cells) {
    return { cells: Object.assign({}, cells || {}) };
  }

  function tokenize(input) {
    const text = String(input || '');
    const tokens = [];
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }

      const two = text.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }

      if ('+-*/(),:&='.includes(char) || char === '<' || char === '>') {
        tokens.push({ type: char === ',' ? 'comma' : char === '(' || char === ')' ? 'paren' : 'op', value: char });
        i += 1;
        continue;
      }

      if (char === '"') {
        let value = '';
        i += 1;
        while (i < text.length && text[i] !== '"') {
          value += text[i];
          i += 1;
        }
        if (text[i] !== '"') throw new Error('bad string');
        i += 1;
        tokens.push({ type: 'string', value });
        continue;
      }

      const numberMatch = /^(\d+(?:\.\d+)?)/.exec(text.slice(i));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[1]) });
        i += numberMatch[1].length;
        continue;
      }

      const identMatch = /^([A-Z]+\d+|\$[A-Z]+\$?\d+|\$?[A-Z]+\$\d+|\$?[A-Z]+\$?\d+|[A-Z_][A-Z0-9_]*)/i.exec(text.slice(i));
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[1].toUpperCase() });
        i += identMatch[1].length;
        continue;
      }

      throw new Error('bad token');
    }

    return tokens;
  }

  function parseFormula(input) {
    const tokens = tokenize(input);
    let index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw new Error('bad syntax');
      }
      index += 1;
      return token;
    }

    function parsePrimary() {
      const token = peek();
      if (!token) throw new Error('bad syntax');

      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        index += 1;
        return { type: 'string', value: token.value };
      }
      if (token.type === 'ident') {
        index += 1;
        if (peek() && peek().type === 'paren' && peek().value === '(') {
          consume('paren', '(');
          const args = [];
          if (!(peek() && peek().type === 'paren' && peek().value === ')')) {
            while (true) {
              args.push(parseExpression());
              if (peek() && peek().type === 'comma') {
                consume('comma');
                continue;
              }
              break;
            }
          }
          consume('paren', ')');
          return { type: 'call', name: token.value, args };
        }
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'boolean', value: token.value === 'TRUE' };
        }
        if (peek() && peek().type === 'op' && peek().value === ':') {
          consume('op', ':');
          const end = consume('ident').value;
          return { type: 'range', start: token.value, end };
        }
        return { type: 'ref', value: token.value };
      }
      if (token.type === 'paren' && token.value === '(') {
        consume('paren', '(');
        const expr = parseExpression();
        consume('paren', ')');
        return expr;
      }
      if (token.type === 'op' && token.value === '-') {
        consume('op', '-');
        return { type: 'unary', op: '-', value: parsePrimary() };
      }

      throw new Error('bad syntax');
    }

    function parseBinary(nextParser, operators) {
      let left = nextParser();
      while (peek() && peek().type === 'op' && operators.includes(peek().value)) {
        const op = consume('op').value;
        const right = nextParser();
        left = { type: 'binary', op, left, right };
      }
      return left;
    }

    const parseProduct = () => parseBinary(parsePrimary, ['*', '/']);
    const parseSum = () => parseBinary(parseProduct, ['+', '-']);
    const parseConcat = () => parseBinary(parseSum, ['&']);
    const parseComparison = () => parseBinary(parseConcat, ['=', '<>', '<', '<=', '>', '>=']);
    const parseExpression = () => parseComparison();

    const ast = parseExpression();
    if (index !== tokens.length) throw new Error('bad syntax');
    return ast;
  }

  function parseReference(reference) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(reference);
    if (!match) throw new Error('bad ref');
    return {
      colAbsolute: !!match[1],
      col: columnToIndex(match[2]),
      rowAbsolute: !!match[3],
      row: Number(match[4]) - 1,
    };
  }

  function shiftReference(reference, rowOffset, colOffset) {
    const parsed = parseReference(reference);
    const nextCol = parsed.colAbsolute ? parsed.col : parsed.col + colOffset;
    const nextRow = parsed.rowAbsolute ? parsed.row : parsed.row + rowOffset;
    return (parsed.colAbsolute ? '$' : '') + indexToColumn(Math.max(0, nextCol)) + (parsed.rowAbsolute ? '$' : '') + String(Math.max(0, nextRow) + 1);
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    return String(formula || '').replace(/\$?[A-Z]+\$?\d+/g, function (match) {
      return shiftReference(match, rowOffset, colOffset);
    });
  }

  function toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return String(value || '').length > 0;
  }

  function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === '' || value == null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function flatten(values) {
    const out = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) out.push.apply(out, flatten(value));
      else out.push(value);
    });
    return out;
  }

  function rangeAddresses(start, end) {
    const a = parseReference(start.replace(/\$/g, ''));
    const b = parseReference(end.replace(/\$/g, ''));
    const cells = [];
    for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row += 1) {
      for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col += 1) {
        cells.push(toAddress(col, row));
      }
    }
    return cells;
  }

  function formatValue(value) {
    if (value && value.error) return value.error;
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value == null) return '';
    return String(value);
  }

  function evaluateCell(sheet, address, state) {
    const currentState = state || { stack: [], cache: {} };
    if (currentState.cache[address]) return currentState.cache[address];
    if (currentState.stack.includes(address)) {
      return { raw: sheet.cells[address] || '', value: { error: '#CIRC!' }, display: '#CIRC!' };
    }

    currentState.stack.push(address);
    const raw = sheet.cells[address] || '';
    let value;

    try {
      value = evaluateRaw(sheet, raw, currentState);
    } catch (error) {
      const message = error && error.message;
      value = { error: typeof message === 'string' && message[0] === '#' ? message : '#ERR!' };
    }

    currentState.stack.pop();
    const result = { raw, value, display: formatValue(value) };
    currentState.cache[address] = result;
    return result;
  }

  function evaluateRaw(sheet, raw, state) {
    if (raw === '') return '';
    if (raw[0] !== '=') {
      const numeric = Number(raw);
      return raw.trim() !== '' && Number.isFinite(numeric) ? numeric : raw;
    }
    const ast = parseFormula(raw.slice(1));
    return evaluateNode(sheet, ast, state);
  }

  function evaluateNode(sheet, node, state) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'ref': {
        const address = node.value.replace(/\$/g, '');
        const result = evaluateCell(sheet, address, state).value;
        if (result && result.error) throw new Error(result.error);
        return result === '' ? 0 : result;
      }
      case 'range':
        return rangeAddresses(node.start, node.end).map(function (address) {
          return evaluateCell(sheet, address, state).value;
        });
      case 'unary':
        return -toNumber(evaluateNode(sheet, node.value, state));
      case 'binary': {
        const left = evaluateNode(sheet, node.left, state);
        const right = evaluateNode(sheet, node.right, state);
        if (node.op === '+') return toNumber(left) + toNumber(right);
        if (node.op === '-') return toNumber(left) - toNumber(right);
        if (node.op === '*') return toNumber(left) * toNumber(right);
        if (node.op === '/') {
          const divisor = toNumber(right);
          if (divisor === 0) throw new Error('#DIV/0!');
          return toNumber(left) / divisor;
        }
        if (node.op === '&') return String(left == null ? '' : left) + String(right == null ? '' : right);
        if (node.op === '=') return left === right;
        if (node.op === '<>') return left !== right;
        if (node.op === '<') return left < right;
        if (node.op === '<=') return left <= right;
        if (node.op === '>') return left > right;
        if (node.op === '>=') return left >= right;
        throw new Error('#ERR!');
      }
      case 'call': {
        const args = node.args.map(function (arg) { return evaluateNode(sheet, arg, state); });
        return callFunction(node.name, args);
      }
      default:
        throw new Error('#ERR!');
    }
  }

  function callFunction(name, args) {
    const values = flatten(args).map(function (value) {
      if (value && value.error) throw new Error(value.error);
      return value == null ? '' : value;
    });

    switch (name) {
      case 'SUM':
        return values.reduce(function (sum, value) { return sum + toNumber(value); }, 0);
      case 'AVERAGE':
        return values.length ? values.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / values.length : 0;
      case 'MIN':
        return values.length ? Math.min.apply(Math, values.map(toNumber)) : 0;
      case 'MAX':
        return values.length ? Math.max.apply(Math, values.map(toNumber)) : 0;
      case 'COUNT':
        return values.filter(function (value) { return value !== ''; }).length;
      case 'IF':
        return toBoolean(args[0]) ? args[1] : args[2];
      case 'AND':
        return values.every(toBoolean);
      case 'OR':
        return values.some(toBoolean);
      case 'NOT':
        return !toBoolean(args[0]);
      case 'ABS':
        return Math.abs(toNumber(args[0]));
      case 'ROUND':
        return Math.round(toNumber(args[0]) * Math.pow(10, toNumber(args[1] || 0))) / Math.pow(10, toNumber(args[1] || 0));
      case 'CONCAT':
        return values.join('');
      default:
        throw new Error('#ERR!');
    }
  }

  return {
    COLS,
    ROWS,
    createSheet,
    evaluateCell,
    normalizeAddress,
    toAddress,
    shiftFormula,
    indexToColumn,
  };
});
