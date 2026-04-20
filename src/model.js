(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exports = factory();
    root.SpreadsheetModel = exports.SpreadsheetModel;
    root.SpreadsheetAddressing = exports.SpreadsheetAddressing;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var COLUMN_COUNT = 26;
  var ROW_COUNT = 100;

  function SpreadsheetError(code) {
    this.name = 'SpreadsheetError';
    this.code = code;
    this.message = code;
  }
  SpreadsheetError.prototype = Object.create(Error.prototype);

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function normalizeCellAddress(address) {
    var match = /^([A-Z]+)([1-9][0-9]*)$/.exec(String(address || '').toUpperCase());
    if (!match) {
      throw new SpreadsheetError('REF');
    }

    var col = columnLabelToIndex(match[1]);
    var row = Number(match[2]) - 1;
    if (col < 0 || col >= COLUMN_COUNT || row < 0 || row >= ROW_COUNT) {
      throw new SpreadsheetError('REF');
    }
    return indexToColumnLabel(col) + String(row + 1);
  }

  function columnLabelToIndex(label) {
    var value = 0;
    for (var i = 0; i < label.length; i += 1) {
      value = value * 26 + (label.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToColumnLabel(index) {
    var label = '';
    var value = index + 1;
    while (value > 0) {
      var remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function tokenize(input) {
    var tokens = [];
    var i = 0;

    while (i < input.length) {
      var char = input[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }

      var twoChar = input.slice(i, i + 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'operator', value: twoChar });
        i += 2;
        continue;
      }

      if ('+-*/&=<>():,'.indexOf(char) !== -1) {
        tokens.push({
          type: char === '(' || char === ')' ? 'paren' : char === ',' ? 'comma' : char === ':' ? 'colon' : 'operator',
          value: char,
        });
        i += 1;
        continue;
      }

      if (char === '"') {
        var end = i + 1;
        var text = '';
        while (end < input.length) {
          if (input[end] === '"') {
            if (input[end + 1] === '"') {
              text += '"';
              end += 2;
              continue;
            }
            break;
          }
          text += input[end];
          end += 1;
        }
        if (end >= input.length || input[end] !== '"') {
          throw new SpreadsheetError('ERR');
        }
        tokens.push({ type: 'string', value: text });
        i = end + 1;
        continue;
      }

      var numberMatch = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        i += numberMatch[0].length;
        continue;
      }

      var identMatch = /^[A-Za-z$][A-Za-z0-9$]*/.exec(input.slice(i));
      if (identMatch) {
        tokens.push({ type: 'identifier', value: identMatch[0].toUpperCase() });
        i += identMatch[0].length;
        continue;
      }

      throw new SpreadsheetError('ERR');
    }

    return tokens;
  }

  function Parser(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  Parser.prototype.peek = function (offset) {
    return this.tokens[this.index + (offset || 0)] || null;
  };

  Parser.prototype.consume = function () {
    var token = this.peek();
    if (!token) {
      throw new SpreadsheetError('ERR');
    }
    this.index += 1;
    return token;
  };

  Parser.prototype.match = function (type, value) {
    var token = this.peek();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      return false;
    }
    this.index += 1;
    return true;
  };

  Parser.prototype.parse = function () {
    var expression = this.parseComparison();
    if (this.peek()) {
      throw new SpreadsheetError('ERR');
    }
    return expression;
  };

  Parser.prototype.parseComparison = function () {
    var left = this.parseConcat();
    while (true) {
      var token = this.peek();
      if (!token || token.type !== 'operator' || ['=', '<>', '<', '<=', '>', '>='].indexOf(token.value) === -1) {
        break;
      }
      this.consume();
      left = { kind: 'binary', operator: token.value, left: left, right: this.parseConcat() };
    }
    return left;
  };

  Parser.prototype.parseConcat = function () {
    var left = this.parseAddSub();
    while (this.match('operator', '&')) {
      left = { kind: 'binary', operator: '&', left: left, right: this.parseAddSub() };
    }
    return left;
  };

  Parser.prototype.parseAddSub = function () {
    var left = this.parseMulDiv();
    while (true) {
      if (this.match('operator', '+')) {
        left = { kind: 'binary', operator: '+', left: left, right: this.parseMulDiv() };
        continue;
      }
      if (this.match('operator', '-')) {
        left = { kind: 'binary', operator: '-', left: left, right: this.parseMulDiv() };
        continue;
      }
      break;
    }
    return left;
  };

  Parser.prototype.parseMulDiv = function () {
    var left = this.parseUnary();
    while (true) {
      if (this.match('operator', '*')) {
        left = { kind: 'binary', operator: '*', left: left, right: this.parseUnary() };
        continue;
      }
      if (this.match('operator', '/')) {
        left = { kind: 'binary', operator: '/', left: left, right: this.parseUnary() };
        continue;
      }
      break;
    }
    return left;
  };

  Parser.prototype.parseUnary = function () {
    if (this.match('operator', '-')) {
      return { kind: 'unary', operator: '-', value: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    var token = this.peek();
    if (!token) {
      throw new SpreadsheetError('ERR');
    }

    if (this.match('paren', '(')) {
      var expression = this.parseComparison();
      if (!this.match('paren', ')')) {
        throw new SpreadsheetError('ERR');
      }
      return expression;
    }

    if (token.type === 'number') {
      this.consume();
      return { kind: 'number', value: token.value };
    }

    if (token.type === 'string') {
      this.consume();
      return { kind: 'string', value: token.value };
    }

    if (token.type === 'identifier') {
      this.consume();
      if (this.match('paren', '(')) {
        var args = [];
        if (!this.match('paren', ')')) {
          do {
            args.push(this.parseComparison());
          } while (this.match('comma', ','));
          if (!this.match('paren', ')')) {
            throw new SpreadsheetError('ERR');
          }
        }
        return { kind: 'function', name: token.value, args: args };
      }

      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { kind: 'boolean', value: token.value === 'TRUE' };
      }

      if (isCellReferenceToken(token.value)) {
        var cell = parseCellReference(token.value);
        if (this.match('colon', ':')) {
          var endToken = this.consume();
          if (!endToken || endToken.type !== 'identifier' || !isCellReferenceToken(endToken.value)) {
            throw new SpreadsheetError('ERR');
          }
          return { kind: 'range', start: cell, end: parseCellReference(endToken.value) };
        }
        return { kind: 'cell', ref: cell };
      }
    }

    throw new SpreadsheetError('ERR');
  };

  function isCellReferenceToken(token) {
    return /^\$?[A-Z]+\$?[1-9][0-9]*$/.test(token);
  }

  function parseCellReference(token) {
    var match = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(token);
    if (!match) {
      throw new SpreadsheetError('REF');
    }
    return {
      colAbsolute: Boolean(match[1]),
      col: columnLabelToIndex(match[2]),
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function refToAddress(ref) {
    if (ref.col < 0 || ref.col >= COLUMN_COUNT || ref.row < 0 || ref.row >= ROW_COUNT) {
      throw new SpreadsheetError('REF');
    }
    return indexToColumnLabel(ref.col) + String(ref.row + 1);
  }

  function evaluateFormula(expression, model, stack) {
    switch (expression.kind) {
      case 'number':
      case 'string':
      case 'boolean':
        return expression.value;
      case 'unary':
        return -toNumber(evaluateFormula(expression.value, model, stack));
      case 'binary':
        return evaluateBinary(expression, model, stack);
      case 'cell':
        return model.getCellComputed(refToAddress(expression.ref), stack);
      case 'range':
        return getRangeValues(expression.start, expression.end, model, stack);
      case 'function':
        return evaluateFunction(expression, model, stack);
      default:
        throw new SpreadsheetError('ERR');
    }
  };

  function evaluateBinary(expression, model, stack) {
    var left = evaluateFormula(expression.left, model, stack);
    var right = evaluateFormula(expression.right, model, stack);
    switch (expression.operator) {
      case '+':
        return toNumber(left) + toNumber(right);
      case '-':
        return toNumber(left) - toNumber(right);
      case '*':
        return toNumber(left) * toNumber(right);
      case '/':
        var divisor = toNumber(right);
        if (divisor === 0) {
          throw new SpreadsheetError('DIV0');
        }
        return toNumber(left) / divisor;
      case '&':
        return toText(left) + toText(right);
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
        throw new SpreadsheetError('ERR');
    }
  }

  function getRangeValues(start, end, model, stack) {
    var top = Math.min(start.row, end.row);
    var bottom = Math.max(start.row, end.row);
    var left = Math.min(start.col, end.col);
    var right = Math.max(start.col, end.col);
    var values = [];
    for (var row = top; row <= bottom; row += 1) {
      for (var col = left; col <= right; col += 1) {
        values.push(model.getCellComputed(refToAddress({ row: row, col: col }), stack));
      }
    }
    return values;
  }

  function evaluateFunction(expression, model, stack) {
    var name = expression.name;
    var args = expression.args.map(function (arg) {
      return evaluateFormula(arg, model, stack);
    });
    var flatArgs = flattenArgs(args);

    switch (name) {
      case 'SUM':
        return flatArgs.reduce(function (total, value) { return total + toNumber(value); }, 0);
      case 'AVERAGE':
        return flatArgs.length ? flatArgs.reduce(function (total, value) { return total + toNumber(value); }, 0) / flatArgs.length : 0;
      case 'MIN':
        return flatArgs.length ? Math.min.apply(Math, flatArgs.map(toNumber)) : 0;
      case 'MAX':
        return flatArgs.length ? Math.max.apply(Math, flatArgs.map(toNumber)) : 0;
      case 'COUNT':
        return flatArgs.filter(function (value) { return value !== ''; }).length;
      case 'IF':
        if (args.length < 2) {
          throw new SpreadsheetError('ERR');
        }
        return toBoolean(args[0]) ? args[1] : (args.length > 2 ? args[2] : false);
      case 'AND':
        return flatArgs.every(toBoolean);
      case 'OR':
        return flatArgs.some(toBoolean);
      case 'NOT':
        if (args.length !== 1) {
          throw new SpreadsheetError('ERR');
        }
        return !toBoolean(args[0]);
      case 'ABS':
        if (args.length !== 1) {
          throw new SpreadsheetError('ERR');
        }
        return Math.abs(toNumber(args[0]));
      case 'ROUND':
        if (args.length < 1 || args.length > 2) {
          throw new SpreadsheetError('ERR');
        }
        var digits = args.length === 2 ? toNumber(args[1]) : 0;
        var factor = Math.pow(10, digits);
        return Math.round(toNumber(args[0]) * factor) / factor;
      case 'CONCAT':
        return flatArgs.map(toText).join('');
      default:
        throw new SpreadsheetError('ERR');
    }
  }

  function flattenArgs(values) {
    return values.reduce(function (accumulator, value) {
      if (Array.isArray(value)) {
        return accumulator.concat(value);
      }
      accumulator.push(value);
      return accumulator;
    }, []);
  }

  function toNumber(value) {
    if (value === '' || value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new SpreadsheetError('ERR');
      }
      return value;
    }
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toText(value) {
    if (value === null || value === undefined) {
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
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      if (value === '') {
        return false;
      }
      if (value === 'TRUE') {
        return true;
      }
      if (value === 'FALSE') {
        return false;
      }
    }
    return Boolean(value);
  }

  function compareValues(left, right) {
    var leftNum = Number(left);
    var rightNum = Number(right);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
      return leftNum === rightNum ? 0 : leftNum < rightNum ? -1 : 1;
    }
    var leftText = toText(left);
    var rightText = toText(right);
    return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
  }

  function formatDisplayValue(value) {
    if (value instanceof SpreadsheetError) {
      return value.code === 'DIV0' ? '#DIV/0!' : value.code === 'CIRC' ? '#CIRC!' : value.code === 'REF' ? '#REF!' : '#ERR!';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (isFiniteNumber(value)) {
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
    }
    return value === null || value === undefined ? '' : String(value);
  }

  function SpreadsheetModel(snapshot) {
    var state = snapshot || {};
    this.cells = Object.assign({}, state.cells || {});
    this.activeCell = state.activeCell || 'A1';
  }

  SpreadsheetModel.prototype.setCellRaw = function (address, raw) {
    var normalized = normalizeCellAddress(address);
    var value = raw == null ? '' : String(raw);
    if (value === '') {
      delete this.cells[normalized];
      return;
    }
    this.cells[normalized] = value;
  };

  SpreadsheetModel.prototype.getCellRaw = function (address) {
    return this.cells[normalizeCellAddress(address)] || '';
  };

  SpreadsheetModel.prototype.getCellComputed = function (address, stack) {
    var normalized = normalizeCellAddress(address);
    var path = stack || [];
    if (path.indexOf(normalized) !== -1) {
      throw new SpreadsheetError('CIRC');
    }

    var raw = this.getCellRaw(normalized);
    if (!raw) {
      return '';
    }
    if (raw.charAt(0) !== '=') {
      var numeric = Number(raw);
      return Number.isFinite(numeric) && raw.trim() !== '' ? numeric : raw;
    }

    try {
      var ast = new Parser(tokenize(raw.slice(1))).parse();
      return evaluateFormula(ast, this, path.concat(normalized));
    } catch (error) {
      if (error instanceof SpreadsheetError) {
        return error;
      }
      return new SpreadsheetError('ERR');
    }
  };

  SpreadsheetModel.prototype.getCellDisplay = function (address) {
    return formatDisplayValue(this.getCellComputed(address));
  };

  SpreadsheetModel.prototype.setActiveCell = function (address) {
    this.activeCell = normalizeCellAddress(address);
  };

  SpreadsheetModel.prototype.serialize = function () {
    return JSON.stringify({ cells: this.cells, activeCell: this.activeCell });
  };

  SpreadsheetModel.deserialize = function (snapshot) {
    return new SpreadsheetModel(snapshot ? JSON.parse(snapshot) : undefined);
  };

  return {
    SpreadsheetModel: SpreadsheetModel,
    SpreadsheetAddressing: {
      COLUMN_COUNT: COLUMN_COUNT,
      ROW_COUNT: ROW_COUNT,
      normalizeCellAddress: normalizeCellAddress,
      columnLabelToIndex: columnLabelToIndex,
      indexToColumnLabel: indexToColumnLabel,
    },
  };
});
