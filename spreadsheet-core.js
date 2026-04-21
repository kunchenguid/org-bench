(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DIV_ZERO = '#DIV/0!';
  const ERROR = '#ERR!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';
  const EMPTY = { type: 'empty' };

  function evaluateSheet(rawCells) {
    const normalized = {};
    const cache = {};
    const stack = new Set();
    const values = {};

    Object.keys(rawCells || {}).forEach(function (key) {
      normalized[key.toUpperCase()] = rawCells[key];
    });

    Object.keys(normalized).forEach(function (ref) {
      values[ref] = evaluateCell(ref);
    });

    return { values: values };

    function evaluateCell(ref) {
      if (cache[ref]) {
        return cache[ref];
      }

      if (stack.has(ref)) {
        return { raw: normalized[ref] || '', value: { error: CIRC }, display: CIRC };
      }

      stack.add(ref);
      let result;

      try {
        result = evaluateRaw(normalized[ref]);
      } catch (error) {
        result = { raw: normalized[ref] || '', value: { error: error.code || ERROR }, display: error.code || ERROR };
      }

      stack.delete(ref);
      cache[ref] = result;
      return result;
    }

    function evaluateRaw(raw) {
      const text = raw == null ? '' : String(raw);
      if (!text.startsWith('=')) {
        if (text.trim() === '') {
          return { raw: text, value: '', display: '' };
        }
        const numeric = Number(text);
        if (!Number.isNaN(numeric)) {
          return { raw: text, value: numeric, display: formatScalar(numeric) };
        }
        return { raw: text, value: text, display: text };
      }

      const ast = new Parser(text.slice(1)).parse();
      const computed = evalNode(ast);
      const display = formatFormulaValue(computed);
      return { raw: text, value: computed, display: display };
    }

    function evalNode(node) {
      switch (node.type) {
        case 'number':
          return node.value;
        case 'string':
          return node.value;
        case 'boolean':
          return node.value;
        case 'unary':
          if (node.operator === '-') {
            return -toNumber(evalNode(node.argument));
          }
          throw makeError(ERROR);
        case 'binary':
          return evalBinary(node);
        case 'cell':
          return getCellValue(node.ref);
        case 'range':
          return expandRange(node.start, node.end);
        case 'call':
          return callFunction(node.name, node.args.map(evalNode));
        default:
          throw makeError(ERROR);
      }
    }

    function evalBinary(node) {
      const left = evalNode(node.left);
      const right = evalNode(node.right);
      switch (node.operator) {
        case '+':
          return toNumber(left) + toNumber(right);
        case '-':
          return toNumber(left) - toNumber(right);
        case '*':
          return toNumber(left) * toNumber(right);
        case '/':
          if (toNumber(right) === 0) {
            throw makeError(DIV_ZERO);
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
          throw makeError(ERROR);
      }
    }

    function getCellValue(ref) {
      const normalizedRef = ref.toUpperCase().replace(/\$/g, '');
      const raw = normalized[normalizedRef];
      if (raw == null || raw === '') {
        return EMPTY;
      }
      const result = evaluateCell(normalizedRef);
      if (result.value && result.value.error) {
        throw makeError(result.value.error);
      }
      return result.value;
    }

    function expandRange(start, end) {
      const startPos = parseCellRef(start);
      const endPos = parseCellRef(end);
      if (!startPos || !endPos) {
        throw makeError(REF);
      }
      const cells = [];
      const rowStart = Math.min(startPos.row, endPos.row);
      const rowEnd = Math.max(startPos.row, endPos.row);
      const colStart = Math.min(startPos.col, endPos.col);
      const colEnd = Math.max(startPos.col, endPos.col);
      for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) {
          cells.push(getCellValue(toCellRef(row, col)));
        }
      }
      return cells;
    }
  }

  function callFunction(name, args) {
    const flat = flattenArgs(args);
    switch (name) {
      case 'SUM':
        return flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0);
      case 'AVERAGE':
        return flat.length ? callFunction('SUM', args) / flat.length : 0;
      case 'MIN':
        return flat.length ? Math.min.apply(Math, flat.map(toNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max.apply(Math, flat.map(toNumber)) : 0;
      case 'COUNT':
        return flat.filter(function (value) {
          return value !== EMPTY && toText(value) !== '';
        }).length;
      case 'IF':
        return toBoolean(args[0]) ? (args[1] === undefined ? true : args[1]) : (args[2] === undefined ? false : args[2]);
      case 'AND':
        return flat.every(toBoolean);
      case 'OR':
        return flat.some(toBoolean);
      case 'NOT':
        return !toBoolean(args[0]);
      case 'ABS':
        return Math.abs(toNumber(args[0]));
      case 'ROUND': {
        const digits = args[1] == null ? 0 : toNumber(args[1]);
        const factor = Math.pow(10, digits);
        return Math.round(toNumber(args[0]) * factor) / factor;
      }
      case 'CONCAT':
        return flat.map(toText).join('');
      default:
        throw makeError(ERROR);
    }
  }

  function flattenArgs(args) {
    const output = [];
    (args || []).forEach(function (value) {
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          output.push(item);
        });
      } else {
        output.push(value);
      }
    });
    return output;
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    if (!formula || formula.charAt(0) !== '=') {
      return formula;
    }
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)(?::(\$?)([A-Z]+)(\$?)(\d+))?/g, function (_, cAbs1, col1, rAbs1, row1, cAbs2, col2, rAbs2, row2) {
      let shifted = shiftSingle(cAbs1, col1, rAbs1, row1, rowOffset, colOffset);
      if (col2) {
        shifted += ':' + shiftSingle(cAbs2, col2, rAbs2, row2, rowOffset, colOffset);
      }
      return shifted;
    });
  }

  function rewriteFormulaForStructuralChange(formula, change) {
    if (!formula || formula.charAt(0) !== '=' || !change) {
      return formula;
    }
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)(?::(\$?)([A-Z]+)(\$?)(\d+))?/g, function (_, cAbs1, col1, rAbs1, row1, cAbs2, col2, rAbs2, row2) {
      const first = rewriteReference(cAbs1, col1, rAbs1, row1, change);
      if (first === '#REF!') {
        return '#REF!';
      }
      if (!col2) {
        return first;
      }
      const second = rewriteReference(cAbs2, col2, rAbs2, row2, change);
      if (second === '#REF!') {
        return '#REF!';
      }
      return first + ':' + second;
    });
  }

  function rewriteReference(colAbs, colLetters, rowAbs, rowDigits, change) {
    const parsed = parseCellRef(colLetters + rowDigits);
    let col = parsed.col;
    let row = parsed.row;
    if (change.type === 'insert-row' && !rowAbs && row >= change.index) {
      row += change.count;
    }
    if (change.type === 'insert-col' && !colAbs && col >= change.index) {
      col += change.count;
    }
    if (change.type === 'delete-row' && !rowAbs) {
      if (row >= change.index && row < change.index + change.count) {
        return '#REF!';
      }
      if (row >= change.index + change.count) {
        row -= change.count;
      }
    }
    if (change.type === 'delete-col' && !colAbs) {
      if (col >= change.index && col < change.index + change.count) {
        return '#REF!';
      }
      if (col >= change.index + change.count) {
        col -= change.count;
      }
    }
    return (colAbs ? '$' : '') + columnToLetters(col) + (rowAbs ? '$' : '') + String(row + 1);
  }

  function shiftSingle(colAbs, colLetters, rowAbs, rowDigits, rowOffset, colOffset) {
    const parsed = parseCellRef(colLetters + rowDigits);
    const nextCol = colAbs ? parsed.col : parsed.col + colOffset;
    const nextRow = rowAbs ? parsed.row : parsed.row + rowOffset;
    return (colAbs ? '$' : '') + columnToLetters(Math.max(0, nextCol)) + (rowAbs ? '$' : '') + String(Math.max(1, nextRow + 1));
  }

  function compareValues(left, right) {
    if (typeof left === 'string' || typeof right === 'string') {
      return toText(left).localeCompare(toText(right));
    }
    if (typeof left === 'boolean' || typeof right === 'boolean') {
      return Number(toBoolean(left)) - Number(toBoolean(right));
    }
    return toNumber(left) - toNumber(right);
  }

  function toNumber(value) {
    if (value === EMPTY || value == null || value === '') {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return 0;
    }
    return numeric;
  }

  function toText(value) {
    if (value === EMPTY || value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return formatScalar(value);
    }
    return String(value);
  }

  function toBoolean(value) {
    if (value === EMPTY || value == null || value === '') {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      return value.toUpperCase() === 'TRUE' || value !== '';
    }
    return Boolean(value);
  }

  function formatScalar(value) {
    if (typeof value !== 'number') {
      return String(value);
    }
    if (Number.isInteger(value)) {
      return String(value);
    }
    return String(Number(value.toFixed(10)));
  }

  function formatFormulaValue(value) {
    if (value === EMPTY || value === '') {
      return '0';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return formatScalar(value);
    }
    return String(value);
  }

  function makeError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function parseCellRef(ref) {
    const match = String(ref || '').replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return null;
    }
    return { col: lettersToColumn(match[1]), row: Number(match[2]) - 1 };
  }

  function toCellRef(row, col) {
    return columnToLetters(col) + String(row + 1);
  }

  function lettersToColumn(letters) {
    let value = 0;
    for (let index = 0; index < letters.length; index += 1) {
      value = value * 26 + (letters.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function columnToLetters(index) {
    let value = index + 1;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - 1) / 26);
    }
    return letters;
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const rest = source.slice(index);
      const whitespace = rest.match(/^\s+/);
      if (whitespace) {
        index += whitespace[0].length;
        continue;
      }
      const string = rest.match(/^"([^"]*)"/);
      if (string) {
        tokens.push({ type: 'string', value: string[1] });
        index += string[0].length;
        continue;
      }
      const operator = rest.match(/^(<>|<=|>=|[=<>+\-*\/&(),:])/);
      if (operator) {
        tokens.push({ type: operator[1], value: operator[1] });
        index += operator[1].length;
        continue;
      }
      const number = rest.match(/^\d+(?:\.\d+)?/);
      if (number) {
        tokens.push({ type: 'number', value: Number(number[0]) });
        index += number[0].length;
        continue;
      }
      const identifier = rest.match(/^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/i);
      if (identifier) {
        tokens.push({ type: 'identifier', value: identifier[0].toUpperCase() });
        index += identifier[0].length;
        continue;
      }
      throw makeError(ERROR);
    }
    return tokens;
  }

  function Parser(source) {
    this.tokens = tokenize(source);
    this.index = 0;
  }

  Parser.prototype.parse = function () {
    const value = this.parseComparison();
    if (this.peek()) {
      throw makeError(ERROR);
    }
    return value;
  };

  Parser.prototype.parseComparison = function () {
    let left = this.parseConcat();
    while (this.peekType('=', '<>', '<', '<=', '>', '>=')) {
      const operator = this.consume().type;
      const right = this.parseConcat();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseConcat = function () {
    let left = this.parseAdditive();
    while (this.peekType('&')) {
      const operator = this.consume().type;
      const right = this.parseAdditive();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseAdditive = function () {
    let left = this.parseMultiplicative();
    while (this.peekType('+', '-')) {
      const operator = this.consume().type;
      const right = this.parseMultiplicative();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseMultiplicative = function () {
    let left = this.parseUnary();
    while (this.peekType('*', '/')) {
      const operator = this.consume().type;
      const right = this.parseUnary();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseUnary = function () {
    if (this.peekType('-')) {
      this.consume();
      return { type: 'unary', operator: '-', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    const token = this.peek();
    if (!token) {
      throw makeError(ERROR);
    }
    if (token.type === 'number') {
      this.consume();
      return { type: 'number', value: token.value };
    }
    if (token.type === 'string') {
      this.consume();
      return { type: 'string', value: token.value };
    }
    if (token.type === 'identifier') {
      this.consume();
      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'boolean', value: token.value === 'TRUE' };
      }
      if (this.peekType('(')) {
        this.consume();
        const args = [];
        if (!this.peekType(')')) {
          do {
            args.push(this.parseComparison());
          } while (this.peekType(',') && this.consume());
        }
        this.expect(')');
        return { type: 'call', name: token.value, args: args };
      }
      if (this.peekType(':')) {
        this.consume();
        const end = this.expect('identifier').value;
        return { type: 'range', start: token.value, end: end };
      }
      if (/^\$?[A-Z]+\$?\d+$/.test(token.value)) {
        return { type: 'cell', ref: token.value };
      }
      throw makeError(ERROR);
    }
    if (token.type === '(') {
      this.consume();
      const value = this.parseComparison();
      this.expect(')');
      return value;
    }
    throw makeError(ERROR);
  };

  Parser.prototype.peek = function () {
    return this.tokens[this.index];
  };

  Parser.prototype.peekType = function () {
    const token = this.peek();
    if (!token) {
      return false;
    }
    return Array.prototype.includes.call(arguments, token.type);
  };

  Parser.prototype.consume = function () {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  };

  Parser.prototype.expect = function (type) {
    if (!this.peekType(type)) {
      throw makeError(ERROR);
    }
    return this.consume();
  };

  return {
    evaluateSheet: evaluateSheet,
    shiftFormula: shiftFormula,
    rewriteFormulaForStructuralChange: rewriteFormulaForStructuralChange,
    parseCellRef: parseCellRef,
    toCellRef: toCellRef,
    columnToLetters: columnToLetters,
  };
});
