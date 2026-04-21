(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.FormulaEngine = factory().FormulaEngine;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const PRECEDENCE = {
    ':': 5,
    '*': 4,
    '/': 4,
    '+': 3,
    '-': 3,
    '&': 2,
    '=': 1,
    '<>': 1,
    '<': 1,
    '<=': 1,
    '>': 1,
    '>=': 1,
  };

  const ERROR = {
    generic: '#ERR!',
    divideByZero: '#DIV/0!',
    circular: '#CIRC!',
    name: '#NAME?',
    ref: '#REF!',
  };

  function FormulaFailure(code) {
    this.code = code;
  }

  function isFailure(value) {
    return value instanceof FormulaFailure;
  }

  function fail(code) {
    throw new FormulaFailure(code);
  }

  function FormulaEngine(options) {
    this.getCell = options && typeof options.getCell === 'function' ? options.getCell : function () { return ''; };
    this.cache = new Map();
  }

  FormulaEngine.prototype.evaluateCell = function (address) {
    return this._evaluateCell(normalizeAddress(address), []);
  };

  FormulaEngine.prototype.getDependencies = function (address) {
    const raw = normalizeRaw(this.getCell(normalizeAddress(address)));
    if (!raw || raw.charAt(0) !== '=') {
      return [];
    }

    try {
      const parser = new Parser(raw.slice(1));
      const ast = parser.parseExpression(0);
      parser.expect('eof');
      return Array.from(collectDependencies(ast, new Set())).sort();
    } catch (error) {
      return [];
    }
  };

  FormulaEngine.prototype._evaluateCell = function (address, stack) {
    if (!address) {
      return makeResult('', null);
    }

    if (stack.indexOf(address) !== -1) {
      return makeResult('', ERROR.circular, this.getCell(address));
    }

    const cacheKey = address;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const raw = normalizeRaw(this.getCell(address));
    let result;

    if (!raw) {
      result = makeResult('', null, raw);
    } else if (raw.charAt(0) !== '=') {
      result = makeResult(parseLiteral(raw), null, raw);
    } else {
      try {
        const parser = new Parser(raw.slice(1));
        const ast = parser.parseExpression(0);
        parser.expect('eof');
        const value = this._evaluateNode(ast, stack.concat(address));
        result = makeResult(value, null, raw);
      } catch (error) {
        if (isFailure(error)) {
          result = makeResult('', error.code, raw);
        } else {
          result = makeResult('', ERROR.generic, raw);
        }
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  };

  FormulaEngine.prototype._evaluateNode = function (node, stack) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'unary':
        return -toNumber(this._evaluateNode(node.argument, stack));
      case 'binary':
        return this._evaluateBinary(node, stack);
      case 'cell':
        return this._getCellValue(node.address, stack);
      case 'range':
        return expandRange(node.start, node.end).map((address) => this._getCellValue(address, stack));
      case 'call':
        return this._evaluateCall(node, stack);
      default:
        fail(ERROR.generic);
    }
  };

  FormulaEngine.prototype._evaluateBinary = function (node, stack) {
    const left = this._evaluateNode(node.left, stack);
    const right = this._evaluateNode(node.right, stack);

    switch (node.operator) {
      case '+':
        return toNumber(left) + toNumber(right);
      case '-':
        return toNumber(left) - toNumber(right);
      case '*':
        return toNumber(left) * toNumber(right);
      case '/':
        if (toNumber(right) === 0) {
          fail(ERROR.divideByZero);
        }
        return toNumber(left) / toNumber(right);
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
        fail(ERROR.generic);
    }
  };

  FormulaEngine.prototype._evaluateCall = function (node, stack) {
    const name = node.name;
    const args = node.args.map((arg) => this._evaluateNode(arg, stack));
    const flat = flattenArgs(args);

    switch (name) {
      case 'SUM':
        return flat.reduce((total, value) => total + toNumber(value), 0);
      case 'AVERAGE':
        return flat.length ? flat.reduce((total, value) => total + toNumber(value), 0) / flat.length : 0;
      case 'MIN':
        return flat.length ? Math.min.apply(null, flat.map(toNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max.apply(null, flat.map(toNumber)) : 0;
      case 'COUNT':
        return flat.filter((value) => value !== '').length;
      case 'IF':
        return truthy(args[0]) ? (args[1] === undefined ? '' : args[1]) : (args[2] === undefined ? '' : args[2]);
      case 'AND':
        return flat.every(truthy);
      case 'OR':
        return flat.some(truthy);
      case 'NOT':
        return !truthy(args[0]);
      case 'ABS':
        return Math.abs(toNumber(args[0]));
      case 'ROUND':
        return roundTo(toNumber(args[0]), args[1] === undefined ? 0 : toNumber(args[1]));
      case 'CONCAT':
        return flat.map(toText).join('');
      default:
        fail(ERROR.name);
    }
  };

  FormulaEngine.prototype._getCellValue = function (address, stack) {
    const result = this._evaluateCell(address, stack);
    if (result.error) {
      fail(result.error);
    }
    return result.value;
  };

  function Parser(source) {
    this.source = source;
    this.index = 0;
    this.current = this.nextToken();
  }

  Parser.prototype.parseExpression = function (minPrecedence) {
    let left = this.parsePrefix();

    while (this.current.type === 'operator' && PRECEDENCE[this.current.value] >= minPrecedence) {
      const operator = this.current.value;
      const precedence = PRECEDENCE[operator];
      this.advance();

      const right = this.parseExpression(precedence + (operator === ':' ? 0 : 1));
      left = operator === ':'
        ? makeRange(left, right)
        : { type: 'binary', operator: operator, left: left, right: right };
    }

    return left;
  };

  Parser.prototype.parsePrefix = function () {
    const token = this.current;

    if (token.type === 'operator' && token.value === '-') {
      this.advance();
      return { type: 'unary', operator: '-', argument: this.parseExpression(6) };
    }

    if (token.type === 'number') {
      this.advance();
      return { type: 'number', value: token.value };
    }

    if (token.type === 'string') {
      this.advance();
      return { type: 'string', value: token.value };
    }

    if (token.type === 'reference') {
      this.advance();
      return { type: 'cell', address: normalizeAddress(token.value) };
    }

    if (token.type === 'identifier') {
      this.advance();
      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'boolean', value: token.value === 'TRUE' };
      }

      if (this.current.type === 'leftParen') {
        this.advance();
        const args = [];
        if (this.current.type !== 'rightParen') {
          do {
            args.push(this.parseExpression(0));
            if (this.current.type !== 'comma') {
              break;
            }
            this.advance();
          } while (true);
        }
        this.expect('rightParen');
        return { type: 'call', name: token.value, args: args };
      }
    }

    if (token.type === 'leftParen') {
      this.advance();
      const expression = this.parseExpression(0);
      this.expect('rightParen');
      return expression;
    }

    fail(ERROR.generic);
  };

  Parser.prototype.expect = function (type) {
    if (this.current.type !== type) {
      fail(ERROR.generic);
    }
    const token = this.current;
    this.advance();
    return token;
  };

  Parser.prototype.advance = function () {
    this.current = this.nextToken();
  };

  Parser.prototype.nextToken = function () {
    const source = this.source;
    while (this.index < source.length && /\s/.test(source.charAt(this.index))) {
      this.index += 1;
    }

    if (this.index >= source.length) {
      return { type: 'eof' };
    }

    const rest = source.slice(this.index);
    const char = rest.charAt(0);
    const two = rest.slice(0, 2);

    if (two === '<=' || two === '>=' || two === '<>') {
      this.index += 2;
      return { type: 'operator', value: two };
    }

    if ('+-*/&=<>:'.indexOf(char) !== -1) {
      this.index += 1;
      return { type: 'operator', value: char };
    }

    if (char === '(') {
      this.index += 1;
      return { type: 'leftParen' };
    }

    if (char === ')') {
      this.index += 1;
      return { type: 'rightParen' };
    }

    if (char === ',') {
      this.index += 1;
      return { type: 'comma' };
    }

    if (char === '"') {
      let value = '';
      this.index += 1;
      while (this.index < source.length && source.charAt(this.index) !== '"') {
        value += source.charAt(this.index);
        this.index += 1;
      }
      if (source.charAt(this.index) !== '"') {
        fail(ERROR.generic);
      }
      this.index += 1;
      return { type: 'string', value: value };
    }

    const referenceMatch = rest.match(/^\$?[A-Z]+\$?[1-9][0-9]*/);
    if (referenceMatch) {
      this.index += referenceMatch[0].length;
      return { type: 'reference', value: referenceMatch[0] };
    }

    const numberMatch = rest.match(/^\d+(?:\.\d+)?/);
    if (numberMatch) {
      this.index += numberMatch[0].length;
      return { type: 'number', value: Number(numberMatch[0]) };
    }

    const identifierMatch = rest.match(/^[A-Z_][A-Z0-9_]*/);
    if (identifierMatch) {
      this.index += identifierMatch[0].length;
      return { type: 'identifier', value: identifierMatch[0] };
    }

    fail(ERROR.generic);
  };

  function makeRange(left, right) {
    if (left.type !== 'cell' || right.type !== 'cell') {
      fail(ERROR.ref);
    }
    return { type: 'range', start: left.address, end: right.address };
  }

  function collectDependencies(node, result) {
    if (!node) {
      return result;
    }

    switch (node.type) {
      case 'cell':
        result.add(node.address);
        return result;
      case 'range':
        expandRange(node.start, node.end).forEach(function (address) {
          result.add(address);
        });
        return result;
      case 'binary':
        collectDependencies(node.left, result);
        collectDependencies(node.right, result);
        return result;
      case 'unary':
        collectDependencies(node.argument, result);
        return result;
      case 'call':
        node.args.forEach(function (arg) {
          collectDependencies(arg, result);
        });
        return result;
      default:
        return result;
    }
  }

  function normalizeAddress(address) {
    return String(address || '').toUpperCase().replace(/\$/g, '');
  }

  function normalizeRaw(raw) {
    return raw == null ? '' : String(raw);
  }

  function parseLiteral(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return '';
    }
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (trimmed === 'TRUE') {
      return true;
    }
    if (trimmed === 'FALSE') {
      return false;
    }
    return raw;
  }

  function makeResult(value, error, raw) {
    return {
      value: error ? '' : value,
      display: error ? error : toDisplay(error ? '' : value),
      raw: raw == null ? '' : raw,
      error: error || null,
    };
  }

  function toDisplay(value) {
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (value === '') {
      return '';
    }
    return String(value);
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return value.reduce((total, item) => total + toNumber(item), 0);
    }
    if (value === '' || value == null) {
      return 0;
    }
    if (value === true) {
      return 1;
    }
    if (value === false) {
      return 0;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.map(toText).join('');
    }
    if (value === '' || value == null) {
      return '';
    }
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    return String(value);
  }

  function truthy(value) {
    if (Array.isArray(value)) {
      return value.some(truthy);
    }
    if (value === '' || value == null) {
      return false;
    }
    return Boolean(value);
  }

  function compareValues(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      if (leftNumber < rightNumber) {
        return -1;
      }
      if (leftNumber > rightNumber) {
        return 1;
      }
      return 0;
    }

    const leftText = toText(left);
    const rightText = toText(right);
    if (leftText < rightText) {
      return -1;
    }
    if (leftText > rightText) {
      return 1;
    }
    return 0;
  }

  function flattenArgs(args) {
    return args.reduce(function (all, value) {
      if (Array.isArray(value)) {
        return all.concat(flattenArgs(value));
      }
      all.push(value);
      return all;
    }, []);
  }

  function roundTo(value, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function expandRange(start, end) {
    const startParts = splitAddress(start);
    const endParts = splitAddress(end);
    const columnStart = Math.min(startParts.column, endParts.column);
    const columnEnd = Math.max(startParts.column, endParts.column);
    const rowStart = Math.min(startParts.row, endParts.row);
    const rowEnd = Math.max(startParts.row, endParts.row);
    const cells = [];

    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let column = columnStart; column <= columnEnd; column += 1) {
        cells.push(toColumnLabel(column) + row);
      }
    }

    return cells;
  }

  function splitAddress(address) {
    const match = normalizeAddress(address).match(/^([A-Z]+)([1-9][0-9]*)$/);
    if (!match) {
      fail(ERROR.ref);
    }
    return {
      column: fromColumnLabel(match[1]),
      row: Number(match[2]),
    };
  }

  function fromColumnLabel(label) {
    let total = 0;
    for (let index = 0; index < label.length; index += 1) {
      total = total * 26 + (label.charCodeAt(index) - 64);
    }
    return total;
  }

  function toColumnLabel(number) {
    let value = number;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  return {
    FormulaEngine: FormulaEngine,
    errors: ERROR,
  };
});
