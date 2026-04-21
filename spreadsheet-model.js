(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CIRCULAR = '#CIRC!';
  const GENERIC_ERROR = '#ERR!';
  const DIV_ZERO = '#DIV/0!';
  const REF_ERROR = '#REF!';

  function columnToIndex(columnLabel) {
    let result = 0;
    for (let i = 0; i < columnLabel.length; i += 1) {
      result = result * 26 + (columnLabel.charCodeAt(i) - 64);
    }
    return result - 1;
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
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(String(address).toUpperCase());
    if (!match) {
      throw createFormulaError(REF_ERROR);
    }
    return match[1] + match[2];
  }

  function splitAddress(address) {
    const normalized = normalizeAddress(address);
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(normalized);
    return {
      column: columnToIndex(match[1]),
      row: Number(match[2]) - 1,
    };
  }

  function joinAddress(column, row) {
    if (column < 0 || row < 0) {
      throw createFormulaError(REF_ERROR);
    }
    return indexToColumn(column) + String(row + 1);
  }

  function createFormulaError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function formatValue(value) {
    if (value && value.__error) {
      return value.__error;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return GENERIC_ERROR;
      }
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))).replace(/\.0+$/, '');
    }
    return value == null ? '' : String(value);
  }

  function toNumber(value) {
    if (value && value.__error) {
      throw createFormulaError(value.__error);
    }
    if (value === '' || value == null) {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      throw createFormulaError(GENERIC_ERROR);
    }
    return number;
  }

  function toText(value) {
    if (value && value.__error) {
      throw createFormulaError(value.__error);
    }
    if (value === '' || value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function toBoolean(value) {
    if (value && value.__error) {
      throw createFormulaError(value.__error);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (value === '' || value == null) {
      return false;
    }
    const upper = String(value).toUpperCase();
    if (upper === 'TRUE') {
      return true;
    }
    if (upper === 'FALSE') {
      return false;
    }
    return Boolean(value);
  }

  function parseLiteral(raw) {
    if (raw === '') {
      return '';
    }
    const number = Number(raw);
    if (!Number.isNaN(number) && raw.trim() !== '') {
      return number;
    }
    return raw;
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < source.length && source[end] !== '"') {
          value += source[end];
          end += 1;
        }
        if (source[end] !== '"') {
          throw createFormulaError(GENERIC_ERROR);
        }
        tokens.push({ type: 'string', value: value });
        index = end + 1;
        continue;
      }
      const refMatch = /^\$?[A-Z]+\$?[1-9][0-9]*/.exec(source.slice(index).toUpperCase());
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0] });
        index += refMatch[0].length;
        continue;
      }
      const nameMatch = /^[A-Z_]+/.exec(source.slice(index).toUpperCase());
      if (nameMatch) {
        tokens.push({ type: 'name', value: nameMatch[0] });
        index += nameMatch[0].length;
        continue;
      }
      const numberMatch = /^\d+(?:\.\d+)?/.exec(source.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const twoCharOperator = source.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoCharOperator)) {
        tokens.push({ type: 'operator', value: twoCharOperator });
        index += 2;
        continue;
      }
      if ('+-*/&=<>(),:'.includes(char)) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? char : 'operator', value: char });
        index += 1;
        continue;
      }
      throw createFormulaError(GENERIC_ERROR);
    }
    return tokens;
  }

  function FormulaParser(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  FormulaParser.prototype.peek = function () {
    return this.tokens[this.index] || null;
  };

  FormulaParser.prototype.consume = function (expectedType, expectedValue) {
    const token = this.peek();
    if (!token || token.type !== expectedType || (expectedValue !== undefined && token.value !== expectedValue)) {
      throw createFormulaError(GENERIC_ERROR);
    }
    this.index += 1;
    return token;
  };

  FormulaParser.prototype.parse = function () {
    const expression = this.parseComparison();
    if (this.peek()) {
      throw createFormulaError(GENERIC_ERROR);
    }
    return expression;
  };

  FormulaParser.prototype.parseComparison = function () {
    let node = this.parseConcat();
    while (this.peek() && this.peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
      const operator = this.consume('operator').value;
      const right = this.parseConcat();
      node = { type: 'binary', operator: operator, left: node, right: right };
    }
    return node;
  };

  FormulaParser.prototype.parseConcat = function () {
    let node = this.parseAdditive();
    while (this.peek() && this.peek().type === 'operator' && this.peek().value === '&') {
      const operator = this.consume('operator').value;
      const right = this.parseAdditive();
      node = { type: 'binary', operator: operator, left: node, right: right };
    }
    return node;
  };

  FormulaParser.prototype.parseAdditive = function () {
    let node = this.parseMultiplicative();
    while (this.peek() && this.peek().type === 'operator' && ['+', '-'].includes(this.peek().value)) {
      const operator = this.consume('operator').value;
      const right = this.parseMultiplicative();
      node = { type: 'binary', operator: operator, left: node, right: right };
    }
    return node;
  };

  FormulaParser.prototype.parseMultiplicative = function () {
    let node = this.parseUnary();
    while (this.peek() && this.peek().type === 'operator' && ['*', '/'].includes(this.peek().value)) {
      const operator = this.consume('operator').value;
      const right = this.parseUnary();
      node = { type: 'binary', operator: operator, left: node, right: right };
    }
    return node;
  };

  FormulaParser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'operator' && this.peek().value === '-') {
      this.consume('operator', '-');
      return { type: 'unary', operator: '-', value: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  FormulaParser.prototype.parsePrimary = function () {
    const token = this.peek();
    if (!token) {
      throw createFormulaError(GENERIC_ERROR);
    }
    if (token.type === 'number') {
      this.consume('number');
      return { type: 'literal', value: token.value };
    }
    if (token.type === 'string') {
      this.consume('string');
      return { type: 'literal', value: token.value };
    }
    if (token.type === 'name') {
      const name = this.consume('name').value;
      if (name === 'TRUE' || name === 'FALSE') {
        return { type: 'literal', value: name === 'TRUE' };
      }
      if (this.peek() && this.peek().type === '(') {
        this.consume('(');
        const args = [];
        if (!this.peek() || this.peek().type !== ')') {
          do {
            args.push(this.parseComparison());
            if (!this.peek() || this.peek().type !== ',') {
              break;
            }
            this.consume(',');
          } while (true);
        }
        this.consume(')');
        return { type: 'call', name: name, args: args };
      }
      throw createFormulaError(GENERIC_ERROR);
    }
    if (token.type === 'ref') {
      const start = this.consume('ref').value;
      if (this.peek() && this.peek().type === ':') {
        this.consume(':');
        const end = this.consume('ref').value;
        return { type: 'range', start: start, end: end };
      }
      return { type: 'ref', ref: start };
    }
    if (token.type === '(') {
      this.consume('(');
      const expression = this.parseComparison();
      this.consume(')');
      return expression;
    }
    throw createFormulaError(GENERIC_ERROR);
  };

  function resolveRef(ref) {
    const match = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(ref.toUpperCase());
    if (!match) {
      throw createFormulaError(REF_ERROR);
    }
    return {
      address: match[2] + match[4],
    };
  }

  function iterateRange(startRef, endRef) {
    const start = splitAddress(resolveRef(startRef).address);
    const end = splitAddress(resolveRef(endRef).address);
    const rowStart = Math.min(start.row, end.row);
    const rowEnd = Math.max(start.row, end.row);
    const colStart = Math.min(start.column, end.column);
    const colEnd = Math.max(start.column, end.column);
    const cells = [];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let column = colStart; column <= colEnd; column += 1) {
        cells.push(joinAddress(column, row));
      }
    }
    return cells;
  }

  function compareValues(left, right, operator) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const bothNumeric = !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber);
    const a = bothNumeric ? leftNumber : toText(left);
    const b = bothNumeric ? rightNumber : toText(right);
    if (operator === '=') {
      return a === b;
    }
    if (operator === '<>') {
      return a !== b;
    }
    if (operator === '<') {
      return a < b;
    }
    if (operator === '<=') {
      return a <= b;
    }
    if (operator === '>') {
      return a > b;
    }
    return a >= b;
  }

  function flattenValues(values) {
    return values.reduce(function (accumulator, value) {
      if (Array.isArray(value)) {
        return accumulator.concat(flattenValues(value));
      }
      accumulator.push(value);
      return accumulator;
    }, []);
  }

  function evaluateFunction(name, args) {
    const flatArgs = flattenValues(args);
    if (name === 'SUM') {
      return flatArgs.reduce(function (sum, value) { return sum + toNumber(value); }, 0);
    }
    if (name === 'AVERAGE') {
      if (flatArgs.length === 0) {
        return 0;
      }
      return flatArgs.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / flatArgs.length;
    }
    if (name === 'MIN') {
      return Math.min.apply(null, flatArgs.map(toNumber));
    }
    if (name === 'MAX') {
      return Math.max.apply(null, flatArgs.map(toNumber));
    }
    if (name === 'COUNT') {
      return flatArgs.filter(function (value) { return !Number.isNaN(Number(value)) && value !== ''; }).length;
    }
    if (name === 'IF') {
      return toBoolean(args[0]) ? args[1] : args[2];
    }
    if (name === 'AND') {
      return flatArgs.every(toBoolean);
    }
    if (name === 'OR') {
      return flatArgs.some(toBoolean);
    }
    if (name === 'NOT') {
      return !toBoolean(args[0]);
    }
    if (name === 'ABS') {
      return Math.abs(toNumber(args[0]));
    }
    if (name === 'ROUND') {
      const digits = args[1] == null ? 0 : toNumber(args[1]);
      const scale = Math.pow(10, digits);
      return Math.round(toNumber(args[0]) * scale) / scale;
    }
    if (name === 'CONCAT') {
      return flatArgs.map(toText).join('');
    }
    throw createFormulaError(GENERIC_ERROR);
  }

  function SpreadsheetModel(snapshot) {
    this.cells = new Map();
    if (snapshot) {
      const entries = Array.isArray(snapshot) ? snapshot : Object.entries(snapshot);
      for (const entry of entries) {
        this.cells.set(normalizeAddress(entry[0]), String(entry[1]));
      }
    }
  }

  SpreadsheetModel.prototype.getCellRaw = function (address) {
    return this.cells.get(normalizeAddress(address)) || '';
  };

  SpreadsheetModel.prototype.setCellRaw = function (address, raw) {
    const normalized = normalizeAddress(address);
    const stringValue = String(raw);
    if (stringValue === '') {
      this.cells.delete(normalized);
      return;
    }
    this.cells.set(normalized, stringValue);
  };

  SpreadsheetModel.prototype.toJSON = function () {
    return Object.fromEntries(this.cells.entries());
  };

  SpreadsheetModel.prototype.getCellValue = function (address, context) {
    const normalized = normalizeAddress(address);
    const evaluation = context || { cache: new Map(), stack: new Set() };
    if (evaluation.cache.has(normalized)) {
      return evaluation.cache.get(normalized);
    }
    if (evaluation.stack.has(normalized)) {
      return { __error: CIRCULAR };
    }
    evaluation.stack.add(normalized);
    const raw = this.getCellRaw(normalized);
    let value;
    if (raw.startsWith('=')) {
      try {
        const parser = new FormulaParser(tokenize(raw.slice(1)));
        value = this.evaluateExpression(parser.parse(), normalized, evaluation);
      } catch (error) {
        value = { __error: error.code || GENERIC_ERROR };
      }
    } else {
      value = parseLiteral(raw);
    }
    evaluation.stack.delete(normalized);
    evaluation.cache.set(normalized, value);
    return value;
  };

  SpreadsheetModel.prototype.evaluateExpression = function (node, address, context) {
    if (node.type === 'literal') {
      return node.value;
    }
    if (node.type === 'ref') {
      return this.getCellValue(resolveRef(node.ref).address, context);
    }
    if (node.type === 'range') {
      return iterateRange(node.start, node.end).map(function (cellAddress) {
        return this.getCellValue(cellAddress, context);
      }, this);
    }
    if (node.type === 'unary') {
      return -toNumber(this.evaluateExpression(node.value, address, context));
    }
    if (node.type === 'binary') {
      const left = this.evaluateExpression(node.left, address, context);
      const right = this.evaluateExpression(node.right, address, context);
      if (node.operator === '+') {
        return toNumber(left) + toNumber(right);
      }
      if (node.operator === '-') {
        return toNumber(left) - toNumber(right);
      }
      if (node.operator === '*') {
        return toNumber(left) * toNumber(right);
      }
      if (node.operator === '/') {
        const divisor = toNumber(right);
        if (divisor === 0) {
          throw createFormulaError(DIV_ZERO);
        }
        return toNumber(left) / divisor;
      }
      if (node.operator === '&') {
        return toText(left) + toText(right);
      }
      return compareValues(left, right, node.operator);
    }
    if (node.type === 'call') {
      const args = node.args.map(function (argument) {
        return this.evaluateExpression(argument, address, context);
      }, this);
      return evaluateFunction(node.name, args);
    }
    throw createFormulaError(GENERIC_ERROR);
  };

  SpreadsheetModel.prototype.getCellDisplay = function (address) {
    return formatValue(this.getCellValue(address));
  };

  function shiftFormula(formula, rowDelta, columnDelta) {
    if (!String(formula).startsWith('=')) {
      return String(formula);
    }
    return String(formula).replace(/(\$?)([A-Z]+)(\$?)([1-9][0-9]*)/g, function (_, colAbs, colLabel, rowAbs, rowNumber) {
      const column = colAbs ? columnToIndex(colLabel) : columnToIndex(colLabel) + columnDelta;
      const row = rowAbs ? Number(rowNumber) - 1 : Number(rowNumber) - 1 + rowDelta;
      if (column < 0 || row < 0) {
        return REF_ERROR;
      }
      return (colAbs || '') + indexToColumn(column) + (rowAbs || '') + String(row + 1);
    });
  }

  return {
    SpreadsheetModel: SpreadsheetModel,
    shiftFormula: shiftFormula,
    utils: {
      columnToIndex: columnToIndex,
      indexToColumn: indexToColumn,
      joinAddress: joinAddress,
      splitAddress: splitAddress,
    },
  };
});
