(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetFormula = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const ERROR = '#ERR!';
  const DIV_ZERO = '#DIV/0!';
  const CIRC = '#CIRC!';
  const NAME = '#NAME?';
  const COLS = 26;
  const ROWS = 100;

  function isCellId(token) {
    return /^[A-Z][1-9][0-9]*$/.test(token);
  }

  function cellToPoint(cellId) {
    const match = /^([A-Z])(\d+)$/.exec(cellId);
    if (!match) {
      return null;
    }

    return {
      col: match[1].charCodeAt(0) - 65,
      row: Number(match[2]) - 1,
    };
  }

  function pointToCell(col, row) {
    return String.fromCharCode(65 + col) + String(row + 1);
  }

  function parseNumber(raw) {
    const trimmed = String(raw).trim();
    if (!trimmed) {
      return null;
    }

    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeScalar(value) {
    if (Array.isArray(value)) {
      return value.length ? normalizeScalar(value[0]) : 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (value === true) {
      return 1;
    }

    if (value === false || value == null || value === '') {
      return 0;
    }

    const maybeNumber = parseNumber(value);
    return maybeNumber == null ? value : maybeNumber;
  }

  function toNumber(value) {
    const normalized = normalizeScalar(value);
    if (typeof normalized === 'number') {
      return normalized;
    }

    const maybeNumber = parseNumber(normalized);
    if (maybeNumber == null) {
      throw new Error(ERROR);
    }

    return maybeNumber;
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

  function tokenize(input) {
    const tokens = [];
    let index = 0;
    while (index < input.length) {
      const rest = input.slice(index);
      const whitespace = /^\s+/.exec(rest);
      if (whitespace) {
        index += whitespace[0].length;
        continue;
      }

      const number = /^\d+(?:\.\d+)?/.exec(rest);
      if (number) {
        tokens.push({ type: 'number', value: Number(number[0]) });
        index += number[0].length;
        continue;
      }

      const word = /^[A-Z]+\d*(?::[A-Z]+\d+)?/.exec(rest);
      if (word) {
        tokens.push({ type: 'word', value: word[0] });
        index += word[0].length;
        continue;
      }

      const symbol = /^[()+\-*/,<>!=]/.exec(rest);
      if (symbol) {
        const first = symbol[0];
        const next = input[index + 1] || '';
        if ((first === '>' || first === '<' || first === '=' || first === '!') && next === '=') {
          tokens.push({ type: 'op', value: first + next });
          index += 2;
          continue;
        }

        tokens.push({ type: first === ',' || first === '(' || first === ')' ? first : 'op', value: first });
        index += 1;
        continue;
      }

      throw new Error(ERROR);
    }

    return tokens;
  }

  function parseFormula(input) {
    const tokens = tokenize(input);
    let index = 0;

    function current() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = current();
      if (!token || token.type !== type || (value != null && token.value !== value)) {
        throw new Error(ERROR);
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseAdditive();
      while (current() && current().type === 'op' && ['>', '<', '>=', '<=', '=', '!='].includes(current().value)) {
        const operator = consume('op').value;
        node = { type: 'binary', operator, left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (current() && current().type === 'op' && (current().value === '+' || current().value === '-')) {
        const operator = consume('op').value;
        node = { type: 'binary', operator, left: node, right: parseMultiplicative() };
      }
      return node;
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (current() && current().type === 'op' && (current().value === '*' || current().value === '/')) {
        const operator = consume('op').value;
        node = { type: 'binary', operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (current() && current().type === 'op' && current().value === '-') {
        consume('op', '-');
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = current();
      if (!token) {
        throw new Error(ERROR);
      }

      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: token.value };
      }

      if (token.type === '(') {
        consume('(');
        const node = parseExpression();
        consume(')');
        return node;
      }

      if (token.type === 'word') {
        index += 1;
        const value = token.value;
        if (current() && current().type === '(') {
          consume('(');
          const args = [];
          if (!current() || current().type !== ')') {
            args.push(parseExpression());
            while (current() && current().type === ',') {
              consume(',');
              args.push(parseExpression());
            }
          }
          consume(')');
          return { type: 'call', name: value, args };
        }

        if (value.includes(':')) {
          const [start, end] = value.split(':');
          return { type: 'range', start, end };
        }

        if (isCellId(value)) {
          return { type: 'cell', id: value };
        }

        return { type: 'identifier', value };
      }

      throw new Error(ERROR);
    }

    const ast = parseExpression();
    if (index !== tokens.length) {
      throw new Error(ERROR);
    }
    return ast;
  }

  function evaluateSheet(rawCells) {
    const result = {};
    const evaluating = new Set();

    function getCell(id) {
      if (result[id]) {
        return result[id];
      }

      const raw = Object.prototype.hasOwnProperty.call(rawCells, id) ? rawCells[id] : '';
      if (!String(raw).startsWith('=')) {
        const maybeNumber = parseNumber(raw);
        const value = maybeNumber == null ? String(raw || '') : maybeNumber;
        result[id] = { raw, value, display: value === '' ? '' : String(value) };
        return result[id];
      }

      if (evaluating.has(id)) {
        result[id] = { raw, value: null, display: CIRC };
        return result[id];
      }

      evaluating.add(id);
      try {
        const ast = parseFormula(String(raw).slice(1));
        const value = evalNode(ast);
        const normalized = normalizeScalar(value);
        result[id] = {
          raw,
          value: normalized,
          display: normalized === '' ? '' : String(normalized),
        };
      } catch (error) {
        const display = error && error.message ? error.message : ERROR;
        result[id] = { raw, value: null, display };
      }
      evaluating.delete(id);
      return result[id];
    }

    function getRange(start, end) {
      const startPoint = cellToPoint(start);
      const endPoint = cellToPoint(end);
      if (!startPoint || !endPoint) {
        throw new Error(ERROR);
      }

      const minCol = Math.min(startPoint.col, endPoint.col);
      const maxCol = Math.max(startPoint.col, endPoint.col);
      const minRow = Math.min(startPoint.row, endPoint.row);
      const maxRow = Math.max(startPoint.row, endPoint.row);
      const values = [];

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          values.push(getCell(pointToCell(col, row)).value);
        }
      }

      return values;
    }

    function evalCall(name, args) {
      const flat = flattenArgs(args).map(normalizeScalar);
      switch (name) {
        case 'SUM':
          return flat.reduce((sum, item) => sum + toNumber(item), 0);
        case 'AVERAGE':
          return flat.length ? flat.reduce((sum, item) => sum + toNumber(item), 0) / flat.length : 0;
        case 'MIN':
          return flat.length ? Math.min(...flat.map(toNumber)) : 0;
        case 'MAX':
          return flat.length ? Math.max(...flat.map(toNumber)) : 0;
        case 'COUNT':
          return flat.filter(function (item) {
            return parseNumber(item) != null;
          }).length;
        case 'IF':
          if (args.length !== 3) {
            throw new Error(ERROR);
          }
          return normalizeScalar(args[0]) ? args[1] : args[2];
        default:
          throw new Error(NAME);
      }
    }

    function evalNode(node) {
      switch (node.type) {
        case 'number':
          return node.value;
        case 'unary':
          return -toNumber(evalNode(node.value));
        case 'binary': {
          const left = evalNode(node.left);
          const right = evalNode(node.right);
          if (['>', '<', '>=', '<=', '=', '!='].includes(node.operator)) {
            const a = normalizeScalar(left);
            const b = normalizeScalar(right);
            switch (node.operator) {
              case '>': return toNumber(a) > toNumber(b);
              case '<': return toNumber(a) < toNumber(b);
              case '>=': return toNumber(a) >= toNumber(b);
              case '<=': return toNumber(a) <= toNumber(b);
              case '=': return a === b;
              case '!=': return a !== b;
            }
          }
          const a = toNumber(left);
          const b = toNumber(right);
          switch (node.operator) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/':
              if (b === 0) {
                throw new Error(DIV_ZERO);
              }
              return a / b;
            default:
              throw new Error(ERROR);
          }
        }
        case 'cell':
          return getCell(node.id).display === CIRC ? (function () { throw new Error(CIRC); })() : getCell(node.id).value;
        case 'range':
          return getRange(node.start, node.end);
        case 'call':
          return evalCall(node.name, node.args.map(evalNode));
        case 'identifier':
          throw new Error(NAME);
        default:
          throw new Error(ERROR);
      }
    }

    Object.keys(rawCells).forEach(getCell);
    return result;
  }

  return {
    COLS,
    ROWS,
    evaluateSheet,
    pointToCell,
    cellToPoint,
  };
});
