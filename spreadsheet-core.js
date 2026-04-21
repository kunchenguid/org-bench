(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ERROR = {
    generic: { kind: 'error', code: '#ERR!' },
    div0: { kind: 'error', code: '#DIV/0!' },
    ref: { kind: 'error', code: '#REF!' },
    circ: { kind: 'error', code: '#CIRC!' },
  };

  function createEmptySheet() {
    return {};
  }

  function columnLabelToIndex(label) {
    var total = 0;
    for (var i = 0; i < label.length; i += 1) {
      total = total * 26 + (label.charCodeAt(i) - 64);
    }
    return total - 1;
  }

  function indexToColumnLabel(index) {
    var value = index + 1;
    var label = '';
    while (value > 0) {
      var remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function normalizeCellId(cellId) {
    return String(cellId || '').toUpperCase();
  }

  function parseCellRef(text) {
    var match = /^([$]?)([A-Z]+)([$]?)(\d+)$/.exec(String(text || '').toUpperCase());
    if (!match) {
      return null;
    }
    return {
      col: columnLabelToIndex(match[2]),
      row: Number(match[4]) - 1,
      colAbsolute: match[1] === '$',
      rowAbsolute: match[3] === '$',
    };
  }

  function stringifyCellRef(ref) {
    return (ref.colAbsolute ? '$' : '') + indexToColumnLabel(ref.col) + (ref.rowAbsolute ? '$' : '') + String(ref.row + 1);
  }

  function shiftCellRef(text, rowOffset, colOffset) {
    var ref = parseCellRef(text);
    if (!ref) {
      return text;
    }
    if (!ref.colAbsolute) {
      ref.col += colOffset;
    }
    if (!ref.rowAbsolute) {
      ref.row += rowOffset;
    }
    if (ref.col < 0 || ref.row < 0) {
      return '#REF!';
    }
    return stringifyCellRef(ref);
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    return String(formula || '').replace(/\$?[A-Z]+\$?\d+/g, function (match) {
      return shiftCellRef(match, rowOffset, colOffset);
    });
  }

  function tokenize(input) {
    var text = String(input || '');
    var tokens = [];
    var i = 0;
    while (i < text.length) {
      var char = text[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }
      if (char === '"') {
        var value = '';
        i += 1;
        while (i < text.length && text[i] !== '"') {
          value += text[i];
          i += 1;
        }
        i += 1;
        tokens.push({ type: 'string', value: value });
        continue;
      }
      var two = text.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      if ('+-*/(),:&=<>'.indexOf(char) !== -1) {
        tokens.push({ type: char === ',' || char === '(' || char === ')' || char === ':' ? char : 'op', value: char });
        i += 1;
        continue;
      }
      var numberMatch = /^\d+(?:\.\d+)?/.exec(text.slice(i));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        i += numberMatch[0].length;
        continue;
      }
      var refMatch = /^\$?[A-Z]+\$?\d+/i.exec(text.slice(i));
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0].toUpperCase() });
        i += refMatch[0].length;
        continue;
      }
      var identMatch = /^[A-Z_][A-Z0-9_]*/i.exec(text.slice(i));
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0].toUpperCase() });
        i += identMatch[0].length;
        continue;
      }
      throw ERROR.generic;
    }
    return tokens;
  }

  function createParser(tokens) {
    var index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(type, value) {
      var token = tokens[index];
      if (!token || token.type !== type || (value && token.value !== value)) {
        throw ERROR.generic;
      }
      index += 1;
      return token;
    }

    function match(type, value) {
      var token = tokens[index];
      if (token && token.type === type && (!value || token.value === value)) {
        index += 1;
        return token;
      }
      return null;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      var left = parseConcat();
      while (peek() && peek().type === 'op' && /^(=|<>|<|<=|>|>=)$/.test(peek().value)) {
        var operator = consume('op').value;
        left = { type: 'binary', operator: operator, left: left, right: parseConcat() };
      }
      return left;
    }

    function parseConcat() {
      var left = parseAddSub();
      while (match('op', '&')) {
        left = { type: 'binary', operator: '&', left: left, right: parseAddSub() };
      }
      return left;
    }

    function parseAddSub() {
      var left = parseMulDiv();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        var operator = consume('op').value;
        left = { type: 'binary', operator: operator, left: left, right: parseMulDiv() };
      }
      return left;
    }

    function parseMulDiv() {
      var left = parseUnary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        var operator = consume('op').value;
        left = { type: 'binary', operator: operator, left: left, right: parseUnary() };
      }
      return left;
    }

    function parseUnary() {
      if (match('op', '-')) {
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      var token = peek();
      if (!token) {
        throw ERROR.generic;
      }
      if (match('number')) {
        return { type: 'literal', value: token.value };
      }
      if (match('string')) {
        return { type: 'literal', value: token.value };
      }
      if (match('ref')) {
        var refNode = { type: 'ref', ref: token.value };
        if (match(':')) {
          var endToken = consume('ref');
          return { type: 'range', start: refNode.ref, end: endToken.value };
        }
        return refNode;
      }
      if (match('ident')) {
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'literal', value: token.value === 'TRUE' };
        }
        consume('(');
        var args = [];
        if (!match(')')) {
          do {
            args.push(parseExpression());
          } while (match(','));
          consume(')');
        }
        return { type: 'call', name: token.value, args: args };
      }
      if (match('(')) {
        var expression = parseExpression();
        consume(')');
        return expression;
      }
      throw ERROR.generic;
    }

    var ast = parseExpression();
    if (index !== tokens.length) {
      throw ERROR.generic;
    }
    return ast;
  }

  function parseFormula(formula) {
    return createParser(tokenize(formula));
  }

  function isError(value) {
    return value && value.kind === 'error';
  }

  function asNumber(value) {
    if (isError(value)) {
      throw value;
    }
    if (value === '' || value === null || typeof value === 'undefined') {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function asText(value) {
    if (isError(value)) {
      throw value;
    }
    if (value === null || typeof value === 'undefined') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function compareValues(left, right, operator) {
    var leftNumber = Number(left);
    var rightNumber = Number(right);
    var useNumbers = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
    var a = useNumbers ? leftNumber : asText(left);
    var b = useNumbers ? rightNumber : asText(right);
    if (operator === '=') return a === b;
    if (operator === '<>') return a !== b;
    if (operator === '<') return a < b;
    if (operator === '<=') return a <= b;
    if (operator === '>') return a > b;
    if (operator === '>=') return a >= b;
    throw ERROR.generic;
  }

  function getRawCellValue(sheet, cellId) {
    return Object.prototype.hasOwnProperty.call(sheet, cellId) ? sheet[cellId] : '';
  }

  function collectRangeCells(startRef, endRef) {
    var start = parseCellRef(startRef);
    var end = parseCellRef(endRef);
    if (!start || !end) {
      throw ERROR.ref;
    }
    var minRow = Math.min(start.row, end.row);
    var maxRow = Math.max(start.row, end.row);
    var minCol = Math.min(start.col, end.col);
    var maxCol = Math.max(start.col, end.col);
    var ids = [];
    for (var row = minRow; row <= maxRow; row += 1) {
      for (var col = minCol; col <= maxCol; col += 1) {
        ids.push(indexToColumnLabel(col) + String(row + 1));
      }
    }
    return ids;
  }

  function flattenArgs(args) {
    var values = [];
    for (var i = 0; i < args.length; i += 1) {
      if (Array.isArray(args[i])) {
        values = values.concat(args[i]);
      } else {
        values.push(args[i]);
      }
    }
    return values;
  }

  function evaluateAst(node, sheet, cache, stack) {
    if (node.type === 'literal') {
      return node.value;
    }
    if (node.type === 'unary') {
      return -asNumber(evaluateAst(node.value, sheet, cache, stack));
    }
    if (node.type === 'ref') {
      return evaluateCell(sheet, node.ref, cache, stack).value;
    }
    if (node.type === 'range') {
      var rangeIds = collectRangeCells(node.start, node.end);
      var rangeValues = [];
      for (var i = 0; i < rangeIds.length; i += 1) {
        rangeValues.push(evaluateCell(sheet, rangeIds[i], cache, stack).value);
      }
      return rangeValues;
    }
    if (node.type === 'binary') {
      var left = evaluateAst(node.left, sheet, cache, stack);
      var right = evaluateAst(node.right, sheet, cache, stack);
      if (node.operator === '+') return asNumber(left) + asNumber(right);
      if (node.operator === '-') return asNumber(left) - asNumber(right);
      if (node.operator === '*') return asNumber(left) * asNumber(right);
      if (node.operator === '/') {
        var divisor = asNumber(right);
        if (divisor === 0) throw ERROR.div0;
        return asNumber(left) / divisor;
      }
      if (node.operator === '&') return asText(left) + asText(right);
      return compareValues(left, right, node.operator);
    }
    if (node.type === 'call') {
      var args = [];
      for (var j = 0; j < node.args.length; j += 1) {
        args.push(evaluateAst(node.args[j], sheet, cache, stack));
      }
      return evaluateFunction(node.name, args);
    }
    throw ERROR.generic;
  }

  function evaluateFunction(name, args) {
    var values = flattenArgs(args);
    if (name === 'SUM') return values.reduce(function (sum, value) { return sum + asNumber(value); }, 0);
    if (name === 'AVERAGE') return values.length ? evaluateFunction('SUM', values) / values.length : 0;
    if (name === 'MIN') return values.length ? Math.min.apply(Math, values.map(asNumber)) : 0;
    if (name === 'MAX') return values.length ? Math.max.apply(Math, values.map(asNumber)) : 0;
    if (name === 'COUNT') return values.filter(function (value) { return asText(value) !== ''; }).length;
    if (name === 'IF') return args[0] ? args[1] : args[2];
    if (name === 'AND') return values.every(Boolean);
    if (name === 'OR') return values.some(Boolean);
    if (name === 'NOT') return !args[0];
    if (name === 'ABS') return Math.abs(asNumber(args[0]));
    if (name === 'ROUND') {
      var precision = args.length > 1 ? asNumber(args[1]) : 0;
      var factor = Math.pow(10, precision);
      return Math.round(asNumber(args[0]) * factor) / factor;
    }
    if (name === 'CONCAT') return values.map(asText).join('');
    throw ERROR.generic;
  }

  function formatDisplay(value) {
    if (isError(value)) {
      return value.code;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value === null || typeof value === 'undefined' || value === '') {
      return '';
    }
    return String(value);
  }

  function evaluateCell(sheet, cellId, cache, stack) {
    cellId = normalizeCellId(cellId);
    cache = cache || {};
    stack = stack || [];
    if (cache[cellId]) {
      return cache[cellId];
    }
    if (stack.indexOf(cellId) !== -1) {
      return { value: ERROR.circ, display: ERROR.circ.code };
    }
    var raw = getRawCellValue(sheet, cellId);
    var result;
    if (!raw) {
      result = { value: '', display: '' };
    } else if (String(raw).charAt(0) !== '=') {
      var numberValue = Number(raw);
      result = Number.isFinite(numberValue) && String(raw).trim() !== '' ? { value: numberValue, display: String(numberValue) } : { value: String(raw), display: String(raw) };
    } else {
      try {
        var ast = parseFormula(String(raw).slice(1));
        var value = evaluateAst(ast, sheet, cache, stack.concat(cellId));
        result = { value: value, display: formatDisplay(value) };
      } catch (error) {
        var safeError = isError(error) ? error : ERROR.generic;
        result = { value: safeError, display: safeError.code };
      }
    }
    cache[cellId] = result;
    return result;
  }

  return {
    createEmptySheet: createEmptySheet,
    evaluateCell: evaluateCell,
    indexToColumnLabel: indexToColumnLabel,
    parseCellRef: parseCellRef,
    shiftFormula: shiftFormula,
  };
});
