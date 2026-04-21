(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERR = {
    circular: '#CIRC!',
    div0: '#DIV/0!',
    generic: '#ERR!',
    ref: '#REF!'
  };

  class FormulaError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }

  function columnToIndex(column) {
    let value = 0;
    const letters = column.replace(/\$/g, '').toUpperCase();
    for (let i = 0; i < letters.length; i += 1) {
      value = value * 26 + (letters.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToColumn(index) {
    let value = index + 1;
    let column = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      column = String.fromCharCode(65 + remainder) + column;
      value = Math.floor((value - 1) / 26);
    }
    return column;
  }

  function normalizeRef(ref) {
    const match = String(ref).toUpperCase().match(/^\$?([A-Z]+)\$?(\d+)$/);
    if (!match) {
      throw new FormulaError(ERR.ref);
    }
    return match[1] + match[2];
  }

  function parseRefParts(ref) {
    const match = String(ref).toUpperCase().match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      throw new FormulaError(ERR.ref);
    }
    return {
      colAbs: Boolean(match[1]),
      col: match[2],
      rowAbs: Boolean(match[3]),
      row: Number(match[4])
    };
  }

  function flattenArgs(values) {
    const output = [];
    values.forEach((value) => {
      if (Array.isArray(value)) {
        output.push(...flattenArgs(value));
      } else {
        output.push(value);
      }
    });
    return output;
  }

  function toNumber(value) {
    if (value === null || value === '') {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed;
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
    if (Array.isArray(value)) {
      return value.some(toBoolean);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(toText(value));
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
    }
    return String(value);
  }

  class TokenStream {
    constructor(input) {
      this.tokens = tokenize(input);
      this.index = 0;
    }

    peek() {
      return this.tokens[this.index] || null;
    }

    next() {
      const token = this.peek();
      this.index += 1;
      return token;
    }

    expect(type, value) {
      const token = this.next();
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw new FormulaError(ERR.generic);
      }
      return token;
    }
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;
    while (index < input.length) {
      const char = input[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < input.length && input[end] !== '"') {
          value += input[end];
          end += 1;
        }
        if (input[end] !== '"') {
          throw new FormulaError(ERR.generic);
        }
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      if (/\d|\./.test(char)) {
        const match = input.slice(index).match(/^(\d+(?:\.\d+)?|\.\d+)/);
        if (!match) {
          throw new FormulaError(ERR.generic);
        }
        tokens.push({ type: 'number', value: Number(match[1]) });
        index += match[1].length;
        continue;
      }
      const refMatch = input.slice(index).match(/^\$?[A-Za-z]+\$?\d+/);
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0].toUpperCase() });
        index += refMatch[0].length;
        continue;
      }
      const identMatch = input.slice(index).match(/^[A-Za-z_]+/);
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0].toUpperCase() });
        index += identMatch[0].length;
        continue;
      }
      const twoChar = input.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'op', value: twoChar });
        index += 2;
        continue;
      }
      if ('+-*/(),:&=<>'.includes(char)) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? char : 'op', value: char });
        index += 1;
        continue;
      }
      throw new FormulaError(ERR.generic);
    }
    return tokens;
  }

  function parseFormula(input) {
    const stream = new TokenStream(input);
    const expression = parseComparison(stream);
    if (stream.peek()) {
      throw new FormulaError(ERR.generic);
    }
    return expression;
  }

  function parseComparison(stream) {
    let expr = parseConcat(stream);
    while (stream.peek() && stream.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(stream.peek().value)) {
      const operator = stream.next().value;
      expr = { type: 'binary', operator, left: expr, right: parseConcat(stream) };
    }
    return expr;
  }

  function parseConcat(stream) {
    let expr = parseAdditive(stream);
    while (stream.peek() && stream.peek().type === 'op' && stream.peek().value === '&') {
      stream.next();
      expr = { type: 'binary', operator: '&', left: expr, right: parseAdditive(stream) };
    }
    return expr;
  }

  function parseAdditive(stream) {
    let expr = parseMultiplicative(stream);
    while (stream.peek() && stream.peek().type === 'op' && ['+', '-'].includes(stream.peek().value)) {
      const operator = stream.next().value;
      expr = { type: 'binary', operator, left: expr, right: parseMultiplicative(stream) };
    }
    return expr;
  }

  function parseMultiplicative(stream) {
    let expr = parseUnary(stream);
    while (stream.peek() && stream.peek().type === 'op' && ['*', '/'].includes(stream.peek().value)) {
      const operator = stream.next().value;
      expr = { type: 'binary', operator, left: expr, right: parseUnary(stream) };
    }
    return expr;
  }

  function parseUnary(stream) {
    if (stream.peek() && stream.peek().type === 'op' && stream.peek().value === '-') {
      stream.next();
      return { type: 'unary', operator: '-', argument: parseUnary(stream) };
    }
    return parsePrimary(stream);
  }

  function parsePrimary(stream) {
    const token = stream.peek();
    if (!token) {
      throw new FormulaError(ERR.generic);
    }
    if (token.type === 'number') {
      stream.next();
      return { type: 'literal', value: token.value };
    }
    if (token.type === 'string') {
      stream.next();
      return { type: 'literal', value: token.value };
    }
    if (token.type === 'ident' && ['TRUE', 'FALSE'].includes(token.value)) {
      stream.next();
      return { type: 'literal', value: token.value === 'TRUE' };
    }
    if (token.type === '(') {
      stream.next();
      const expr = parseComparison(stream);
      stream.expect(')');
      return expr;
    }
    if (token.type === 'ident') {
      const ident = stream.next().value;
      stream.expect('(');
      const args = [];
      if (!stream.peek() || stream.peek().type !== ')') {
        while (true) {
          args.push(parseComparison(stream));
          if (!stream.peek() || stream.peek().type !== ',') {
            break;
          }
          stream.next();
        }
      }
      stream.expect(')');
      return { type: 'call', name: ident, args };
    }
    if (token.type === 'ref') {
      const start = stream.next().value;
      if (stream.peek() && stream.peek().type === ':') {
        stream.next();
        const end = stream.expect('ref').value;
        return { type: 'range', start, end };
      }
      return { type: 'ref', ref: start };
    }
    throw new FormulaError(ERR.generic);
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    return formula.replace(/\$?[A-Za-z]+\$?\d+/g, (match) => {
      const parts = parseRefParts(match);
      const nextCol = parts.colAbs ? columnToIndex(parts.col) : columnToIndex(parts.col) + colOffset;
      const nextRow = parts.rowAbs ? parts.row : parts.row + rowOffset;
      return `${parts.colAbs ? '$' : ''}${indexToColumn(Math.max(0, nextCol))}${parts.rowAbs ? '$' : ''}${Math.max(1, nextRow)}`;
    });
  }

  class SpreadsheetModel {
    constructor(snapshot) {
      const state = snapshot || {};
      this.cells = new Map(Object.entries(state.cells || {}));
    }

    setCell(ref, raw) {
      const normalized = normalizeRef(ref);
      const value = raw == null ? '' : String(raw);
      if (value === '') {
        this.cells.delete(normalized);
        return;
      }
      this.cells.set(normalized, value);
    }

    getRaw(ref) {
      return this.cells.get(normalizeRef(ref)) || '';
    }

    getValue(ref) {
      return this.evaluateCell(normalizeRef(ref), new Set());
    }

    getDisplay(ref) {
      try {
        const value = this.getValue(ref);
        return displayValue(value);
      } catch (error) {
        if (error instanceof FormulaError) {
          return error.code;
        }
        return ERR.generic;
      }
    }

    evaluateCell(ref, stack) {
      const normalized = normalizeRef(ref);
      if (stack.has(normalized)) {
        throw new FormulaError(ERR.circular);
      }
      const raw = this.cells.get(normalized);
      if (!raw) {
        return null;
      }
      if (!raw.startsWith('=')) {
        const numeric = Number(raw);
        return raw.trim() !== '' && !Number.isNaN(numeric) ? numeric : raw;
      }
      stack.add(normalized);
      try {
        const ast = parseFormula(raw.slice(1));
        return this.evaluateAst(ast, stack);
      } catch (error) {
        if (error instanceof FormulaError) {
          throw error;
        }
        throw new FormulaError(ERR.generic);
      } finally {
        stack.delete(normalized);
      }
    }

    evaluateAst(node, stack) {
      if (node.type === 'literal') {
        return node.value;
      }
      if (node.type === 'ref') {
        return this.evaluateCell(normalizeRef(node.ref), stack);
      }
      if (node.type === 'range') {
        return this.expandRange(node.start, node.end).map((ref) => this.evaluateCell(ref, stack));
      }
      if (node.type === 'unary') {
        return -toNumber(this.evaluateAst(node.argument, stack));
      }
      if (node.type === 'binary') {
        const left = this.evaluateAst(node.left, stack);
        const right = this.evaluateAst(node.right, stack);
        switch (node.operator) {
          case '+': return toNumber(left) + toNumber(right);
          case '-': return toNumber(left) - toNumber(right);
          case '*': return toNumber(left) * toNumber(right);
          case '/': {
            const divisor = toNumber(right);
            if (divisor === 0) {
              throw new FormulaError(ERR.div0);
            }
            return toNumber(left) / divisor;
          }
          case '&': return toText(left) + toText(right);
          case '=': return toText(left) === toText(right);
          case '<>': return toText(left) !== toText(right);
          case '<': return toNumber(left) < toNumber(right);
          case '<=': return toNumber(left) <= toNumber(right);
          case '>': return toNumber(left) > toNumber(right);
          case '>=': return toNumber(left) >= toNumber(right);
          default: throw new FormulaError(ERR.generic);
        }
      }
      if (node.type === 'call') {
        return this.evaluateFunction(node.name, node.args.map((arg) => this.evaluateAst(arg, stack)));
      }
      throw new FormulaError(ERR.generic);
    }

    evaluateFunction(name, args) {
      const flat = flattenArgs(args);
      switch (name) {
        case 'SUM': return flat.reduce((sum, value) => sum + toNumber(value), 0);
        case 'AVERAGE': return flat.length ? flat.reduce((sum, value) => sum + toNumber(value), 0) / flat.length : 0;
        case 'MIN': return flat.length ? Math.min(...flat.map(toNumber)) : 0;
        case 'MAX': return flat.length ? Math.max(...flat.map(toNumber)) : 0;
        case 'COUNT': return flat.filter((value) => value !== null && value !== '').length;
        case 'IF': return toBoolean(args[0]) ? args[1] : args[2];
        case 'AND': return flat.every(toBoolean);
        case 'OR': return flat.some(toBoolean);
        case 'NOT': return !toBoolean(args[0]);
        case 'ABS': return Math.abs(toNumber(args[0]));
        case 'ROUND': return Number(toNumber(args[0]).toFixed(args[1] == null ? 0 : toNumber(args[1])));
        case 'CONCAT': return flat.map(toText).join('');
        default: throw new FormulaError(ERR.generic);
      }
    }

    expandRange(startRef, endRef) {
      const start = parseRefParts(startRef);
      const end = parseRefParts(endRef);
      const startCol = columnToIndex(start.col);
      const endCol = columnToIndex(end.col);
      const colMin = Math.min(startCol, endCol);
      const colMax = Math.max(startCol, endCol);
      const rowMin = Math.min(start.row, end.row);
      const rowMax = Math.max(start.row, end.row);
      const refs = [];
      for (let row = rowMin; row <= rowMax; row += 1) {
        for (let col = colMin; col <= colMax; col += 1) {
          refs.push(`${indexToColumn(col)}${row}`);
        }
      }
      return refs;
    }

    copyCell(sourceRef, targetRef) {
      const source = normalizeRef(sourceRef);
      const target = normalizeRef(targetRef);
      const raw = this.getRaw(source);
      if (!raw) {
        this.setCell(target, '');
        return;
      }
      if (!raw.startsWith('=')) {
        this.setCell(target, raw);
        return;
      }
      const sourceParts = parseRefParts(source);
      const targetParts = parseRefParts(target);
      const rowOffset = targetParts.row - sourceParts.row;
      const colOffset = columnToIndex(targetParts.col) - columnToIndex(sourceParts.col);
      this.setCell(target, shiftFormula(raw, rowOffset, colOffset));
    }

    serialize() {
      return { cells: Object.fromEntries(this.cells.entries()) };
    }
  }

  return {
    SpreadsheetModel,
    ERR,
    normalizeRef,
    indexToColumn,
    columnToIndex,
    shiftFormula
  };
});
