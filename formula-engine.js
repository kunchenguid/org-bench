(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetFormulaEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const CELL_REF_RE = /(\$?)([A-Z]+)(\$?)(\d+)/g;
  const COMPARATORS = new Set(['=', '<>', '<', '<=', '>', '>=']);

  function columnToIndex(label) {
    let index = 0;
    for (let i = 0; i < label.length; i += 1) {
      index = index * 26 + (label.charCodeAt(i) - 64);
    }
    return index - 1;
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

  function createCellId(col, row) {
    return `${indexToColumn(col)}${row + 1}`;
  }

  function parseCellReference(reference) {
    const match = reference.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      throw new Error('Invalid cell reference');
    }

    return {
      colAbsolute: Boolean(match[1]),
      col: columnToIndex(match[2]),
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function stringifyCellReference(reference) {
    return `${reference.colAbsolute ? '$' : ''}${indexToColumn(reference.col)}${reference.rowAbsolute ? '$' : ''}${reference.row + 1}`;
  }

  function shiftReference(reference, rowOffset, colOffset) {
    const parsed = parseCellReference(reference);
    if (!parsed.colAbsolute) {
      parsed.col = Math.max(0, parsed.col + colOffset);
    }
    if (!parsed.rowAbsolute) {
      parsed.row = Math.max(0, parsed.row + rowOffset);
    }
    return stringifyCellReference(parsed);
  }

  function shiftFormula(raw, rowOffset, colOffset) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }

    return raw.replace(CELL_REF_RE, function (match) {
      return shiftReference(match, rowOffset, colOffset);
    });
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
      const char = input.charAt(index);

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      const twoChar = input.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=(),:<>'.includes(char)) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      if (char === '"') {
        let end = index + 1;
        let value = '';

        while (end < input.length) {
          const current = input.charAt(end);
          if (current === '"') {
            if (input.charAt(end + 1) === '"') {
              value += '"';
              end += 2;
              continue;
            }
            break;
          }
          value += current;
          end += 1;
        }

        if (end >= input.length || input.charAt(end) !== '"') {
          throw new Error('Unterminated string literal');
        }

        tokens.push({ type: 'string', value: value });
        index = end + 1;
        continue;
      }

      if (/\d|\./.test(char)) {
        let end = index + 1;
        while (end < input.length && /[\d.]/.test(input.charAt(end))) {
          end += 1;
        }
        tokens.push({ type: 'number', value: Number(input.slice(index, end)) });
        index = end;
        continue;
      }

      if (/[A-Z_$]/i.test(char)) {
        let end = index + 1;
        while (end < input.length && /[A-Z0-9_$]/i.test(input.charAt(end))) {
          end += 1;
        }
        tokens.push({ type: 'identifier', value: input.slice(index, end).toUpperCase() });
        index = end;
        continue;
      }

      throw new Error(`Unexpected token ${char}`);
    }

    return tokens;
  }

  function parseFormula(input) {
    const tokens = tokenize(input);
    let position = 0;

    function peek(offset) {
      return tokens[position + (offset || 0)] || null;
    }

    function consume(expected) {
      const token = tokens[position];
      if (!token || (expected && token.value !== expected)) {
        throw new Error(`Expected ${expected || 'token'}`);
      }
      position += 1;
      return token;
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new Error('Unexpected end of formula');
      }

      if (token.type === 'number') {
        consume();
        return { type: 'number', value: token.value };
      }

      if (token.type === 'string') {
        consume();
        return { type: 'string', value: token.value };
      }

      if (token.value === '(') {
        consume('(');
        const expression = parseComparison();
        consume(')');
        return expression;
      }

      if (token.type === 'identifier') {
        const identifier = consume().value;

        if (peek() && peek().value === '(') {
          consume('(');
          const args = [];
          if (!peek() || peek().value !== ')') {
            while (true) {
              args.push(parseComparison());
              if (!peek() || peek().value !== ',') {
                break;
              }
              consume(',');
            }
          }
          consume(')');
          return { type: 'function', name: identifier, args: args };
        }

        if (/^\$?[A-Z]+\$?\d+$/.test(identifier)) {
          if (peek() && peek().value === ':') {
            consume(':');
            const end = consume().value;
            return { type: 'range', start: identifier, end: end };
          }
          return { type: 'cell', ref: identifier };
        }

        if (identifier === 'TRUE' || identifier === 'FALSE') {
          return { type: 'boolean', value: identifier === 'TRUE' };
        }
      }

      throw new Error('Invalid expression');
    }

    function parseUnary() {
      const token = peek();
      if (token && token.value === '-') {
        consume('-');
        return { type: 'unary', operator: '-', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (peek() && (peek().value === '*' || peek().value === '/')) {
        const operator = consume().value;
        node = { type: 'binary', operator: operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (peek() && (peek().value === '+' || peek().value === '-')) {
        const operator = consume().value;
        node = { type: 'binary', operator: operator, left: node, right: parseMultiplicative() };
      }
      return node;
    }

    function parseConcatenation() {
      let node = parseAdditive();
      while (peek() && peek().value === '&') {
        consume('&');
        node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseComparison() {
      let node = parseConcatenation();
      while (peek() && COMPARATORS.has(peek().value)) {
        const operator = consume().value;
        node = { type: 'binary', operator: operator, left: node, right: parseConcatenation() };
      }
      return node;
    }

    const expression = parseComparison();
    if (position !== tokens.length) {
      throw new Error('Unexpected trailing token');
    }
    return expression;
  }

  function normalizeLiteral(raw) {
    if (raw === '' || raw == null) {
      return '';
    }
    const number = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(number)) {
      return number;
    }
    return raw;
  }

  function isError(result) {
    return result && typeof result === 'object' && typeof result.error === 'string';
  }

  function unwrapValue(result) {
    if (isError(result)) {
      return result;
    }
    return result == null ? '' : result;
  }

  function toNumber(value) {
    if (value === '' || value == null) {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return { error: '#ERR!' };
    }
    return numeric;
  }

  function toStringValue(value) {
    if (value === '' || value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function toBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === '' || value == null) {
      return false;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return String(value).length > 0;
  }

  function flattenArgs(values) {
    const result = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        result.push.apply(result, flattenArgs(value));
        return;
      }
      result.push(value);
    });
    return result;
  }

  function expandRange(startRef, endRef) {
    const start = parseCellReference(startRef);
    const end = parseCellReference(endRef);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const cells = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        cells.push(createCellId(col, row));
      }
    }

    return cells;
  }

  function formatDisplay(value) {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value === '' || value == null) {
      return '';
    }
    return String(value);
  }

  function evaluateFormula(rawFormula, context, trail) {
    const stack = trail ? trail.slice() : [];

    try {
      const formula = rawFormula.charAt(0) === '=' ? rawFormula.slice(1) : rawFormula;
      const ast = parseFormula(formula);
      const value = evaluateAst(ast, context, stack);
      if (isError(value)) {
        return { error: value.error, display: value.error, value: null };
      }
      return { value: value, display: formatDisplay(value) };
    } catch (error) {
      return { error: error.code || '#ERR!', display: error.code || '#ERR!', value: null };
    }
  }

  function evaluateAst(node, context, stack) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'cell':
        return evaluateCellReference(node.ref, context, stack);
      case 'range':
        return expandRange(node.start, node.end).map(function (cellId) {
          return unwrapValue(evaluateCellReference(cellId, context, stack));
        });
      case 'unary': {
        const value = unwrapValue(evaluateAst(node.argument, context, stack));
        if (isError(value)) {
          return value;
        }
        const number = toNumber(value);
        if (isError(number)) {
          return number;
        }
        return -number;
      }
      case 'binary':
        return evaluateBinary(node, context, stack);
      case 'function':
        return evaluateFunction(node, context, stack);
      default:
        throw withCode('#ERR!');
    }
  }

  function evaluateCellReference(reference, context, stack) {
    const normalized = stringifyCellReference(parseCellReference(reference));
    if (stack.includes(normalized)) {
      return { error: '#CIRC!' };
    }

    const raw = context.getCellRaw(normalized);
    if (raw == null || raw === '') {
      return '';
    }

    if (raw.charAt(0) === '=') {
      const result = evaluateFormula(raw, context, stack.concat([normalized]));
      if (result.error) {
        return { error: result.error };
      }
      return result.value;
    }

    return normalizeLiteral(raw);
  }

  function evaluateBinary(node, context, stack) {
    const left = unwrapValue(evaluateAst(node.left, context, stack));
    if (isError(left)) {
      return left;
    }
    const right = unwrapValue(evaluateAst(node.right, context, stack));
    if (isError(right)) {
      return right;
    }

    if (node.operator === '&') {
      return toStringValue(left) + toStringValue(right);
    }

    if (COMPARATORS.has(node.operator)) {
      switch (node.operator) {
        case '=':
          return left === right;
        case '<>':
          return left !== right;
        case '<':
          return left < right;
        case '<=':
          return left <= right;
        case '>':
          return left > right;
        case '>=':
          return left >= right;
      }
    }

    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    if (isError(leftNumber)) {
      return leftNumber;
    }
    if (isError(rightNumber)) {
      return rightNumber;
    }

    switch (node.operator) {
      case '+':
        return leftNumber + rightNumber;
      case '-':
        return leftNumber - rightNumber;
      case '*':
        return leftNumber * rightNumber;
      case '/':
        if (rightNumber === 0) {
          return { error: '#DIV/0!' };
        }
        return leftNumber / rightNumber;
      default:
        return { error: '#ERR!' };
    }
  }

  function evaluateFunction(node, context, stack) {
    const values = node.args.map(function (arg) {
      return unwrapValue(evaluateAst(arg, context, stack));
    });

    for (let i = 0; i < values.length; i += 1) {
      if (isError(values[i])) {
        return values[i];
      }
    }

    const flat = flattenArgs(values);

    switch (node.name) {
      case 'SUM':
        return flat.reduce(function (sum, value) {
          const numeric = toNumber(value);
          if (isError(numeric)) {
            throw withCode(numeric.error);
          }
          return sum + numeric;
        }, 0);
      case 'AVERAGE': {
        if (!flat.length) {
          return 0;
        }
        const sum = flat.reduce(function (total, value) {
          const numeric = toNumber(value);
          if (isError(numeric)) {
            throw withCode(numeric.error);
          }
          return total + numeric;
        }, 0);
        return sum / flat.length;
      }
      case 'MIN':
        return Math.min.apply(null, flat.map(mustNumber));
      case 'MAX':
        return Math.max.apply(null, flat.map(mustNumber));
      case 'COUNT':
        return flat.filter(function (value) {
          return value !== '' && value != null;
        }).length;
      case 'IF':
        return toBoolean(values[0]) ? values[1] : values[2];
      case 'AND':
        return flat.every(toBoolean);
      case 'OR':
        return flat.some(toBoolean);
      case 'NOT':
        return !toBoolean(values[0]);
      case 'ABS':
        return Math.abs(mustNumber(values[0]));
      case 'ROUND':
        return roundTo(mustNumber(values[0]), values[1] == null ? 0 : mustNumber(values[1]));
      case 'CONCAT':
        return flat.map(toStringValue).join('');
      default:
        return { error: '#ERR!' };
    }
  }

  function mustNumber(value) {
    const numeric = toNumber(value);
    if (isError(numeric)) {
      throw withCode(numeric.error);
    }
    return numeric;
  }

  function roundTo(value, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function withCode(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function createSheetModel(initialCells) {
    const rawCells = Object.assign({}, initialCells || {});
    let snapshot = null;

    function invalidate() {
      snapshot = null;
    }

    function recomputeAll() {
      if (snapshot) {
        return snapshot;
      }

      const computed = {};
      const cellIds = Object.keys(rawCells);
      const context = {
        getCellRaw(cellId) {
          return rawCells[cellId] == null ? '' : rawCells[cellId];
        },
      };

      cellIds.forEach(function (cellId) {
        computed[cellId] = rawCells[cellId] && rawCells[cellId].charAt(0) === '='
          ? evaluateFormula(rawCells[cellId], context, [cellId])
          : {
              value: normalizeLiteral(rawCells[cellId]),
              display: formatDisplay(normalizeLiteral(rawCells[cellId])),
            };
      });

      snapshot = computed;
      return computed;
    }

    return {
      getAllCells() {
        return Object.assign({}, recomputeAll());
      },
      getCell(cellId) {
        return recomputeAll()[cellId] || { value: '', display: '' };
      },
      getCellRaw(cellId) {
        return rawCells[cellId] == null ? '' : rawCells[cellId];
      },
      setCellRaw(cellId, raw) {
        if (raw == null || raw === '') {
          delete rawCells[cellId];
        } else {
          rawCells[cellId] = raw;
        }
        invalidate();
      },
      toJSON() {
        return Object.assign({}, rawCells);
      },
    };
  }

  return {
    columnToIndex: columnToIndex,
    createSheetModel: createSheetModel,
    createCellId: createCellId,
    evaluateFormula: evaluateFormula,
    indexToColumn: indexToColumn,
    parseCellReference: parseCellReference,
    shiftFormula: shiftFormula,
  };
});
