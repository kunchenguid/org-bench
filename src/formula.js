(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.FormulaEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLUMN_COUNT = 26;
  var ROW_COUNT = 100;
  var ERROR_DIV_ZERO = '#DIV/0!';
  var ERROR_GENERIC = '#ERR!';
  var ERROR_CIRC = '#CIRC!';
  var ERROR_REF = '#REF!';

  function createSheet(initialCells) {
    return { cells: Object.assign({}, initialCells || {}) };
  }

  function cloneSheet(sheet) {
    return createSheet(sheet.cells);
  }

  function colToIndex(label) {
    return label.charCodeAt(0) - 64;
  }

  function indexToCol(index) {
    return String.fromCharCode(64 + index);
  }

  function parseCellId(cellId) {
    var match = /^([A-Z])(\d+)$/.exec(cellId);
    if (!match) {
      throw new Error('Invalid cell id');
    }

    return {
      col: colToIndex(match[1]),
      row: Number(match[2]),
    };
  }

  function stringifyCellRef(ref) {
    return (ref.absCol ? '$' : '') + indexToCol(ref.col) + (ref.absRow ? '$' : '') + String(ref.row);
  }

  function parseReferenceToken(token) {
    var match = /^(\$?)([A-Z])(\$?)(\d+)$/.exec(token);
    if (!match) {
      return null;
    }

    return {
      absCol: Boolean(match[1]),
      col: colToIndex(match[2]),
      absRow: Boolean(match[3]),
      row: Number(match[4]),
    };
  }

  function shiftReference(ref, colOffset, rowOffset) {
    var nextCol = ref.absCol ? ref.col : ref.col + colOffset;
    var nextRow = ref.absRow ? ref.row : ref.row + rowOffset;

    if (nextCol < 1 || nextCol > COLUMN_COUNT || nextRow < 1 || nextRow > ROW_COUNT) {
      return '#REF!';
    }

    return stringifyCellRef({
      absCol: ref.absCol,
      col: nextCol,
      absRow: ref.absRow,
      row: nextRow,
    });
  }

  function moveFormula(raw, rowOffset, colOffset) {
    if (typeof raw !== 'string' || raw.charAt(0) !== '=') {
      return raw;
    }

    return raw.replace(/(\$?[A-Z]\$?\d+)(:(\$?[A-Z]\$?\d+))?/g, function (match, start, _sep, end) {
      var shiftedStart = shiftReference(parseReferenceToken(start), colOffset, rowOffset);

      if (!end) {
        return shiftedStart;
      }

      var shiftedEnd = shiftReference(parseReferenceToken(end), colOffset, rowOffset);
      return shiftedStart + ':' + shiftedEnd;
    });
  }

  function tokenize(input) {
    var tokens = [];
    var index = 0;

    while (index < input.length) {
      var char = input.charAt(index);

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (char === '"') {
        var value = '';
        index += 1;
        while (index < input.length && input.charAt(index) !== '"') {
          value += input.charAt(index);
          index += 1;
        }
        if (input.charAt(index) !== '"') {
          throw new Error('Unterminated string');
        }
        index += 1;
        tokens.push({ type: 'string', value: value });
        continue;
      }

      var twoChar = input.slice(index, index + 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'op', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&(),:<>='.indexOf(char) !== -1) {
        tokens.push({ type: char === ',' || char === '(' || char === ')' || char === ':' ? char : 'op', value: char });
        index += 1;
        continue;
      }

      var remainder = input.slice(index);
      var refMatch = /^(\$?[A-Z]\$?\d+)/.exec(remainder);
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[1] });
        index += refMatch[1].length;
        continue;
      }

      var numberMatch = /^(\d+(?:\.\d+)?)/.exec(remainder);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[1]) });
        index += numberMatch[1].length;
        continue;
      }

      var identifierMatch = /^([A-Z_][A-Z0-9_]*)/.exec(remainder);
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[1] });
        index += identifierMatch[1].length;
        continue;
      }

      throw new Error('Unexpected token');
    }

    return tokens;
  }

  function parseFormula(input) {
    var tokens = tokenize(input);
    var position = 0;

    function peek() {
      return tokens[position] || null;
    }

    function consume(type, value) {
      var token = peek();
      if (!token || token.type !== type || (typeof value !== 'undefined' && token.value !== value)) {
        throw new Error('Unexpected token');
      }
      position += 1;
      return token;
    }

    function parsePrimary() {
      var token = peek();
      if (!token) {
        throw new Error('Expected value');
      }

      if (token.type === 'number') {
        consume('number');
        return { type: 'number', value: token.value };
      }

      if (token.type === 'string') {
        consume('string');
        return { type: 'string', value: token.value };
      }

      if (token.type === 'identifier') {
        consume('identifier');
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'boolean', value: token.value === 'TRUE' };
        }
        consume('(');
        var args = [];
        if (!peek() || peek().type !== ')') {
          while (true) {
            args.push(parseComparison());
            if (!peek() || peek().type !== ',') {
              break;
            }
            consume(',');
          }
        }
        consume(')');
        return { type: 'call', name: token.value, args: args };
      }

      if (token.type === 'ref') {
        consume('ref');
        if (peek() && peek().type === ':') {
          consume(':');
          var end = consume('ref');
          return { type: 'range', start: token.value, end: end.value };
        }
        return { type: 'ref', value: token.value };
      }

      if (token.type === '(') {
        consume('(');
        var expr = parseComparison();
        consume(')');
        return expr;
      }

      if (token.type === 'op' && token.value === '-') {
        consume('op', '-');
        return { type: 'negate', value: parsePrimary() };
      }

      throw new Error('Unexpected value');
    }

    function createBinaryParser(nextParser, operators) {
      return function parseLevel() {
        var node = nextParser();
        while (peek() && peek().type === 'op' && operators.indexOf(peek().value) !== -1) {
          var operator = consume('op').value;
          node = { type: 'binary', operator: operator, left: node, right: nextParser() };
        }
        return node;
      };
    }

    var parseMultiply = createBinaryParser(parsePrimary, ['*', '/']);
    var parseAdd = createBinaryParser(parseMultiply, ['+', '-']);
    var parseConcat = createBinaryParser(parseAdd, ['&']);
    var parseComparison = createBinaryParser(parseConcat, ['=', '<>', '<', '<=', '>', '>=']);
    var result = parseComparison();

    if (position !== tokens.length) {
      throw new Error('Unexpected trailing tokens');
    }

    return result;
  }

  function isErrorValue(value) {
    return typeof value === 'string' && value.charAt(0) === '#';
  }

  function toNumber(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '' || value == null) {
      return 0;
    }
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : ERROR_GENERIC;
  }

  function toText(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function compareValues(left, right, operator) {
    if (isErrorValue(left)) {
      return left;
    }
    if (isErrorValue(right)) {
      return right;
    }

    var numericLeft = Number(left);
    var numericRight = Number(right);
    var comparableLeft = Number.isFinite(numericLeft) && Number.isFinite(numericRight) ? numericLeft : toText(left);
    var comparableRight = Number.isFinite(numericLeft) && Number.isFinite(numericRight) ? numericRight : toText(right);

    if (operator === '=') {
      return comparableLeft === comparableRight;
    }
    if (operator === '<>') {
      return comparableLeft !== comparableRight;
    }
    if (operator === '<') {
      return comparableLeft < comparableRight;
    }
    if (operator === '<=') {
      return comparableLeft <= comparableRight;
    }
    if (operator === '>') {
      return comparableLeft > comparableRight;
    }
    return comparableLeft >= comparableRight;
  }

  function expandRange(startToken, endToken) {
    var start = parseReferenceToken(startToken);
    var end = parseReferenceToken(endToken);
    if (!start || !end) {
      return ERROR_REF;
    }

    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);
    var cells = [];
    var row;
    var col;
    for (row = rowStart; row <= rowEnd; row += 1) {
      for (col = colStart; col <= colEnd; col += 1) {
        cells.push(indexToCol(col) + String(row));
      }
    }
    return cells;
  }

  function evaluateCell(sheet, cellId, state) {
    state = state || { cache: {}, stack: [] };
    if (state.cache[cellId]) {
      return state.cache[cellId];
    }

    if (state.stack.indexOf(cellId) !== -1) {
      return { value: ERROR_CIRC, display: ERROR_CIRC, raw: sheet.cells[cellId] || '' };
    }

    state.stack.push(cellId);
    var raw = sheet.cells[cellId] || '';
    var result = evaluateRaw(sheet, raw, state);
    state.stack.pop();
    state.cache[cellId] = { value: result.value, display: formatDisplay(result.value), raw: raw };
    return state.cache[cellId];
  }

  function evaluateRaw(sheet, raw, state) {
    if (raw === '') {
      return { value: '' };
    }

    if (typeof raw !== 'string') {
      return { value: raw };
    }

    if (raw.charAt(0) !== '=') {
      var numeric = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(numeric)) {
        return { value: numeric };
      }
      return { value: raw };
    }

    try {
      return { value: evaluateExpression(sheet, parseFormula(raw.slice(1)), state) };
    } catch (error) {
      return { value: error && error.code ? error.code : ERROR_GENERIC };
    }
  }

  function evaluateExpression(sheet, node, state) {
    if (!node) {
      return ERROR_GENERIC;
    }

    if (node.type === 'number' || node.type === 'string' || node.type === 'boolean') {
      return node.value;
    }

    if (node.type === 'negate') {
      var negated = toNumber(evaluateExpression(sheet, node.value, state));
      return isErrorValue(negated) ? negated : -negated;
    }

    if (node.type === 'ref') {
      var parsedRef = parseReferenceToken(node.value);
      if (!parsedRef || parsedRef.col < 1 || parsedRef.col > COLUMN_COUNT || parsedRef.row < 1 || parsedRef.row > ROW_COUNT) {
        return ERROR_REF;
      }
      return evaluateCell(sheet, indexToCol(parsedRef.col) + String(parsedRef.row), state).value;
    }

    if (node.type === 'range') {
      return expandRange(node.start, node.end);
    }

    if (node.type === 'binary') {
      var left = evaluateExpression(sheet, node.left, state);
      var right = evaluateExpression(sheet, node.right, state);
      if (isErrorValue(left)) {
        return left;
      }
      if (isErrorValue(right)) {
        return right;
      }

      if (node.operator === '&') {
        return toText(left) + toText(right);
      }

      if (node.operator === '=' || node.operator === '<>' || node.operator === '<' || node.operator === '<=' || node.operator === '>' || node.operator === '>=') {
        return compareValues(left, right, node.operator);
      }

      var leftNumber = toNumber(left);
      var rightNumber = toNumber(right);
      if (isErrorValue(leftNumber)) {
        return leftNumber;
      }
      if (isErrorValue(rightNumber)) {
        return rightNumber;
      }

      if (node.operator === '+') {
        return leftNumber + rightNumber;
      }
      if (node.operator === '-') {
        return leftNumber - rightNumber;
      }
      if (node.operator === '*') {
        return leftNumber * rightNumber;
      }
      if (rightNumber === 0) {
        return ERROR_DIV_ZERO;
      }
      return leftNumber / rightNumber;
    }

    if (node.type === 'call') {
      return callFunction(sheet, node.name, node.args, state);
    }

    return ERROR_GENERIC;
  }

  function flattenArgs(sheet, args, state) {
    var values = [];

    args.forEach(function (arg) {
      var evaluated = evaluateExpression(sheet, arg, state);
      if (Array.isArray(evaluated)) {
        evaluated.forEach(function (cellId) {
          values.push(evaluateCell(sheet, cellId, state).value);
        });
        return;
      }
      values.push(evaluated);
    });

    return values;
  }

  function callFunction(sheet, name, args, state) {
    var values = flattenArgs(sheet, args, state);
    var numericValues = values.map(toNumber);
    var textValues = values.map(toText);
    var i;

    for (i = 0; i < values.length; i += 1) {
      if (isErrorValue(values[i])) {
        return values[i];
      }
    }

    if (name === 'SUM') {
      return numericValues.reduce(function (sum, value) { return sum + value; }, 0);
    }
    if (name === 'AVERAGE') {
      return values.length ? numericValues.reduce(function (sum, value) { return sum + value; }, 0) / values.length : 0;
    }
    if (name === 'MIN') {
      return values.length ? Math.min.apply(Math, numericValues) : 0;
    }
    if (name === 'MAX') {
      return values.length ? Math.max.apply(Math, numericValues) : 0;
    }
    if (name === 'COUNT') {
      return values.filter(function (value) { return value !== '' && value != null; }).length;
    }
    if (name === 'IF') {
      return values[0] ? values[1] : values[2];
    }
    if (name === 'AND') {
      return values.every(Boolean);
    }
    if (name === 'OR') {
      return values.some(Boolean);
    }
    if (name === 'NOT') {
      return !values[0];
    }
    if (name === 'ABS') {
      return Math.abs(numericValues[0] || 0);
    }
    if (name === 'ROUND') {
      return Number((numericValues[0] || 0).toFixed(numericValues[1] || 0));
    }
    if (name === 'CONCAT') {
      return textValues.join('');
    }

    return ERROR_GENERIC;
  }

  function formatDisplay(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  return {
    COLUMN_COUNT: COLUMN_COUNT,
    ROW_COUNT: ROW_COUNT,
    cloneSheet: cloneSheet,
    createSheet: createSheet,
    evaluateCell: evaluateCell,
    formatDisplay: formatDisplay,
    moveFormula: moveFormula,
    parseCellId: parseCellId,
    indexToCol: indexToCol,
  };
});
