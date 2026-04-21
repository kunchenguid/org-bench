(function (globalScope) {
  'use strict';

  var ERROR_CODES = {
    ERR: '#ERR!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
    CIRC: '#CIRC!'
  };

  function FormulaError(code) {
    this.code = code || ERROR_CODES.ERR;
  }

  function makeError(code) {
    return new FormulaError(code);
  }

  function isError(value) {
    return value instanceof FormulaError;
  }

  function isBlank(value) {
    return value === null || value === undefined || value === '';
  }

  function isBoolean(value) {
    return value === true || value === false;
  }

  function cloneSet(source) {
    return new Set(source ? Array.from(source) : []);
  }

  function columnLabelToIndex(label) {
    var value = 0;
    var upper = String(label || '').toUpperCase();
    for (var i = 0; i < upper.length; i += 1) {
      value = value * 26 + (upper.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function columnIndexToLabel(index) {
    var n = index + 1;
    var label = '';
    while (n > 0) {
      var remainder = (n - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label;
  }

  function parseCellAddress(address) {
    var match = /^([A-Z]+)([1-9][0-9]*)$/i.exec(String(address || '').trim());
    if (!match) {
      throw new Error('Invalid cell address: ' + address);
    }
    return {
      col: columnLabelToIndex(match[1]),
      row: Number(match[2]) - 1
    };
  }

  function makeAddress(row, col) {
    return columnIndexToLabel(col) + String(row + 1);
  }

  function tokenize(formula) {
    var tokens = [];
    var input = String(formula || '');
    var i = 0;

    while (i < input.length) {
      var char = input[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }
      if (char === ',') {
        tokens.push({ type: 'comma', value: ',' });
        i += 1;
        continue;
      }
      if (char === '(' || char === ')') {
        tokens.push({ type: 'paren', value: char });
        i += 1;
        continue;
      }
      if (char === ':') {
        tokens.push({ type: 'colon', value: ':' });
        i += 1;
        continue;
      }
      if (char === '&') {
        tokens.push({ type: 'operator', value: '&' });
        i += 1;
        continue;
      }
      if (char === '<' || char === '>') {
        var nextChar = input[i + 1] || '';
        if ((char === '<' && nextChar === '=') || (char === '>' && nextChar === '=') || (char === '<' && nextChar === '>')) {
          tokens.push({ type: 'operator', value: char + nextChar });
          i += 2;
        } else {
          tokens.push({ type: 'operator', value: char });
          i += 1;
        }
        continue;
      }
      if (char === '=' || char === '+' || char === '-' || char === '*' || char === '/') {
        tokens.push({ type: 'operator', value: char });
        i += 1;
        continue;
      }
      if (char === '"') {
        var end = i + 1;
        var value = '';
        while (end < input.length) {
          if (input[end] === '"') {
            if (input[end + 1] === '"') {
              value += '"';
              end += 2;
              continue;
            }
            break;
          }
          value += input[end];
          end += 1;
        }
        if (end >= input.length || input[end] !== '"') {
          throw new Error('Unterminated string literal');
        }
        tokens.push({ type: 'string', value: value });
        i = end + 1;
        continue;
      }
      var rest = input.slice(i);
      var errorMatch = /^#REF!/.exec(rest);
      if (errorMatch) {
        tokens.push({ type: 'error', value: ERROR_CODES.REF });
        i += errorMatch[0].length;
        continue;
      }
      var cellMatch = /^\$?[A-Za-z]+\$?[1-9][0-9]*/.exec(rest);
      if (cellMatch) {
        tokens.push({ type: 'cell', value: cellMatch[0].toUpperCase() });
        i += cellMatch[0].length;
        continue;
      }
      var numberMatch = /^(?:\d+\.\d+|\d+\.\d*|\.\d+|\d+)/.exec(rest);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        i += numberMatch[0].length;
        continue;
      }
      var identifierMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0].toUpperCase() });
        i += identifierMatch[0].length;
        continue;
      }
      throw new Error('Unexpected token at ' + rest);
    }

    return tokens;
  }

  function createParser(tokens) {
    var index = 0;

    function peek() {
      return tokens[index] || null;
    }

    function consume(expectedType, expectedValue) {
      var token = peek();
      if (!token || token.type !== expectedType || (expectedValue !== undefined && token.value !== expectedValue)) {
        throw new Error('Unexpected token');
      }
      index += 1;
      return token;
    }

    function maybeConsume(type, value) {
      var token = peek();
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        return null;
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      var left = parseConcat();
      while (true) {
        var token = peek();
        if (!token || token.type !== 'operator' || ['=', '<>', '<', '<=', '>', '>='].indexOf(token.value) === -1) {
          return left;
        }
        index += 1;
        left = { type: 'binary', operator: token.value, left: left, right: parseConcat() };
      }
    }

    function parseConcat() {
      var left = parseAdditive();
      while (maybeConsume('operator', '&')) {
        left = { type: 'binary', operator: '&', left: left, right: parseAdditive() };
      }
      return left;
    }

    function parseAdditive() {
      var left = parseMultiplicative();
      while (true) {
        var token = peek();
        if (!token || token.type !== 'operator' || (token.value !== '+' && token.value !== '-')) {
          return left;
        }
        index += 1;
        left = { type: 'binary', operator: token.value, left: left, right: parseMultiplicative() };
      }
    }

    function parseMultiplicative() {
      var left = parseUnary();
      while (true) {
        var token = peek();
        if (!token || token.type !== 'operator' || (token.value !== '*' && token.value !== '/')) {
          return left;
        }
        index += 1;
        left = { type: 'binary', operator: token.value, left: left, right: parseUnary() };
      }
    }

    function parseUnary() {
      var token = peek();
      if (token && token.type === 'operator' && token.value === '-') {
        index += 1;
        return { type: 'unary', operator: '-', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      var token = peek();
      if (!token) {
        throw new Error('Unexpected end of input');
      }
      if (maybeConsume('paren', '(')) {
        var expr = parseExpression();
        consume('paren', ')');
        return expr;
      }
      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        index += 1;
        return { type: 'string', value: token.value };
      }
      if (token.type === 'error') {
        index += 1;
        return { type: 'error', value: token.value };
      }
      if (token.type === 'identifier') {
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          index += 1;
          return { type: 'boolean', value: token.value === 'TRUE' };
        }
        var identifier = token.value;
        index += 1;
        consume('paren', '(');
        var args = [];
        if (!maybeConsume('paren', ')')) {
          do {
            args.push(parseExpression());
          } while (maybeConsume('comma', ','));
          consume('paren', ')');
        }
        return { type: 'function', name: identifier, args: args };
      }
      if (token.type === 'cell') {
        index += 1;
        var ref = { type: 'cell', ref: parseReferenceToken(token.value) };
        if (maybeConsume('colon', ':')) {
          var endToken = consume('cell');
          return { type: 'range', start: ref.ref, end: parseReferenceToken(endToken.value) };
        }
        return ref;
      }
      throw new Error('Unexpected primary token');
    }

    var root = parseExpression();
    if (index !== tokens.length) {
      throw new Error('Unexpected extra tokens');
    }
    return root;
  }

  function parseReferenceToken(token) {
    var match = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(token);
    if (!match) {
      throw new Error('Invalid reference token');
    }
    return {
      col: columnLabelToIndex(match[2]),
      row: Number(match[4]) - 1,
      colAbs: match[1] === '$',
      rowAbs: match[3] === '$'
    };
  }

  function formatReference(ref) {
    if (ref.refError) {
      return ERROR_CODES.REF;
    }
    return (ref.colAbs ? '$' : '') + columnIndexToLabel(ref.col) + (ref.rowAbs ? '$' : '') + String(ref.row + 1);
  }

  function parseFormulaAst(raw) {
    return createParser(tokenize(raw.slice(1)));
  }

  function numberFromValue(value) {
    if (isError(value)) {
      return value;
    }
    if (isBlank(value)) {
      return 0;
    }
    if (isBoolean(value)) {
      return value ? 1 : 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    var numeric = Number(value);
    return Number.isNaN(numeric) ? 0 : numeric;
  }

  function booleanFromValue(value) {
    if (isError(value)) {
      return value;
    }
    if (isBlank(value)) {
      return false;
    }
    if (isBoolean(value)) {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return String(value).length > 0;
  }

  function textFromValue(value) {
    if (isError(value)) {
      return value;
    }
    if (isBlank(value)) {
      return '';
    }
    if (isBoolean(value)) {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function flattenValues(values) {
    var flat = [];
    for (var i = 0; i < values.length; i += 1) {
      var item = values[i];
      if (Array.isArray(item)) {
        flat = flat.concat(flattenValues(item));
      } else {
        flat.push(item);
      }
    }
    return flat;
  }

  function formatDisplay(value) {
    if (isError(value)) {
      return value.code;
    }
    if (isBlank(value)) {
      return '';
    }
    if (isBoolean(value)) {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (Object.is(value, -0)) {
        return '0';
      }
      return String(Number.isInteger(value) ? value : Number(String(value)));
    }
    return String(value);
  }

  function parseLiteral(raw) {
    var trimmed = String(raw == null ? '' : raw);
    if (trimmed === '') {
      return '';
    }
    var numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && /^\s*[+-]?(?:\d+\.?\d*|\.\d+)\s*$/.test(trimmed)) {
      return numeric;
    }
    return trimmed;
  }

  function collectReferences(node, refs) {
    if (!node) {
      return;
    }
    if (node.type === 'cell') {
      refs.add(makeAddress(node.ref.row, node.ref.col));
      return;
    }
    if (node.type === 'range') {
      var top = Math.min(node.start.row, node.end.row);
      var bottom = Math.max(node.start.row, node.end.row);
      var left = Math.min(node.start.col, node.end.col);
      var right = Math.max(node.start.col, node.end.col);
      for (var row = top; row <= bottom; row += 1) {
        for (var col = left; col <= right; col += 1) {
          refs.add(makeAddress(row, col));
        }
      }
      return;
    }
    if (node.type === 'binary') {
      collectReferences(node.left, refs);
      collectReferences(node.right, refs);
      return;
    }
    if (node.type === 'unary') {
      collectReferences(node.argument, refs);
      return;
    }
    if (node.type === 'function') {
      for (var i = 0; i < node.args.length; i += 1) {
        collectReferences(node.args[i], refs);
      }
    }
  }

  function evaluateAst(node, context) {
    if (!node) {
      return makeError(ERROR_CODES.ERR);
    }
    if (node.type === 'number' || node.type === 'string' || node.type === 'boolean') {
      return node.value;
    }
    if (node.type === 'error') {
      return makeError(node.value);
    }
    if (node.type === 'cell') {
      if (node.ref.refError) {
        return makeError(ERROR_CODES.REF);
      }
      return context.getCellValue(makeAddress(node.ref.row, node.ref.col));
    }
    if (node.type === 'range') {
      if (node.start.refError || node.end.refError) {
        return makeError(ERROR_CODES.REF);
      }
      var values = [];
      var top = Math.min(node.start.row, node.end.row);
      var bottom = Math.max(node.start.row, node.end.row);
      var left = Math.min(node.start.col, node.end.col);
      var right = Math.max(node.start.col, node.end.col);
      for (var row = top; row <= bottom; row += 1) {
        for (var col = left; col <= right; col += 1) {
          values.push(context.getCellValue(makeAddress(row, col)));
        }
      }
      return values;
    }
    if (node.type === 'unary') {
      var unaryValue = evaluateAst(node.argument, context);
      if (isError(unaryValue)) {
        return unaryValue;
      }
      var unaryNumber = numberFromValue(unaryValue);
      return isError(unaryNumber) ? unaryNumber : -unaryNumber;
    }
    if (node.type === 'binary') {
      var left = evaluateAst(node.left, context);
      if (isError(left)) {
        return left;
      }
      var right = evaluateAst(node.right, context);
      if (isError(right)) {
        return right;
      }
      switch (node.operator) {
        case '+':
          return numberFromValue(left) + numberFromValue(right);
        case '-':
          return numberFromValue(left) - numberFromValue(right);
        case '*':
          return numberFromValue(left) * numberFromValue(right);
        case '/':
          if (numberFromValue(right) === 0) {
            return makeError(ERROR_CODES.DIV0);
          }
          return numberFromValue(left) / numberFromValue(right);
        case '&':
          return textFromValue(left) + textFromValue(right);
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
          return makeError(ERROR_CODES.ERR);
      }
    }
    if (node.type === 'function') {
      return evaluateFunction(node.name, node.args, context);
    }
    return makeError(ERROR_CODES.ERR);
  }

  function compareValues(left, right) {
    var leftNum = numberFromValue(left);
    var rightNum = numberFromValue(right);
    var leftIsNumeric = typeof left === 'number' || isBoolean(left) || isBlank(left) || !Number.isNaN(Number(left));
    var rightIsNumeric = typeof right === 'number' || isBoolean(right) || isBlank(right) || !Number.isNaN(Number(right));
    if (leftIsNumeric && rightIsNumeric) {
      if (leftNum === rightNum) {
        return 0;
      }
      return leftNum < rightNum ? -1 : 1;
    }
    var leftText = textFromValue(left);
    var rightText = textFromValue(right);
    if (leftText === rightText) {
      return 0;
    }
    return leftText < rightText ? -1 : 1;
  }

  function evaluateFunction(name, args, context) {
    var evaluated = [];
    for (var i = 0; i < args.length; i += 1) {
      var value = evaluateAst(args[i], context);
      if (isError(value)) {
        return value;
      }
      evaluated.push(value);
    }
    var flat = flattenValues(evaluated);
    switch (name) {
      case 'SUM':
        return flat.reduce(function (sum, item) { return sum + numberFromValue(item); }, 0);
      case 'AVERAGE':
        return flat.length ? flat.reduce(function (sum, item) { return sum + numberFromValue(item); }, 0) / flat.length : 0;
      case 'MIN':
        return flat.length ? Math.min.apply(Math, flat.map(numberFromValue)) : 0;
      case 'MAX':
        return flat.length ? Math.max.apply(Math, flat.map(numberFromValue)) : 0;
      case 'COUNT':
        return flat.filter(function (item) { return !isBlank(item); }).length;
      case 'IF':
        return booleanFromValue(evaluated[0]) ? evaluated[1] : evaluated[2];
      case 'AND':
        return flat.every(function (item) { return booleanFromValue(item); });
      case 'OR':
        return flat.some(function (item) { return booleanFromValue(item); });
      case 'NOT':
        return !booleanFromValue(evaluated[0]);
      case 'ABS':
        return Math.abs(numberFromValue(evaluated[0]));
      case 'ROUND':
        var value = numberFromValue(evaluated[0]);
        var digits = evaluated[1] === undefined ? 0 : numberFromValue(evaluated[1]);
        var factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
      case 'CONCAT':
        return flat.map(textFromValue).join('');
      default:
        return makeError(ERROR_CODES.ERR);
    }
  }

  function transformReference(ref, rowDelta, colDelta, mode, axisIndex, axisCount) {
    if (ref.refError) {
      return { refError: true };
    }
    var next = {
      row: ref.row,
      col: ref.col,
      rowAbs: ref.rowAbs,
      colAbs: ref.colAbs
    };

    if (mode === 'shift') {
      if (!next.colAbs) {
        next.col += colDelta;
      }
      if (!next.rowAbs) {
        next.row += rowDelta;
      }
      return next;
    }

    if (mode === 'insert-rows') {
      if (next.row >= axisIndex) {
        next.row += axisCount;
      }
      return next;
    }
    if (mode === 'delete-rows') {
      if (next.row >= axisIndex && next.row < axisIndex + axisCount) {
        return { refError: true };
      }
      if (next.row >= axisIndex + axisCount) {
        next.row -= axisCount;
      }
      return next;
    }
    if (mode === 'insert-cols') {
      if (next.col >= axisIndex) {
        next.col += axisCount;
      }
      return next;
    }
    if (mode === 'delete-cols') {
      if (next.col >= axisIndex && next.col < axisIndex + axisCount) {
        return { refError: true };
      }
      if (next.col >= axisIndex + axisCount) {
        next.col -= axisCount;
      }
      return next;
    }
    return next;
  }

  function rewriteAst(node, rowDelta, colDelta, mode, axisIndex, axisCount) {
    if (!node) {
      return '';
    }
    switch (node.type) {
      case 'number':
        return String(node.value);
      case 'string':
        return '"' + String(node.value).replace(/"/g, '""') + '"';
      case 'boolean':
        return node.value ? 'TRUE' : 'FALSE';
      case 'error':
        return node.value;
      case 'cell':
        return formatReference(transformReference(node.ref, rowDelta, colDelta, mode, axisIndex, axisCount));
      case 'range':
        return formatReference(transformReference(node.start, rowDelta, colDelta, mode, axisIndex, axisCount)) + ':' + formatReference(transformReference(node.end, rowDelta, colDelta, mode, axisIndex, axisCount));
      case 'unary':
        return node.operator + rewriteAst(node.argument, rowDelta, colDelta, mode, axisIndex, axisCount);
      case 'binary':
        return rewriteAst(node.left, rowDelta, colDelta, mode, axisIndex, axisCount) + node.operator + rewriteAst(node.right, rowDelta, colDelta, mode, axisIndex, axisCount);
      case 'function':
        return node.name + '(' + node.args.map(function (arg) {
          return rewriteAst(arg, rowDelta, colDelta, mode, axisIndex, axisCount);
        }).join(',') + ')';
      default:
        return '';
    }
  }

  function shiftFormula(raw, rowDelta, colDelta) {
    if (typeof raw !== 'string' || raw[0] !== '=') {
      return raw;
    }
    try {
      return '=' + rewriteAst(parseFormulaAst(raw), rowDelta, colDelta, 'shift');
    } catch (error) {
      return raw;
    }
  }

  function rewriteFormulaForStructure(raw, mode, axisIndex, axisCount) {
    if (typeof raw !== 'string' || raw[0] !== '=') {
      return raw;
    }
    try {
      return '=' + rewriteAst(parseFormulaAst(raw), 0, 0, mode, axisIndex, axisCount);
    } catch (error) {
      return raw;
    }
  }

  function createWorkbook() {
    var rawCells = new Map();
    var computed = new Map();
    var dependencyMap = new Map();

    function evaluateAll() {
      computed = new Map();
      dependencyMap = new Map();
      var visiting = new Set();

      function evaluateAddress(address) {
        if (computed.has(address)) {
          return computed.get(address).value;
        }
        if (visiting.has(address)) {
          var circ = { raw: rawCells.get(address) || '', value: makeError(ERROR_CODES.CIRC), display: ERROR_CODES.CIRC, dependencies: new Set() };
          computed.set(address, circ);
          return circ.value;
        }

        visiting.add(address);
        var raw = rawCells.get(address);
        var dependencies = new Set();
        var value;

        if (typeof raw === 'string' && raw[0] === '=') {
          try {
            var ast = parseFormulaAst(raw);
            collectReferences(ast, dependencies);
            value = evaluateAst(ast, {
              getCellValue: function (target) {
                return evaluateAddress(target);
              }
            });
          } catch (error) {
            value = makeError(ERROR_CODES.ERR);
          }
        } else {
          value = parseLiteral(raw);
        }

        visiting.delete(address);
        var record = {
          raw: raw || '',
          value: value,
          display: formatDisplay(value),
          dependencies: cloneSet(dependencies)
        };
        computed.set(address, record);
        dependencyMap.set(address, cloneSet(dependencies));
        return value;
      }

      Array.from(rawCells.keys()).sort().forEach(function (address) {
        evaluateAddress(address);
      });
    }

    function rebuildCells(transformCell, formulaMode, axisIndex, axisCount) {
      var nextCells = new Map();
      Array.from(rawCells.entries()).forEach(function (entry) {
        var address = entry[0];
        var raw = entry[1];
        var position = parseCellAddress(address);
        var nextPosition = transformCell(position);
        if (!nextPosition) {
          return;
        }
        var nextRaw = rewriteFormulaForStructure(raw, formulaMode, axisIndex, axisCount);
        nextCells.set(makeAddress(nextPosition.row, nextPosition.col), nextRaw);
      });
      rawCells = nextCells;
      evaluateAll();
    }

    evaluateAll();

    return {
      setCell: function (address, raw) {
        if (raw === undefined || raw === null || raw === '') {
          rawCells.delete(address.toUpperCase());
        } else {
          rawCells.set(address.toUpperCase(), String(raw));
        }
        evaluateAll();
      },
      getCell: function (address) {
        var key = address.toUpperCase();
        if (!computed.has(key)) {
          var raw = rawCells.get(key) || '';
          var value = parseLiteral(raw);
          return { raw: raw, value: value, display: formatDisplay(value), dependencies: new Set() };
        }
        return computed.get(key);
      },
      getDependencies: function (address) {
        return cloneSet(dependencyMap.get(address.toUpperCase()));
      },
      insertRows: function (rowNumber, count) {
        var start = rowNumber - 1;
        rebuildCells(function (position) {
          return { row: position.row >= start ? position.row + count : position.row, col: position.col };
        }, 'insert-rows', start, count);
      },
      deleteRows: function (rowNumber, count) {
        var start = rowNumber - 1;
        rebuildCells(function (position) {
          if (position.row >= start && position.row < start + count) {
            return null;
          }
          return { row: position.row >= start + count ? position.row - count : position.row, col: position.col };
        }, 'delete-rows', start, count);
      },
      insertColumns: function (columnNumber, count) {
        var start = columnNumber - 1;
        rebuildCells(function (position) {
          return { row: position.row, col: position.col >= start ? position.col + count : position.col };
        }, 'insert-cols', start, count);
      },
      deleteColumns: function (columnNumber, count) {
        var start = columnNumber - 1;
        rebuildCells(function (position) {
          if (position.col >= start && position.col < start + count) {
            return null;
          }
          return { row: position.row, col: position.col >= start + count ? position.col - count : position.col };
        }, 'delete-cols', start, count);
      }
    };
  }

  var api = {
    createWorkbook: createWorkbook,
    shiftFormula: shiftFormula,
    parseCellAddress: parseCellAddress,
    makeAddress: makeAddress,
    ERROR_CODES: ERROR_CODES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.SpreadsheetFormulaEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
