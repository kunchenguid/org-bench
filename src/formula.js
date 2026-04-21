(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.FormulaEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERROR = {
    GENERIC: '#ERR!',
    CIRC: '#CIRC!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
  };

  function FormulaError(code) {
    this.name = 'FormulaError';
    this.code = code || ERROR.GENERIC;
    this.message = this.code;
  }

  FormulaError.prototype = Object.create(Error.prototype);
  FormulaError.prototype.constructor = FormulaError;

  function createWorkbook(initialCells) {
    const workbook = { cells: {} };
    if (initialCells) {
      Object.keys(initialCells).forEach(function (cellId) {
        workbook.cells[cellId] = { raw: String(initialCells[cellId]) };
      });
    }
    return workbook;
  }

  function cloneWorkbook(workbook) {
    return createWorkbook(serializeWorkbook(workbook));
  }

  function serializeWorkbook(workbook) {
    const output = {};
    Object.keys(workbook.cells).forEach(function (cellId) {
      const raw = workbook.cells[cellId] && workbook.cells[cellId].raw;
      if (raw !== undefined && raw !== '') {
        output[cellId] = raw;
      }
    });
    return output;
  }

  function normalizeCellId(cellId) {
    if (!cellId) {
      throw new FormulaError(ERROR.REF);
    }
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(String(cellId).toUpperCase());
    if (!match) {
      throw new FormulaError(ERROR.REF);
    }
    return match[1] + match[2];
  }

  function decodeColumnName(name) {
    let value = 0;
    for (let index = 0; index < name.length; index += 1) {
      value = value * 26 + (name.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function encodeColumnName(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function decodeCellId(cellId) {
    const normalized = normalizeCellId(cellId);
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(normalized);
    return {
      col: decodeColumnName(match[1]),
      row: Number(match[2]) - 1,
    };
  }

  function encodeCellId(col, row) {
    if (col < 0 || row < 0) {
      throw new FormulaError(ERROR.REF);
    }
    return encodeColumnName(col) + String(row + 1);
  }

  function setCellRaw(workbook, cellId, raw) {
    const normalized = normalizeCellId(cellId);
    const nextRaw = raw == null ? '' : String(raw);
    if (!nextRaw) {
      delete workbook.cells[normalized];
      return;
    }
    workbook.cells[normalized] = { raw: nextRaw };
  }

  function getCellRaw(workbook, cellId) {
    const normalized = normalizeCellId(cellId);
    return workbook.cells[normalized] ? workbook.cells[normalized].raw : '';
  }

  function evaluateCell(workbook, cellId, cache, stack) {
    const normalized = normalizeCellId(cellId);
    const memo = cache || {};
    const trail = stack || [];

    if (memo[normalized]) {
      return memo[normalized];
    }
    if (trail.indexOf(normalized) !== -1) {
      return resultFromError(ERROR.CIRC);
    }

    const raw = getCellRaw(workbook, normalized);
    const nextTrail = trail.concat(normalized);
    let result;

    if (!raw) {
      result = valueResult('');
    } else if (raw.charAt(0) === '=') {
      try {
        const tokens = tokenize(raw.slice(1));
        const parser = new Parser(tokens);
        const ast = parser.parse();
        result = valueResult(evaluateAst(ast, workbook, memo, nextTrail));
      } catch (error) {
        result = resultFromThrown(error);
      }
    } else {
      result = valueResult(parseLiteral(raw));
    }

    memo[normalized] = result;
    return result;
  }

  function getCellDisplay(workbook, cellId) {
    const result = evaluateCell(workbook, cellId);
    return formatValue(result.value);
  }

  function parseLiteral(raw) {
    if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(raw.trim())) {
      return Number(raw);
    }
    return raw;
  }

  function valueResult(value) {
    return { value: value };
  }

  function resultFromError(code) {
    return { value: code };
  }

  function resultFromThrown(error) {
    if (error instanceof FormulaError) {
      return resultFromError(error.code);
    }
    return resultFromError(ERROR.GENERIC);
  }

  function isErrorValue(value) {
    return typeof value === 'string' && value.charAt(0) === '#';
  }

  function formatValue(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ERROR.DIV0;
      }
      if (Object.is(value, -0)) {
        return '0';
      }
      return String(Number(value.toFixed(12))).replace(/\.0+$/, '');
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function toNumber(value) {
    if (isErrorValue(value)) {
      throw new FormulaError(value);
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
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    return 0;
  }

  function toStringValue(value) {
    if (isErrorValue(value)) {
      throw new FormulaError(value);
    }
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function toBoolean(value) {
    if (isErrorValue(value)) {
      throw new FormulaError(value);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function valuesEqual(left, right) {
    if (typeof left === 'number' || typeof right === 'number') {
      return toNumber(left) === toNumber(right);
    }
    return String(left) === String(right);
  }

  function compareValues(left, right, operator) {
    if (operator === '=') {
      return valuesEqual(left, right);
    }
    if (operator === '<>') {
      return !valuesEqual(left, right);
    }

    const bothNumeric = isComparableNumber(left) || isComparableNumber(right);
    if (bothNumeric) {
      left = toNumber(left);
      right = toNumber(right);
    } else {
      left = toStringValue(left);
      right = toStringValue(right);
    }

    if (operator === '<') {
      return left < right;
    }
    if (operator === '<=') {
      return left <= right;
    }
    if (operator === '>') {
      return left > right;
    }
    if (operator === '>=') {
      return left >= right;
    }
    throw new FormulaError(ERROR.GENERIC);
  }

  function isComparableNumber(value) {
    if (typeof value === 'number' || typeof value === 'boolean' || value === '' || value == null) {
      return true;
    }
    return !Number.isNaN(Number(value));
  }

  function flattenArgs(values) {
    const output = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        value.forEach(function (nested) {
          output.push(nested);
        });
        return;
      }
      output.push(value);
    });
    return output;
  }

  const FUNCTIONS = {
    SUM: function (args) {
      return flattenArgs(args).reduce(function (sum, value) {
        return sum + toNumber(value);
      }, 0);
    },
    AVERAGE: function (args) {
      const values = flattenArgs(args);
      if (!values.length) {
        return 0;
      }
      return FUNCTIONS.SUM(values) / values.length;
    },
    MIN: function (args) {
      const values = flattenArgs(args).map(toNumber);
      return values.length ? Math.min.apply(Math, values) : 0;
    },
    MAX: function (args) {
      const values = flattenArgs(args).map(toNumber);
      return values.length ? Math.max.apply(Math, values) : 0;
    },
    COUNT: function (args) {
      return flattenArgs(args).filter(function (value) {
        return value !== '' && value != null;
      }).length;
    },
    IF: function (args) {
      return toBoolean(args[0]) ? args[1] : args[2];
    },
    AND: function (args) {
      return flattenArgs(args).every(toBoolean);
    },
    OR: function (args) {
      return flattenArgs(args).some(toBoolean);
    },
    NOT: function (args) {
      return !toBoolean(args[0]);
    },
    ABS: function (args) {
      return Math.abs(toNumber(args[0]));
    },
    ROUND: function (args) {
      const value = toNumber(args[0]);
      const places = Math.max(0, Math.floor(toNumber(args[1] || 0)));
      const factor = Math.pow(10, places);
      return Math.round(value * factor) / factor;
    },
    CONCAT: function (args) {
      return flattenArgs(args).map(toStringValue).join('');
    },
  };

  function evaluateAst(node, workbook, cache, stack) {
    if (!node) {
      throw new FormulaError(ERROR.GENERIC);
    }
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'unary':
        return -toNumber(evaluateAst(node.argument, workbook, cache, stack));
      case 'binary':
        return evaluateBinary(node, workbook, cache, stack);
      case 'reference':
        return evaluateCell(workbook, node.cellId, cache, stack).value;
      case 'range':
        return expandRange(node.start, node.end).map(function (cellId) {
          return evaluateCell(workbook, cellId, cache, stack).value;
        });
      case 'call':
        return evaluateCall(node, workbook, cache, stack);
      default:
        throw new FormulaError(ERROR.GENERIC);
    }
  }

  function evaluateBinary(node, workbook, cache, stack) {
    const left = evaluateAst(node.left, workbook, cache, stack);
    const right = evaluateAst(node.right, workbook, cache, stack);
    const operator = node.operator;

    if (operator === '+') {
      return toNumber(left) + toNumber(right);
    }
    if (operator === '-') {
      return toNumber(left) - toNumber(right);
    }
    if (operator === '*') {
      return toNumber(left) * toNumber(right);
    }
    if (operator === '/') {
      const divisor = toNumber(right);
      if (divisor === 0) {
        throw new FormulaError(ERROR.DIV0);
      }
      return toNumber(left) / divisor;
    }
    if (operator === '&') {
      return toStringValue(left) + toStringValue(right);
    }
    return compareValues(left, right, operator);
  }

  function evaluateCall(node, workbook, cache, stack) {
    const fn = FUNCTIONS[node.name];
    if (!fn) {
      throw new FormulaError(ERROR.GENERIC);
    }
    const values = node.args.map(function (arg) {
      return evaluateAst(arg, workbook, cache, stack);
    });
    return fn(values);
  }

  function expandRange(start, end) {
    const startPoint = decodeCellId(start);
    const endPoint = decodeCellId(end);
    const minCol = Math.min(startPoint.col, endPoint.col);
    const maxCol = Math.max(startPoint.col, endPoint.col);
    const minRow = Math.min(startPoint.row, endPoint.row);
    const maxRow = Math.max(startPoint.row, endPoint.row);
    const cells = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        cells.push(encodeCellId(col, row));
      }
    }
    return cells;
  }

  function tokenize(expression) {
    const tokens = [];
    let index = 0;

    while (index < expression.length) {
      const char = expression.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"') {
        let value = '';
        index += 1;
        while (index < expression.length && expression.charAt(index) !== '"') {
          value += expression.charAt(index);
          index += 1;
        }
        if (expression.charAt(index) !== '"') {
          throw new FormulaError(ERROR.GENERIC);
        }
        index += 1;
        tokens.push({ type: 'string', value: value });
        continue;
      }
      if (/\d|\./.test(char)) {
        const match = expression.slice(index).match(/^(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i);
        if (!match) {
          throw new FormulaError(ERROR.GENERIC);
        }
        tokens.push({ type: 'number', value: Number(match[0]) });
        index += match[0].length;
        continue;
      }
      if (/[A-Za-z$]/.test(char)) {
        const match = expression.slice(index).match(/^\$?[A-Za-z]+\$?\d+|^[A-Za-z_][A-Za-z0-9_]*/);
        if (!match) {
          throw new FormulaError(ERROR.GENERIC);
        }
        const raw = match[0];
        const upper = raw.toUpperCase();
        if (/^\$?[A-Z]+\$?\d+$/.test(upper)) {
          tokens.push({ type: 'cell', value: upper });
        } else if (upper === 'TRUE' || upper === 'FALSE') {
          tokens.push({ type: 'boolean', value: upper === 'TRUE' });
        } else {
          tokens.push({ type: 'identifier', value: upper });
        }
        index += raw.length;
        continue;
      }
      const twoChar = expression.slice(index, index + 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }
      if ('+-*/&=<>(),:'.indexOf(char) !== -1) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? 'symbol' : 'operator', value: char });
        index += 1;
        continue;
      }
      throw new FormulaError(ERROR.GENERIC);
    }

    return tokens;
  }

  function Parser(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  Parser.prototype.parse = function () {
    const expression = this.parseComparison();
    if (this.peek()) {
      throw new FormulaError(ERROR.GENERIC);
    }
    return expression;
  };

  Parser.prototype.peek = function () {
    return this.tokens[this.index];
  };

  Parser.prototype.consume = function () {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  };

  Parser.prototype.match = function (type, value) {
    const token = this.peek();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      return false;
    }
    this.index += 1;
    return true;
  };

  Parser.prototype.expect = function (type, value) {
    const token = this.consume();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new FormulaError(ERROR.GENERIC);
    }
    return token;
  };

  Parser.prototype.parseComparison = function () {
    let node = this.parseConcat();
    while (this.peek() && this.peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.peek().value) !== -1) {
      const operator = this.consume().value;
      node = { type: 'binary', operator: operator, left: node, right: this.parseConcat() };
    }
    return node;
  };

  Parser.prototype.parseConcat = function () {
    let node = this.parseAdditive();
    while (this.match('operator', '&')) {
      node = { type: 'binary', operator: '&', left: node, right: this.parseAdditive() };
    }
    return node;
  };

  Parser.prototype.parseAdditive = function () {
    let node = this.parseMultiplicative();
    while (this.peek() && this.peek().type === 'operator' && (this.peek().value === '+' || this.peek().value === '-')) {
      const operator = this.consume().value;
      node = { type: 'binary', operator: operator, left: node, right: this.parseMultiplicative() };
    }
    return node;
  };

  Parser.prototype.parseMultiplicative = function () {
    let node = this.parseUnary();
    while (this.peek() && this.peek().type === 'operator' && (this.peek().value === '*' || this.peek().value === '/')) {
      const operator = this.consume().value;
      node = { type: 'binary', operator: operator, left: node, right: this.parseUnary() };
    }
    return node;
  };

  Parser.prototype.parseUnary = function () {
    if (this.match('operator', '-')) {
      return { type: 'unary', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    const token = this.peek();
    if (!token) {
      throw new FormulaError(ERROR.GENERIC);
    }
    if (this.match('symbol', '(')) {
      const expression = this.parseComparison();
      this.expect('symbol', ')');
      return expression;
    }
    if (token.type === 'number' || token.type === 'string' || token.type === 'boolean') {
      this.consume();
      return { type: token.type, value: token.value };
    }
    if (token.type === 'identifier') {
      const name = this.consume().value;
      this.expect('symbol', '(');
      const args = [];
      if (!this.match('symbol', ')')) {
        do {
          args.push(this.parseComparison());
        } while (this.match('symbol', ','));
        this.expect('symbol', ')');
      }
      return { type: 'call', name: name, args: args };
    }
    if (token.type === 'cell') {
      const start = absoluteToRelativeRef(this.consume().value);
      if (this.match('symbol', ':')) {
        const endToken = this.expect('cell');
        return { type: 'range', start: start, end: absoluteToRelativeRef(endToken.value) };
      }
      return { type: 'reference', cellId: start };
    }
    throw new FormulaError(ERROR.GENERIC);
  };

  function absoluteToRelativeRef(value) {
    return value.replace(/\$/g, '');
  }

  function parseReferenceToken(token) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(token.toUpperCase());
    if (!match) {
      throw new FormulaError(ERROR.REF);
    }
    return {
      colAbsolute: Boolean(match[1]),
      col: decodeColumnName(match[2]),
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function formatReferenceToken(reference) {
    return (reference.colAbsolute ? '$' : '') +
      encodeColumnName(reference.col) +
      (reference.rowAbsolute ? '$' : '') +
      String(reference.row + 1);
  }

  function shiftReferenceToken(token, rowDelta, colDelta) {
    const reference = parseReferenceToken(token);
    if (!reference.colAbsolute) {
      reference.col += colDelta;
    }
    if (!reference.rowAbsolute) {
      reference.row += rowDelta;
    }
    if (reference.col < 0 || reference.row < 0) {
      throw new FormulaError(ERROR.REF);
    }
    return formatReferenceToken(reference);
  }

  function shiftFormula(formula, rowDelta, colDelta) {
    if (!formula || formula.charAt(0) !== '=') {
      return formula;
    }
    let output = '=';
    let index = 1;
    let inString = false;

    while (index < formula.length) {
      const char = formula.charAt(index);
      if (char === '"') {
        inString = !inString;
        output += char;
        index += 1;
        continue;
      }
      if (!inString) {
        const match = formula.slice(index).match(/^\$?[A-Z]+\$?\d+/);
        if (match) {
          output += shiftReferenceToken(match[0], rowDelta, colDelta);
          index += match[0].length;
          continue;
        }
      }
      output += char;
      index += 1;
    }
    return output;
  }

  return {
    ERROR: ERROR,
    Parser: Parser,
    cloneWorkbook: cloneWorkbook,
    createWorkbook: createWorkbook,
    decodeCellId: decodeCellId,
    encodeCellId: encodeCellId,
    evaluateCell: evaluateCell,
    getCellDisplay: getCellDisplay,
    getCellRaw: getCellRaw,
    serializeWorkbook: serializeWorkbook,
    setCellRaw: setCellRaw,
    shiftFormula: shiftFormula,
  };
});
