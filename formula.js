(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetFormula = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const ERROR_DIV_ZERO = '#DIV/0!';
  const ERROR_GENERIC = '#ERR!';
  const ERROR_CIRC = '#CIRC!';

  function createEngine(options) {
    const getCellRaw = options.getCellRaw;
    const cache = new Map();

    function evaluateCell(address, stack) {
      const key = address.toUpperCase();
      const visitStack = stack || [];

      if (visitStack.includes(key)) {
        return { type: 'error', value: ERROR_CIRC, display: ERROR_CIRC };
      }

      if (cache.has(key) && visitStack.length === 0) {
        return cache.get(key);
      }

      const raw = getCellRaw(key) || '';
      const nextStack = visitStack.concat(key);
      const result = evaluateRaw(raw, nextStack);

      if (visitStack.length === 0) {
        cache.set(key, result);
      }

      return result;
    }

    function evaluateRaw(raw, stack) {
      if (!raw) {
        return makeValue('empty', '');
      }

      if (raw[0] !== '=') {
        const trimmed = raw.trim();
        if (trimmed && !Number.isNaN(Number(trimmed))) {
          return makeValue('number', Number(trimmed));
        }
        return makeValue('string', raw);
      }

      try {
        const parser = new Parser(raw.slice(1));
        const ast = parser.parse();
        const evaluated = evaluateNode(ast, stack);
        return makeValue(evaluated.type, evaluated.value);
      } catch (error) {
        if (error && error.spreadsheetError) {
          return { type: 'error', value: error.spreadsheetError, display: error.spreadsheetError };
        }
        return { type: 'error', value: ERROR_GENERIC, display: ERROR_GENERIC };
      }
    }

    function evaluateNode(node, stack) {
      switch (node.type) {
        case 'number':
          return { type: 'number', value: node.value };
        case 'string':
          return { type: 'string', value: node.value };
        case 'boolean':
          return { type: 'boolean', value: node.value };
        case 'unary': {
          const value = evaluateNode(node.value, stack);
          if (node.operator === '-') {
            return { type: 'number', value: -coerceNumber(value) };
          }
          throw spreadsheetError(ERROR_GENERIC);
        }
        case 'binary': {
          if (node.operator === '&') {
            const leftText = coerceText(evaluateNode(node.left, stack));
            const rightText = coerceText(evaluateNode(node.right, stack));
            return { type: 'string', value: leftText + rightText };
          }

          const left = evaluateNode(node.left, stack);
          const right = evaluateNode(node.right, stack);

          if (['+', '-', '*', '/'].includes(node.operator)) {
            const leftNumber = coerceNumber(left);
            const rightNumber = coerceNumber(right);
            if (node.operator === '+') return { type: 'number', value: leftNumber + rightNumber };
            if (node.operator === '-') return { type: 'number', value: leftNumber - rightNumber };
            if (node.operator === '*') return { type: 'number', value: leftNumber * rightNumber };
            if (rightNumber === 0) throw spreadsheetError(ERROR_DIV_ZERO);
            return { type: 'number', value: leftNumber / rightNumber };
          }

          if (['=', '<>', '<', '<=', '>', '>='].includes(node.operator)) {
            const compared = compareValues(left, right, node.operator);
            return { type: 'boolean', value: compared };
          }

          throw spreadsheetError(ERROR_GENERIC);
        }
        case 'reference': {
          const evaluated = evaluateCell(node.address, stack);
          if (evaluated.type === 'empty') {
            return { type: 'empty', value: '' };
          }
          if (evaluated.type === 'error') {
            throw spreadsheetError(evaluated.value);
          }
          return { type: evaluated.type, value: evaluated.value };
        }
        case 'range': {
          const addresses = getRangeAddresses(node.start, node.end);
          return {
            type: 'range',
            value: addresses.map(function (address) {
              const cell = evaluateCell(address, stack);
              if (cell.type === 'error') {
                throw spreadsheetError(cell.value);
              }
              return cell;
            }),
          };
        }
        case 'call':
          return evaluateFunction(node, stack);
        default:
          throw spreadsheetError(ERROR_GENERIC);
      }
    }

    function evaluateFunction(node, stack) {
      const name = node.name.toUpperCase();
      const args = node.args.map(function (arg) {
        return evaluateNode(arg, stack);
      });

      switch (name) {
        case 'SUM':
          return { type: 'number', value: flattenArgs(args).reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) };
        case 'AVERAGE': {
          const values = flattenArgs(args).map(coerceNumber);
          return { type: 'number', value: values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : 0 };
        }
        case 'MIN':
          return { type: 'number', value: Math.min.apply(null, flattenArgs(args).map(coerceNumber)) };
        case 'MAX':
          return { type: 'number', value: Math.max.apply(null, flattenArgs(args).map(coerceNumber)) };
        case 'COUNT':
          return { type: 'number', value: flattenArgs(args).filter(function (value) { return value.type !== 'empty'; }).length };
        case 'IF':
          return truthy(args[0]) ? normalizeValue(args[1]) : normalizeValue(args[2]);
        case 'AND':
          return { type: 'boolean', value: args.every(truthy) };
        case 'OR':
          return { type: 'boolean', value: args.some(truthy) };
        case 'NOT':
          return { type: 'boolean', value: !truthy(args[0]) };
        case 'ABS':
          return { type: 'number', value: Math.abs(coerceNumber(args[0])) };
        case 'ROUND':
          return { type: 'number', value: roundValue(coerceNumber(args[0]), args[1] ? coerceNumber(args[1]) : 0) };
        case 'CONCAT':
          return { type: 'string', value: flattenArgs(args).map(coerceText).join('') };
        default:
          throw spreadsheetError(ERROR_GENERIC);
      }
    }

    return {
      evaluateCell: function (address) {
        cache.clear();
        return evaluateCell(address.toUpperCase(), []);
      },
      evaluateRaw: function (raw) {
        cache.clear();
        return evaluateRaw(raw, []);
      },
      shiftFormula: function (formula, offset) {
        if (!formula || formula[0] !== '=') return formula;
        return '=' + formula.slice(1).replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (_, colAbs, col, rowAbs, row) {
          const current = decodeAddress(col + row);
          const nextCol = colAbs ? current.col : current.col + offset.cols;
          const nextRow = rowAbs ? current.row : current.row + offset.rows;
          return (colAbs ? '$' : '') + encodeColumn(Math.max(0, nextCol)) + (rowAbs ? '$' : '') + String(Math.max(1, nextRow + 1));
        });
      },
    };
  }

  function flattenArgs(args) {
    return args.flatMap(function (arg) {
      return arg.type === 'range' ? arg.value : [arg];
    });
  }

  function compareValues(left, right, operator) {
    const leftValue = primitiveValue(left);
    const rightValue = primitiveValue(right);
    if (operator === '=') return leftValue === rightValue;
    if (operator === '<>') return leftValue !== rightValue;
    if (operator === '<') return leftValue < rightValue;
    if (operator === '<=') return leftValue <= rightValue;
    if (operator === '>') return leftValue > rightValue;
    return leftValue >= rightValue;
  }

  function truthy(value) {
    if (!value) return false;
    if (value.type === 'boolean') return value.value;
    if (value.type === 'number') return value.value !== 0;
    if (value.type === 'empty') return false;
    return Boolean(value.value);
  }

  function primitiveValue(value) {
    if (!value || value.type === 'empty') return 0;
    return value.value;
  }

  function coerceNumber(value) {
    if (!value || value.type === 'empty') return 0;
    if (value.type === 'number') return value.value;
    if (value.type === 'boolean') return value.value ? 1 : 0;
    const parsed = Number(value.value);
    if (!Number.isNaN(parsed)) return parsed;
    return 0;
  }

  function coerceText(value) {
    if (!value || value.type === 'empty') return '';
    if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
    return String(value.value);
  }

  function normalizeValue(value) {
    if (!value || value.type === 'empty') return { type: 'empty', value: '' };
    return value;
  }

  function roundValue(value, digits) {
    const power = Math.pow(10, digits);
    return Math.round(value * power) / power;
  }

  function makeValue(type, value) {
    if (type === 'number') {
      return { type: 'number', value: value, display: formatNumber(value) };
    }
    if (type === 'boolean') {
      return { type: 'boolean', value: value, display: value ? 'TRUE' : 'FALSE' };
    }
    if (type === 'empty') {
      return { type: 'empty', value: '', display: '' };
    }
    return { type: type, value: value, display: String(value) };
  }

  function formatNumber(value) {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(8)));
  }

  function spreadsheetError(code) {
    const error = new Error(code);
    error.spreadsheetError = code;
    return error;
  }

  function decodeAddress(address) {
    const match = /^([A-Z]+)(\d+)$/.exec(address.toUpperCase());
    if (!match) throw spreadsheetError(ERROR_GENERIC);
    return { col: decodeColumn(match[1]), row: Number(match[2]) - 1 };
  }

  function decodeColumn(label) {
    let value = 0;
    for (let index = 0; index < label.length; index += 1) {
      value = value * 26 + (label.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function encodeColumn(index) {
    let value = index + 1;
    let output = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      output = String.fromCharCode(65 + remainder) + output;
      value = Math.floor((value - remainder - 1) / 26);
    }
    return output;
  }

  function getRangeAddresses(startAddress, endAddress) {
    const start = decodeAddress(startAddress);
    const end = decodeAddress(endAddress);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const output = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        output.push(encodeColumn(col) + String(row + 1));
      }
    }
    return output;
  }

  function Parser(input) {
    this.input = input;
    this.index = 0;
  }

  Parser.prototype.parse = function () {
    const expression = this.parseComparison();
    this.skipWhitespace();
    if (this.index !== this.input.length) throw spreadsheetError(ERROR_GENERIC);
    return expression;
  };

  Parser.prototype.parseComparison = function () {
    let left = this.parseConcat();
    while (true) {
      this.skipWhitespace();
      const operator = this.matchAny(['<>', '<=', '>=', '=', '<', '>']);
      if (!operator) return left;
      const right = this.parseConcat();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
  };

  Parser.prototype.parseConcat = function () {
    let left = this.parseAdditive();
    while (true) {
      this.skipWhitespace();
      if (!this.consume('&')) return left;
      const right = this.parseAdditive();
      left = { type: 'binary', operator: '&', left: left, right: right };
    }
  };

  Parser.prototype.parseAdditive = function () {
    let left = this.parseMultiplicative();
    while (true) {
      this.skipWhitespace();
      const operator = this.matchAny(['+', '-']);
      if (!operator) return left;
      const right = this.parseMultiplicative();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
  };

  Parser.prototype.parseMultiplicative = function () {
    let left = this.parseUnary();
    while (true) {
      this.skipWhitespace();
      const operator = this.matchAny(['*', '/']);
      if (!operator) return left;
      const right = this.parseUnary();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
  };

  Parser.prototype.parseUnary = function () {
    this.skipWhitespace();
    if (this.consume('-')) {
      return { type: 'unary', operator: '-', value: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    this.skipWhitespace();
    if (this.consume('(')) {
      const expression = this.parseComparison();
      this.expect(')');
      return expression;
    }

    if (this.peek() === '"') {
      return { type: 'string', value: this.parseString() };
    }

    const number = this.parseNumber();
    if (number !== null) return { type: 'number', value: number };

    const identifier = this.parseIdentifier();
    if (!identifier) throw spreadsheetError(ERROR_GENERIC);
    const upperIdentifier = identifier.toUpperCase();

    if (upperIdentifier === 'TRUE' || upperIdentifier === 'FALSE') {
      return { type: 'boolean', value: upperIdentifier === 'TRUE' };
    }

    this.skipWhitespace();
    if (this.consume('(')) {
      const args = [];
      this.skipWhitespace();
      if (!this.consume(')')) {
        while (true) {
          args.push(this.parseComparison());
          this.skipWhitespace();
          if (this.consume(')')) break;
          this.expect(',');
        }
      }
      return { type: 'call', name: upperIdentifier, args: args };
    }

    if (/^\$?[A-Z]+\$?\d+$/.test(upperIdentifier)) {
      this.skipWhitespace();
      if (this.consume(':')) {
        const end = this.parseIdentifier();
        if (!end || !/^\$?[A-Z]+\$?\d+$/.test(end.toUpperCase())) throw spreadsheetError(ERROR_GENERIC);
        return { type: 'range', start: stripAbsolute(upperIdentifier), end: stripAbsolute(end.toUpperCase()) };
      }
      return { type: 'reference', address: stripAbsolute(upperIdentifier) };
    }

    throw spreadsheetError(ERROR_GENERIC);
  };

  Parser.prototype.parseString = function () {
    this.expect('"');
    let output = '';
    while (this.index < this.input.length && this.peek() !== '"') {
      output += this.input[this.index];
      this.index += 1;
    }
    this.expect('"');
    return output;
  };

  Parser.prototype.parseNumber = function () {
    const match = /^\d+(?:\.\d+)?/.exec(this.input.slice(this.index));
    if (!match) return null;
    this.index += match[0].length;
    return Number(match[0]);
  };

  Parser.prototype.parseIdentifier = function () {
    const match = /^\$?[A-Za-z]+\$?\d+|^[A-Za-z_][A-Za-z0-9_]*/.exec(this.input.slice(this.index));
    if (!match) return null;
    this.index += match[0].length;
    return match[0];
  };

  Parser.prototype.skipWhitespace = function () {
    while (this.index < this.input.length && /\s/.test(this.input[this.index])) {
      this.index += 1;
    }
  };

  Parser.prototype.peek = function () {
    return this.input[this.index];
  };

  Parser.prototype.consume = function (value) {
    if (this.input.slice(this.index, this.index + value.length) === value) {
      this.index += value.length;
      return true;
    }
    return false;
  };

  Parser.prototype.expect = function (value) {
    if (!this.consume(value)) throw spreadsheetError(ERROR_GENERIC);
  };

  Parser.prototype.matchAny = function (operators) {
    for (let index = 0; index < operators.length; index += 1) {
      if (this.consume(operators[index])) return operators[index];
    }
    return null;
  };

  function stripAbsolute(address) {
    return address.replace(/\$/g, '');
  }

  return {
    createEngine: createEngine,
    encodeColumn: encodeColumn,
    decodeAddress: decodeAddress,
  };
});
