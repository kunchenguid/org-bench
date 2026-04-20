(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  var MAX_COLUMNS = 26;
  var MAX_ROWS = 100;
  var FUNCTION_NAMES = {
    SUM: true,
    AVERAGE: true,
    MIN: true,
    MAX: true,
    COUNT: true,
    IF: true,
    AND: true,
    OR: true,
    NOT: true,
    ABS: true,
    ROUND: true,
    CONCAT: true,
  };

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function parseAddress(address) {
    var match = /^([A-Z]+)(\d+)$/.exec(address || '');
    if (!match) {
      return null;
    }

    var column = lettersToIndex(match[1]);
    var row = Number(match[2]) - 1;
    if (column < 0 || column >= MAX_COLUMNS || row < 0 || row >= MAX_ROWS) {
      return null;
    }

    return { column: column, row: row };
  }

  function toAddress(column, row) {
    if (column < 0 || column >= MAX_COLUMNS || row < 0 || row >= MAX_ROWS) {
      return null;
    }

    return columnLabel(column) + String(row + 1);
  }

  function lettersToIndex(letters) {
    var value = 0;
    var i;
    for (i = 0; i < letters.length; i += 1) {
      value = (value * 26) + (letters.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function formatValue(value) {
    if (value && value.type === 'error') {
      return value.code;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!isFinite(value)) {
        return '#ERR!';
      }
      if (Math.abs(value - Math.round(value)) < 1e-9) {
        return String(Math.round(value));
      }
      return String(Number(value.toFixed(8)));
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function isError(value) {
    return Boolean(value && value.type === 'error');
  }

  function error(code) {
    return { type: 'error', code: code };
  }

  function flattenValues(items, bucket) {
    var target = bucket || [];
    var i;
    for (i = 0; i < items.length; i += 1) {
      if (Array.isArray(items[i])) {
        flattenValues(items[i], target);
      } else {
        target.push(items[i]);
      }
    }
    return target;
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return toNumber(value[0] || 0);
    }
    if (isError(value)) {
      return value;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value == null || value === '') {
      return 0;
    }
    var parsed = Number(value);
    return Number.isNaN(parsed) ? error('#ERR!') : parsed;
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return toText(value[0] || '');
    }
    if (isError(value)) {
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

  function toBoolean(value) {
    if (Array.isArray(value)) {
      return toBoolean(value[0] || false);
    }
    if (isError(value)) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (value == null || value === '') {
      return false;
    }
    if (typeof value === 'string') {
      var upper = value.toUpperCase();
      if (upper === 'TRUE') {
        return true;
      }
      if (upper === 'FALSE') {
        return false;
      }
    }
    return true;
  }

  function normalizeLiteral(raw) {
    if (raw == null || raw === '') {
      return '';
    }
    if (/^\s*-?\d+(?:\.\d+)?\s*$/.test(raw)) {
      return Number(raw);
    }
    if (/^\s*TRUE\s*$/i.test(raw)) {
      return true;
    }
    if (/^\s*FALSE\s*$/i.test(raw)) {
      return false;
    }
    return String(raw);
  }

  function tokenize(formula) {
    var tokens = [];
    var index = 0;
    while (index < formula.length) {
      var char = formula[index];
      if (/\s/.test(char)) {
        index += 1;
      } else if (char === '"') {
        var end = index + 1;
        var value = '';
        while (end < formula.length) {
          if (formula[end] === '"') {
            if (formula[end + 1] === '"') {
              value += '"';
              end += 2;
            } else {
              break;
            }
          } else {
            value += formula[end];
            end += 1;
          }
        }
        if (end >= formula.length || formula[end] !== '"') {
          throw new Error('Unterminated string');
        }
        tokens.push({ type: 'string', value: value });
        index = end + 1;
      } else if (/\d|\./.test(char)) {
        var numberMatch = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(formula.slice(index));
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
      } else if (char === ',' || char === '(' || char === ')' || char === ':') {
        tokens.push({ type: char });
        index += 1;
      } else {
        var opMatch = /^(<>|<=|>=|[+\-*/&=<>])/.exec(formula.slice(index));
        if (opMatch) {
          tokens.push({ type: 'operator', value: opMatch[0] });
          index += opMatch[0].length;
        } else {
          var identMatch = /^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/i.exec(formula.slice(index));
          if (!identMatch) {
            throw new Error('Unexpected token');
          }
          tokens.push({ type: 'identifier', value: identMatch[0].toUpperCase() });
          index += identMatch[0].length;
        }
      }
    }
    return tokens;
  }

  function Parser(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  Parser.prototype.peek = function () {
    return this.tokens[this.index];
  };

  Parser.prototype.consume = function (type, value) {
    var token = this.peek();
    if (!token || token.type !== type || (value && token.value !== value)) {
      throw new Error('Unexpected token');
    }
    this.index += 1;
    return token;
  };

  Parser.prototype.parse = function () {
    var expression = this.parseComparison();
    if (this.peek()) {
      throw new Error('Trailing token');
    }
    return expression;
  };

  Parser.prototype.parseComparison = function () {
    var expression = this.parseConcat();
    while (this.peek() && this.peek().type === 'operator' && /^(=|<>|<|<=|>|>=)$/.test(this.peek().value)) {
      var operator = this.consume('operator').value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseConcat() };
    }
    return expression;
  };

  Parser.prototype.parseConcat = function () {
    var expression = this.parseAdditive();
    while (this.peek() && this.peek().type === 'operator' && this.peek().value === '&') {
      this.consume('operator', '&');
      expression = { type: 'binary', operator: '&', left: expression, right: this.parseAdditive() };
    }
    return expression;
  };

  Parser.prototype.parseAdditive = function () {
    var expression = this.parseMultiplicative();
    while (this.peek() && this.peek().type === 'operator' && /^(\+|-)$/.test(this.peek().value)) {
      var operator = this.consume('operator').value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseMultiplicative() };
    }
    return expression;
  };

  Parser.prototype.parseMultiplicative = function () {
    var expression = this.parseUnary();
    while (this.peek() && this.peek().type === 'operator' && /^(\*|\/)$/.test(this.peek().value)) {
      var operator = this.consume('operator').value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseUnary() };
    }
    return expression;
  };

  Parser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'operator' && this.peek().value === '-') {
      this.consume('operator', '-');
      return { type: 'unary', operator: '-', value: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    var token = this.peek();
    if (!token) {
      throw new Error('Missing expression');
    }
    if (token.type === 'number') {
      this.consume('number');
      return { type: 'literal', value: token.value };
    }
    if (token.type === 'string') {
      this.consume('string');
      return { type: 'literal', value: token.value };
    }
    if (token.type === '(') {
      this.consume('(');
      var expression = this.parseComparison();
      this.consume(')');
      return expression;
    }
    if (token.type === 'identifier') {
      this.consume('identifier');
      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'literal', value: token.value === 'TRUE' };
      }
      if (this.peek() && this.peek().type === '(' && FUNCTION_NAMES[token.value]) {
        this.consume('(');
        var args = [];
        if (!this.peek() || this.peek().type !== ')') {
          args.push(this.parseComparison());
          while (this.peek() && this.peek().type === ',') {
            this.consume(',');
            args.push(this.parseComparison());
          }
        }
        this.consume(')');
        return { type: 'call', name: token.value, args: args };
      }
      var reference = { type: 'reference', address: token.value };
      if (this.peek() && this.peek().type === ':') {
        this.consume(':');
        var end = this.consume('identifier').value;
        return { type: 'range', start: token.value, end: end };
      }
      return reference;
    }
    throw new Error('Unexpected token');
  };

  function parseFormula(formula) {
    return new Parser(tokenize(formula)).parse();
  }

  function evaluateSheet(cells) {
    var normalized = cells || {};
    var cache = {};
    var entries = {};

    function evaluateCell(address, stack) {
      if (cache[address]) {
        return cache[address];
      }
      if (stack[address]) {
        return error('#CIRC!');
      }

      var cell = normalized[address] || { raw: '' };
      var raw = cell.raw == null ? '' : String(cell.raw);
      if (!raw.startsWith('=')) {
        var literal = normalizeLiteral(raw);
        var display = formatValue(literal);
        cache[address] = { value: literal, display: display, raw: raw };
        return cache[address];
      }

      var nextStack = Object.assign({}, stack);
      nextStack[address] = true;
      var evaluated;
      try {
        evaluated = evaluateExpression(parseFormula(raw.slice(1)), nextStack);
      } catch (parseError) {
        evaluated = error('#ERR!');
      }

      cache[address] = {
        value: evaluated,
        display: formatValue(evaluated),
        raw: raw,
      };
      return cache[address];
    }

    function evaluateReference(reference, stack) {
      var parsed = parseRelativeReference(reference);
      if (!parsed) {
        return error('#REF!');
      }
      var address = toAddress(parsed.column, parsed.row);
      if (!address) {
        return error('#REF!');
      }
      var entry = evaluateCell(address, stack);
      return isError(entry) ? entry : entry.value;
    }

    function evaluateRange(range, stack) {
      var start = parseRelativeReference(range.start);
      var end = parseRelativeReference(range.end);
      if (!start || !end) {
        return error('#REF!');
      }
      var minRow = Math.min(start.row, end.row);
      var maxRow = Math.max(start.row, end.row);
      var minColumn = Math.min(start.column, end.column);
      var maxColumn = Math.max(start.column, end.column);
      var values = [];
      var row;
      var column;
      for (row = minRow; row <= maxRow; row += 1) {
        for (column = minColumn; column <= maxColumn; column += 1) {
          values.push(evaluateReference(toAddress(column, row), stack));
        }
      }
      return values;
    }

    function evaluateExpression(expression, stack) {
      if (expression.type === 'literal') {
        return expression.value;
      }
      if (expression.type === 'reference') {
        return evaluateReference(expression.address, stack);
      }
      if (expression.type === 'range') {
        return evaluateRange(expression, stack);
      }
      if (expression.type === 'unary') {
        var unaryValue = toNumber(evaluateExpression(expression.value, stack));
        return isError(unaryValue) ? unaryValue : -unaryValue;
      }
      if (expression.type === 'binary') {
        var left = evaluateExpression(expression.left, stack);
        var right = evaluateExpression(expression.right, stack);
        if (isError(left)) {
          return left;
        }
        if (isError(right)) {
          return right;
        }
        if (expression.operator === '&') {
          left = toText(left);
          right = toText(right);
          return isError(left) || isError(right) ? error('#ERR!') : left + right;
        }
        if (/^(=|<>|<|<=|>|>=)$/.test(expression.operator)) {
          return compareValues(left, right, expression.operator);
        }
        left = toNumber(left);
        right = toNumber(right);
        if (isError(left)) {
          return left;
        }
        if (isError(right)) {
          return right;
        }
        if (expression.operator === '+') {
          return left + right;
        }
        if (expression.operator === '-') {
          return left - right;
        }
        if (expression.operator === '*') {
          return left * right;
        }
        if (expression.operator === '/') {
          return right === 0 ? error('#DIV/0!') : left / right;
        }
      }
      if (expression.type === 'call') {
        return callFunction(expression.name, expression.args.map(function (arg) {
          return evaluateExpression(arg, stack);
        }));
      }
      return error('#ERR!');
    }

    Object.keys(normalized).forEach(function (address) {
      entries[address] = evaluateCell(address, {});
    });

    return entries;
  }

  function compareValues(left, right, operator) {
    var leftPrimitive = Array.isArray(left) ? left[0] || '' : left;
    var rightPrimitive = Array.isArray(right) ? right[0] || '' : right;
    var numericLeft = toNumber(leftPrimitive);
    var numericRight = toNumber(rightPrimitive);
    var comparableLeft = !isError(numericLeft) && !isError(numericRight) ? numericLeft : toText(leftPrimitive);
    var comparableRight = !isError(numericLeft) && !isError(numericRight) ? numericRight : toText(rightPrimitive);
    if (isError(comparableLeft) || isError(comparableRight)) {
      return error('#ERR!');
    }
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

  function callFunction(name, args) {
    var flat = flattenValues(args, []);
    var i;
    if (args.some(isError) || flat.some(isError)) {
      return flat.find(isError) || args.find(isError);
    }

    if (name === 'SUM') {
      return flat.reduce(function (sum, value) {
        value = toNumber(value);
        return isError(value) ? sum : sum + value;
      }, 0);
    }
    if (name === 'AVERAGE') {
      if (!flat.length) {
        return 0;
      }
      return callFunction('SUM', args) / flat.length;
    }
    if (name === 'MIN') {
      return Math.min.apply(null, flat.map(function (value) { return toNumber(value); }));
    }
    if (name === 'MAX') {
      return Math.max.apply(null, flat.map(function (value) { return toNumber(value); }));
    }
    if (name === 'COUNT') {
      var count = 0;
      for (i = 0; i < flat.length; i += 1) {
        if (!isError(toNumber(flat[i]))) {
          count += 1;
        }
      }
      return count;
    }
    if (name === 'IF') {
      var condition = toBoolean(args[0]);
      if (isError(condition)) {
        return condition;
      }
      return condition ? (args.length > 1 ? args[1] : true) : (args.length > 2 ? args[2] : false);
    }
    if (name === 'AND') {
      for (i = 0; i < flat.length; i += 1) {
        if (!toBoolean(flat[i])) {
          return false;
        }
      }
      return true;
    }
    if (name === 'OR') {
      for (i = 0; i < flat.length; i += 1) {
        if (toBoolean(flat[i])) {
          return true;
        }
      }
      return false;
    }
    if (name === 'NOT') {
      return !toBoolean(args[0]);
    }
    if (name === 'ABS') {
      return Math.abs(toNumber(args[0]));
    }
    if (name === 'ROUND') {
      var value = toNumber(args[0]);
      var digits = args.length > 1 ? toNumber(args[1]) : 0;
      if (isError(value) || isError(digits)) {
        return error('#ERR!');
      }
      var factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    }
    if (name === 'CONCAT') {
      return flat.map(function (value) {
        return toText(value);
      }).join('');
    }
    return error('#ERR!');
  }

  function parseRelativeReference(reference) {
    var match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(reference || '');
    if (!match) {
      return null;
    }
    return {
      absoluteColumn: match[1] === '$',
      column: lettersToIndex(match[2]),
      absoluteRow: match[3] === '$',
      row: Number(match[4]) - 1,
    };
  }

  function adjustReference(reference, rowDelta, columnDelta) {
    var parsed = parseRelativeReference(reference);
    if (!parsed) {
      return reference;
    }
    var column = parsed.absoluteColumn ? parsed.column : parsed.column + columnDelta;
    var row = parsed.absoluteRow ? parsed.row : parsed.row + rowDelta;
    return (parsed.absoluteColumn ? '$' : '') + columnLabel(column) + (parsed.absoluteRow ? '$' : '') + String(row + 1);
  }

  function adjustFormula(formula, rowDelta, columnDelta) {
    if (!formula || formula[0] !== '=') {
      return formula;
    }
    var result = '=';
    var index = 1;
    var inString = false;
    while (index < formula.length) {
      var char = formula[index];
      if (char === '"') {
        inString = !inString;
        result += char;
        index += 1;
        continue;
      }
      if (!inString) {
        var match = /^(\$?[A-Z]+\$?\d+)/.exec(formula.slice(index));
        if (match) {
          result += adjustReference(match[1], rowDelta, columnDelta);
          index += match[1].length;
          continue;
        }
      }
      result += char;
      index += 1;
    }
    return result;
  }

  return {
    MAX_COLUMNS: MAX_COLUMNS,
    MAX_ROWS: MAX_ROWS,
    columnLabel: columnLabel,
    parseAddress: parseAddress,
    toAddress: toAddress,
    evaluateSheet: evaluateSheet,
    adjustFormula: adjustFormula,
  };
});
