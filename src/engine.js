(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CIRCULAR = { type: 'error', code: '#CIRC!' };

  function createEmptySheet(initialCells) {
    return {
      cells: Object.assign({}, initialCells || {}),
    };
  }

  function setCell(sheet, address, raw) {
    const value = raw == null ? '' : String(raw);
    if (value === '') {
      delete sheet.cells[address];
      return;
    }
    sheet.cells[address] = value;
  }

  function getCellRaw(sheet, address) {
    return sheet.cells[address] || '';
  }

  function getCellValue(sheet, address) {
    const result = evaluateCell(sheet, address, []);
    if (result && result.type === 'error') {
      return result.code;
    }
    return result;
  }

  function getDisplayValue(sheet, address) {
    const value = getCellValue(sheet, address);
    if (value == null) {
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

  function evaluateCell(sheet, address, stack) {
    if (stack.indexOf(address) !== -1) {
      return CIRCULAR;
    }

    const raw = getCellRaw(sheet, address);
    if (!raw) {
      return '';
    }

    if (raw.charAt(0) !== '=') {
      return parseLiteral(raw);
    }

    try {
      const parser = new Parser(tokenize(raw.slice(1)));
      const ast = parser.parseExpression();
      parser.expectEnd();
      return evaluateAst(ast, sheet, stack.concat(address));
    } catch (error) {
      return error && error.type === 'error' ? error : { type: 'error', code: '#ERR!' };
    }
  }

  function parseLiteral(raw) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return '';
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (trimmed.toUpperCase() === 'TRUE') {
      return true;
    }
    if (trimmed.toUpperCase() === 'FALSE') {
      return false;
    }
    return raw;
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const char = source.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      const two = source.slice(index, index + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two });
        index += 2;
        continue;
      }
      if ('+-*/&=<>():,'.indexOf(char) !== -1) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? char : 'op', value: char });
        index += 1;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < source.length && source.charAt(end) !== '"') {
          value += source.charAt(end);
          end += 1;
        }
        if (source.charAt(end) !== '"') {
          throw { type: 'error', code: '#ERR!' };
        }
        tokens.push({ type: 'string', value: value });
        index = end + 1;
        continue;
      }
      const numberMatch = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const identifierMatch = source.slice(index).match(/^\$?[A-Za-z]+\$?\d+|^[A-Za-z_]+/);
      if (identifierMatch) {
        const value = identifierMatch[0];
        if (/^\$?[A-Za-z]+\$?\d+$/.test(value)) {
          tokens.push({ type: 'ref', value: value.toUpperCase() });
        } else {
          tokens.push({ type: 'ident', value: value.toUpperCase() });
        }
        index += value.length;
        continue;
      }
      throw { type: 'error', code: '#ERR!' };
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

  Parser.prototype.consume = function () {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  };

  Parser.prototype.expectEnd = function () {
    if (this.peek()) {
      throw { type: 'error', code: '#ERR!' };
    }
  };

  Parser.prototype.parseExpression = function () {
    return this.parseComparison();
  };

  Parser.prototype.parseComparison = function () {
    let left = this.parseConcat();
    while (this.peek() && this.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.peek().value) !== -1) {
      const operator = this.consume().value;
      left = { type: 'binary', operator: operator, left: left, right: this.parseConcat() };
    }
    return left;
  };

  Parser.prototype.parseConcat = function () {
    let left = this.parseAdditive();
    while (this.peek() && this.peek().type === 'op' && this.peek().value === '&') {
      this.consume();
      left = { type: 'binary', operator: '&', left: left, right: this.parseAdditive() };
    }
    return left;
  };

  Parser.prototype.parseAdditive = function () {
    let left = this.parseMultiplicative();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const operator = this.consume().value;
      left = { type: 'binary', operator: operator, left: left, right: this.parseMultiplicative() };
    }
    return left;
  };

  Parser.prototype.parseMultiplicative = function () {
    let left = this.parseUnary();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const operator = this.consume().value;
      left = { type: 'binary', operator: operator, left: left, right: this.parseUnary() };
    }
    return left;
  };

  Parser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'op' && this.peek().value === '-') {
      this.consume();
      return { type: 'unary', operator: '-', value: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    const token = this.peek();
    if (!token) {
      throw { type: 'error', code: '#ERR!' };
    }
    if (token.type === 'number') {
      this.consume();
      return { type: 'number', value: token.value };
    }
    if (token.type === 'string') {
      this.consume();
      return { type: 'string', value: token.value };
    }
    if (token.type === 'ref') {
      this.consume();
      if (this.peek() && this.peek().type === ':') {
        this.consume();
        const end = this.consume();
        if (!end || end.type !== 'ref') {
          throw { type: 'error', code: '#ERR!' };
        }
        return { type: 'range', start: token.value, end: end.value };
      }
      return { type: 'ref', value: token.value };
    }
    if (token.type === 'ident') {
      this.consume();
      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'boolean', value: token.value === 'TRUE' };
      }
      if (!this.peek() || this.peek().type !== '(') {
        throw { type: 'error', code: '#ERR!' };
      }
      this.consume();
      const args = [];
      if (!this.peek() || this.peek().type !== ')') {
        do {
          args.push(this.parseExpression());
          if (!this.peek() || this.peek().type !== ',') {
            break;
          }
          this.consume();
        } while (true);
      }
      if (!this.peek() || this.peek().type !== ')') {
        throw { type: 'error', code: '#ERR!' };
      }
      this.consume();
      return { type: 'call', name: token.value, args: args };
    }
    if (token.type === '(') {
      this.consume();
      const expression = this.parseExpression();
      if (!this.peek() || this.peek().type !== ')') {
        throw { type: 'error', code: '#ERR!' };
      }
      this.consume();
      return expression;
    }
    throw { type: 'error', code: '#ERR!' };
  };

  function evaluateAst(node, sheet, stack) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'ref':
        return evaluateCell(sheet, normalizeAddress(node.value), stack);
      case 'range':
        return expandRange(node.start, node.end).map(function (address) {
          return evaluateCell(sheet, address, stack);
        });
      case 'unary':
        return -toNumber(evaluateAst(node.value, sheet, stack));
      case 'binary':
        return evaluateBinary(node, sheet, stack);
      case 'call':
        return evaluateCall(node, sheet, stack);
      default:
        throw { type: 'error', code: '#ERR!' };
    }
  }

  function evaluateBinary(node, sheet, stack) {
    const left = evaluateAst(node.left, sheet, stack);
    const right = evaluateAst(node.right, sheet, stack);
    if (isError(left)) {
      return left;
    }
    if (isError(right)) {
      return right;
    }
    switch (node.operator) {
      case '+': return toNumber(left) + toNumber(right);
      case '-': return toNumber(left) - toNumber(right);
      case '*': return toNumber(left) * toNumber(right);
      case '/':
        if (toNumber(right) === 0) {
          return { type: 'error', code: '#DIV/0!' };
        }
        return toNumber(left) / toNumber(right);
      case '&': return toText(left) + toText(right);
      case '=': return compareValues(left, right) === 0;
      case '<>': return compareValues(left, right) !== 0;
      case '<': return compareValues(left, right) < 0;
      case '<=': return compareValues(left, right) <= 0;
      case '>': return compareValues(left, right) > 0;
      case '>=': return compareValues(left, right) >= 0;
      default:
        throw { type: 'error', code: '#ERR!' };
    }
  }

  function evaluateCall(node, sheet, stack) {
    const evaluatedArgs = node.args.map(function (arg) {
      return evaluateAst(arg, sheet, stack);
    });
    for (let i = 0; i < evaluatedArgs.length; i += 1) {
      if (isError(evaluatedArgs[i])) {
        return evaluatedArgs[i];
      }
    }
    switch (node.name) {
      case 'SUM':
        return flattenValues(evaluatedArgs).reduce(function (total, value) {
          return total + toNumber(value);
        }, 0);
      case 'AVERAGE': {
        const averageValues = flattenValues(evaluatedArgs);
        return averageValues.length ? averageValues.reduce(function (total, value) {
          return total + toNumber(value);
        }, 0) / averageValues.length : 0;
      }
      case 'MIN':
        return Math.min.apply(Math, flattenValues(evaluatedArgs).map(toNumber));
      case 'MAX':
        return Math.max.apply(Math, flattenValues(evaluatedArgs).map(toNumber));
      case 'COUNT':
        return flattenValues(evaluatedArgs).filter(function (value) { return value !== ''; }).length;
      case 'IF':
        return evaluatedArgs[0] ? evaluatedArgs[1] : evaluatedArgs[2];
      case 'AND':
        return flattenValues(evaluatedArgs).every(Boolean);
      case 'OR':
        return flattenValues(evaluatedArgs).some(Boolean);
      case 'NOT':
        return !evaluatedArgs[0];
      case 'ABS':
        return Math.abs(toNumber(evaluatedArgs[0]));
      case 'ROUND':
        return Math.round(toNumber(evaluatedArgs[0]));
      case 'CONCAT':
        return flattenValues(evaluatedArgs).map(toText).join('');
      default:
        return { type: 'error', code: '#ERR!' };
    }
  }

  function flattenValues(values) {
    return values.reduce(function (all, value) {
      if (Array.isArray(value)) {
        return all.concat(flattenValues(value));
      }
      all.push(value);
      return all;
    }, []);
  }

  function isError(value) {
    return value && typeof value === 'object' && value.type === 'error';
  }

  function toNumber(value) {
    if (value === '' || value == null) {
      return 0;
    }
    if (value === true) {
      return 1;
    }
    if (value === false) {
      return 0;
    }
    const result = Number(value);
    if (Number.isNaN(result)) {
      throw { type: 'error', code: '#ERR!' };
    }
    return result;
  }

  function toText(value) {
    if (value == null) {
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

  function compareValues(left, right) {
    if (typeof left === 'number' || typeof right === 'number') {
      return toNumber(left) - toNumber(right);
    }
    const leftText = toText(left);
    const rightText = toText(right);
    if (leftText === rightText) {
      return 0;
    }
    return leftText < rightText ? -1 : 1;
  }

  function normalizeAddress(address) {
    return address.replace(/\$/g, '').toUpperCase();
  }

  function shiftFormulaReferences(raw, rowOffset, columnOffset) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }

    return '=' + raw.slice(1).replace(/\$?[A-Z]+\$?\d+/g, function (reference) {
      const match = reference.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
      const nextColumn = match[1] ? columnToNumber(match[2]) : columnToNumber(match[2]) + columnOffset;
      const nextRow = match[3] ? Number(match[4]) : Number(match[4]) + rowOffset;
      return (match[1] ? '$' : '') + numberToColumn(Math.max(1, nextColumn)) + (match[3] ? '$' : '') + String(Math.max(1, nextRow));
    });
  }

  function parseAddress(address) {
    const normalized = normalizeAddress(address);
    const match = normalized.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw { type: 'error', code: '#REF!' };
    }
    return {
      column: columnToNumber(match[1]),
      row: Number(match[2]),
    };
  }

  function stepAddress(address, direction, maxColumns, maxRows) {
    const parsed = parseAddress(address);
    let column = parsed.column;
    let row = parsed.row;

    if (direction === 'left') {
      column = Math.max(1, column - 1);
    } else if (direction === 'right') {
      column = Math.min(maxColumns, column + 1);
    } else if (direction === 'up') {
      row = Math.max(1, row - 1);
    } else if (direction === 'down') {
      row = Math.min(maxRows, row + 1);
    }

    return numberToColumn(column) + row;
  }

  function columnToNumber(label) {
    let total = 0;
    for (let index = 0; index < label.length; index += 1) {
      total = total * 26 + (label.charCodeAt(index) - 64);
    }
    return total;
  }

  function numberToColumn(number) {
    let result = '';
    let current = number;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      current = Math.floor((current - 1) / 26);
    }
    return result;
  }

  function expandRange(start, end) {
    const startRef = parseAddress(start);
    const endRef = parseAddress(end);
    const minColumn = Math.min(startRef.column, endRef.column);
    const maxColumn = Math.max(startRef.column, endRef.column);
    const minRow = Math.min(startRef.row, endRef.row);
    const maxRow = Math.max(startRef.row, endRef.row);
    const addresses = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        addresses.push(numberToColumn(column) + row);
      }
    }
    return addresses;
  }

  return {
    createEmptySheet: createEmptySheet,
    setCell: setCell,
    getCellRaw: getCellRaw,
    getCellValue: getCellValue,
    getDisplayValue: getDisplayValue,
    normalizeAddress: normalizeAddress,
    shiftFormulaReferences: shiftFormulaReferences,
    stepAddress: stepAddress,
  };
});
