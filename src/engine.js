;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CELL_REF_RE = /^\$?([A-Z]+)\$?(\d+)$/;
  const STORAGE_KEY = 'sheet-state';

  function createStorageKey(namespace, key) {
    return namespace + ':' + key;
  }

  function evaluateCellMap(rawCells) {
    const cache = new Map();
    const evaluating = new Set();
    const results = {};
    const keys = Object.keys(rawCells);

    function resolveCell(cellId) {
      if (cache.has(cellId)) {
        return cache.get(cellId);
      }

      if (evaluating.has(cellId)) {
        const circular = makeError('#CIRC!');
        cache.set(cellId, circular);
        return circular;
      }

      evaluating.add(cellId);
      const raw = rawCells[cellId] || '';
      let value;

      if (!raw) {
        value = makeBlank();
      } else if (raw[0] === '=') {
        try {
          const parser = createParser(raw.slice(1));
          const ast = parser.parseExpression();
          parser.expectEnd();
          value = evaluateAst(ast, resolveCell);
        } catch (error) {
          value = makeError(error && error.code ? error.code : '#ERR!');
        }
      } else {
        value = parseLiteral(raw);
      }

      evaluating.delete(cellId);
      cache.set(cellId, value);
      return value;
    }

    for (const cellId of keys) {
      const value = resolveCell(cellId);
      results[cellId] = {
        raw: rawCells[cellId],
        value: value.value,
        type: value.type,
        display: formatValue(value),
      };
    }

    return results;
  }

  function makeBlank() {
    return { type: 'blank', value: '' };
  }

  function makeError(code) {
    return { type: 'error', value: code };
  }

  function makeScalar(type, value) {
    return { type, value };
  }

  function parseLiteral(raw) {
    if (/^TRUE$/i.test(raw)) {
      return makeScalar('boolean', true);
    }

    if (/^FALSE$/i.test(raw)) {
      return makeScalar('boolean', false);
    }

    const number = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(number)) {
      return makeScalar('number', number);
    }

    return makeScalar('string', raw);
  }

  function formatValue(value) {
    if (value.type === 'error') {
      return value.value;
    }

    if (value.type === 'blank') {
      return '';
    }

    if (value.type === 'boolean') {
      return value.value ? 'TRUE' : 'FALSE';
    }

    return String(value.value);
  }

  function evaluateAst(node, resolveCell) {
    switch (node.type) {
      case 'number':
        return makeScalar('number', node.value);
      case 'string':
        return makeScalar('string', node.value);
      case 'boolean':
        return makeScalar('boolean', node.value);
      case 'cell':
        return normalizeReferenceValue(resolveCell(node.value));
      case 'unary':
        return evaluateUnary(node, resolveCell);
      case 'binary':
        return evaluateBinary(node, resolveCell);
      case 'function':
        return evaluateFunction(node, resolveCell);
      case 'range':
        return flattenRange(node.start, node.end, resolveCell);
      default:
        throw { code: '#ERR!' };
    }
  }

  function normalizeReferenceValue(value) {
    if (!value || value.type === 'blank') {
      return makeBlank();
    }

    return value;
  }

  function evaluateUnary(node, resolveCell) {
    const value = evaluateAst(node.argument, resolveCell);
    if (value.type === 'error') {
      return value;
    }

    if (node.operator === '-') {
      return makeScalar('number', -toNumber(value));
    }

    throw { code: '#ERR!' };
  }

  function evaluateBinary(node, resolveCell) {
    const left = evaluateAst(node.left, resolveCell);
    const right = evaluateAst(node.right, resolveCell);

    if (left.type === 'error') {
      return left;
    }

    if (right.type === 'error') {
      return right;
    }

    if (node.operator === '&') {
      return makeScalar('string', toStringValue(left) + toStringValue(right));
    }

    if (['=', '<>', '<', '<=', '>', '>='].includes(node.operator)) {
      return makeScalar('boolean', compareValues(left, right, node.operator));
    }

    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);

    switch (node.operator) {
      case '+':
        return makeScalar('number', leftNumber + rightNumber);
      case '-':
        return makeScalar('number', leftNumber - rightNumber);
      case '*':
        return makeScalar('number', leftNumber * rightNumber);
      case '/':
        if (rightNumber === 0) {
          return makeError('#DIV/0!');
        }

        return makeScalar('number', leftNumber / rightNumber);
      default:
        throw { code: '#ERR!' };
    }
  }

  function evaluateFunction(node, resolveCell) {
    const name = node.name.toUpperCase();
    const args = node.args.map(function (arg) {
      if (arg.type === 'range') {
        return evaluateAst(arg, resolveCell);
      }

      return evaluateAst(arg, resolveCell);
    });

    for (const arg of args) {
      if (arg && arg.type === 'error') {
        return arg;
      }
    }

    const flattened = args.flatMap(function (arg) {
      return Array.isArray(arg) ? arg : [arg];
    });

    switch (name) {
      case 'SUM':
        return makeScalar('number', flattened.reduce(function (sum, value) {
          return sum + toNumber(value);
        }, 0));
      case 'AVERAGE':
        if (!flattened.length) {
          return makeScalar('number', 0);
        }

        return makeScalar('number', flattened.reduce(function (sum, value) {
          return sum + toNumber(value);
        }, 0) / flattened.length);
      case 'COUNT':
        return makeScalar('number', flattened.filter(function (value) {
          return value.type !== 'blank' && value.type !== 'error';
        }).length);
      case 'MIN':
        return makeScalar('number', Math.min.apply(null, flattened.map(toNumber)));
      case 'MAX':
        return makeScalar('number', Math.max.apply(null, flattened.map(toNumber)));
      case 'ABS':
        return makeScalar('number', Math.abs(toNumber(flattened[0] || makeBlank())));
      case 'ROUND':
        return roundValue(flattened);
      case 'IF':
        return toBoolean(flattened[0]) ? (flattened[1] || makeBlank()) : (flattened[2] || makeBlank());
      case 'AND':
        return makeScalar('boolean', flattened.every(toBoolean));
      case 'OR':
        return makeScalar('boolean', flattened.some(toBoolean));
      case 'NOT':
        return makeScalar('boolean', !toBoolean(flattened[0] || makeBlank()));
      case 'CONCAT':
        return makeScalar('string', flattened.map(toStringValue).join(''));
      default:
        return makeError('#ERR!');
    }
  }

  function roundValue(args) {
    const number = toNumber(args[0] || makeBlank());
    const digits = args.length > 1 ? toNumber(args[1]) : 0;
    const factor = Math.pow(10, digits);
    return makeScalar('number', Math.round(number * factor) / factor);
  }

  function compareValues(left, right, operator) {
    const leftValue = left.type === 'string' || right.type === 'string' ? toStringValue(left) : toNumber(left);
    const rightValue = left.type === 'string' || right.type === 'string' ? toStringValue(right) : toNumber(right);

    switch (operator) {
      case '=':
        return leftValue === rightValue;
      case '<>':
        return leftValue !== rightValue;
      case '<':
        return leftValue < rightValue;
      case '<=':
        return leftValue <= rightValue;
      case '>':
        return leftValue > rightValue;
      case '>=':
        return leftValue >= rightValue;
      default:
        return false;
    }
  }

  function flattenRange(start, end, resolveCell) {
    const startRef = parseCellId(start);
    const endRef = parseCellId(end);
    const minRow = Math.min(startRef.row, endRef.row);
    const maxRow = Math.max(startRef.row, endRef.row);
    const minCol = Math.min(startRef.col, endRef.col);
    const maxCol = Math.max(startRef.col, endRef.col);
    const values = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        values.push(normalizeReferenceValue(resolveCell(toCellId(row, col))));
      }
    }

    return values;
  }

  function toNumber(value) {
    if (!value || value.type === 'blank') {
      return 0;
    }

    if (value.type === 'number') {
      return value.value;
    }

    if (value.type === 'boolean') {
      return value.value ? 1 : 0;
    }

    const parsed = Number(value.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toStringValue(value) {
    if (!value || value.type === 'blank') {
      return '';
    }

    if (value.type === 'boolean') {
      return value.value ? 'TRUE' : 'FALSE';
    }

    return String(value.value);
  }

  function toBoolean(value) {
    if (!value || value.type === 'blank') {
      return false;
    }

    if (value.type === 'boolean') {
      return value.value;
    }

    if (value.type === 'string') {
      return value.value !== '';
    }

    return toNumber(value) !== 0;
  }

  function createParser(input) {
    const tokens = tokenize(input);
    let index = 0;

    function current() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = current();
      if (!token || token.type !== type || (value && token.value !== value)) {
        return null;
      }

      index += 1;
      return token;
    }

    function expect(type, value) {
      const token = consume(type, value);
      if (!token) {
        throw { code: '#ERR!' };
      }

      return token;
    }

    function parsePrimary() {
      const token = current();
      if (!token) {
        throw { code: '#ERR!' };
      }

      if (consume('operator', '(')) {
        const expression = parseComparison();
        expect('operator', ')');
        return expression;
      }

      if (consume('operator', '-')) {
        return { type: 'unary', operator: '-', argument: parsePrimary() };
      }

      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: Number(token.value) };
      }

      if (token.type === 'string') {
        index += 1;
        return { type: 'string', value: token.value };
      }

      if (token.type === 'identifier') {
        index += 1;
        const name = token.value.toUpperCase();
        if (name === 'TRUE' || name === 'FALSE') {
          return { type: 'boolean', value: name === 'TRUE' };
        }

        if (consume('operator', '(')) {
          const args = [];
          if (!consume('operator', ')')) {
            do {
              args.push(parseComparison());
            } while (consume('operator', ','));
            expect('operator', ')');
          }

          return { type: 'function', name: name, args: args };
        }

        if (consume('operator', ':')) {
          const end = expect('identifier').value.toUpperCase();
          return { type: 'range', start: name, end: end };
        }

        if (CELL_REF_RE.test(name)) {
          return { type: 'cell', value: name };
        }
      }

      throw { code: '#ERR!' };
    }

    function parseMultiplication() {
      let node = parsePrimary();
      while (true) {
        const token = current();
        if (!token || token.type !== 'operator' || (token.value !== '*' && token.value !== '/')) {
          return node;
        }

        index += 1;
        node = { type: 'binary', operator: token.value, left: node, right: parsePrimary() };
      }
    }

    function parseAddition() {
      let node = parseMultiplication();
      while (true) {
        const token = current();
        if (!token || token.type !== 'operator' || !['+', '-', '&'].includes(token.value)) {
          return node;
        }

        index += 1;
        node = { type: 'binary', operator: token.value, left: node, right: parseMultiplication() };
      }
    }

    function parseComparison() {
      let node = parseAddition();
      while (true) {
        const token = current();
        if (!token || token.type !== 'operator' || !['=', '<>', '<', '<=', '>', '>='].includes(token.value)) {
          return node;
        }

        index += 1;
        node = { type: 'binary', operator: token.value, left: node, right: parseAddition() };
      }
    }

    return {
      parseExpression: parseComparison,
      expectEnd: function () {
        if (index !== tokens.length) {
          throw { code: '#ERR!' };
        }
      },
    };
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

      const twoChar = input.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&(),:=<>'.includes(char)) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < input.length && input[end] !== '"') {
          value += input[end];
          end += 1;
        }
        if (end >= input.length) {
          throw { code: '#ERR!' };
        }
        tokens.push({ type: 'string', value: value });
        index = end + 1;
        continue;
      }

      const numberMatch = input.slice(index).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: numberMatch[0] });
        index += numberMatch[0].length;
        continue;
      }

      const identifierMatch = input.slice(index).match(/^[A-Za-z$][A-Za-z0-9$]*/);
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0] });
        index += identifierMatch[0].length;
        continue;
      }

      throw { code: '#ERR!' };
    }

    return tokens;
  }

  function parseCellId(cellId) {
    const match = cellId.toUpperCase().match(CELL_REF_RE);
    if (!match) {
      throw { code: '#REF!' };
    }

    return {
      col: columnLabelToIndex(match[1]),
      row: Number(match[2]) - 1,
    };
  }

  function toCellId(row, col) {
    return indexToColumnLabel(col) + String(row + 1);
  }

  function columnLabelToIndex(label) {
    let value = 0;
    for (let index = 0; index < label.length; index += 1) {
      value = value * 26 + (label.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function indexToColumnLabel(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    createStorageKey: createStorageKey,
    evaluateCellMap: evaluateCellMap,
    parseCellId: parseCellId,
    toCellId: toCellId,
    indexToColumnLabel: indexToColumnLabel,
  };
});
