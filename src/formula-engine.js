'use strict';

const EMPTY = Object.freeze({ kind: 'empty' });

function createFormulaEngine() {
  return new FormulaEngine();
}

class FormulaEngine {
  constructor() {
    this.cells = new Map();
  }

  setCell(ref, raw) {
    const normalizedRef = normalizeCellRef(ref);
    const normalizedRaw = raw == null ? '' : String(raw);
    const cell = this._ensureCell(normalizedRef);

    this._detachDependencies(normalizedRef, cell);
    cell.raw = normalizedRaw;
    cell.ast = null;
    cell.parseError = null;
    cell.deps = new Set();

    if (normalizedRaw.startsWith('=')) {
      try {
        cell.ast = new Parser(tokenize(normalizedRaw.slice(1))).parseExpression();
        cell.deps = collectDependencies(cell.ast);
        this._attachDependencies(normalizedRef, cell.deps);
      } catch (error) {
        cell.parseError = makeError('#ERR!');
      }
    }

    this._recalculate();
  }

  getCellRaw(ref) {
    return this._ensureCell(normalizeCellRef(ref)).raw;
  }

  getCellValue(ref) {
    return this._ensureCell(normalizeCellRef(ref)).value;
  }

  getCellDisplay(ref) {
    return formatDisplay(this._ensureCell(normalizeCellRef(ref)).value);
  }

  getCellMeta(ref) {
    const cell = this._ensureCell(normalizeCellRef(ref));
    return {
      raw: cell.raw,
      value: cell.value,
      display: formatDisplay(cell.value),
      deps: [...cell.deps],
      dependents: [...cell.dependents],
    };
  }

  getSnapshot() {
    const snapshot = {};
    for (const [ref, cell] of this.cells) {
      if (!cell.raw) {
        continue;
      }
      snapshot[ref] = {
        raw: cell.raw,
        display: formatDisplay(cell.value),
      };
    }
    return snapshot;
  }

  _ensureCell(ref) {
    if (!this.cells.has(ref)) {
      this.cells.set(ref, {
        raw: '',
        ast: null,
        parseError: null,
        deps: new Set(),
        dependents: new Set(),
        value: EMPTY,
      });
    }
    return this.cells.get(ref);
  }

  _attachDependencies(ref, deps) {
    for (const dep of deps) {
      this._ensureCell(dep).dependents.add(ref);
    }
  }

  _detachDependencies(ref, cell) {
    for (const dep of cell.deps) {
      this._ensureCell(dep).dependents.delete(ref);
    }
  }

  _recalculate() {
    const states = new Map();
    const stack = [];

    for (const ref of this.cells.keys()) {
      this._evaluateCell(ref, states, stack);
    }
  }

  _evaluateCell(ref, states, stack) {
    const state = states.get(ref);
    if (state === 'done') {
      return this._ensureCell(ref).value;
    }
    if (state === 'visiting') {
      const cycleStart = stack.indexOf(ref);
      const cycleRefs = cycleStart === -1 ? [ref] : stack.slice(cycleStart);
      for (const cycleRef of cycleRefs) {
        this._ensureCell(cycleRef).value = makeError('#CIRC!');
        states.set(cycleRef, 'done');
      }
      return makeError('#CIRC!');
    }

    states.set(ref, 'visiting');
    stack.push(ref);

    const cell = this._ensureCell(ref);
    if (cell.parseError) {
      cell.value = cell.parseError;
    } else if (!cell.raw) {
      cell.value = EMPTY;
    } else if (!cell.raw.startsWith('=')) {
      cell.value = parseLiteralCell(cell.raw);
    } else if (!cell.ast) {
      cell.value = makeError('#ERR!');
    } else {
      cell.value = this._evaluateNode(cell.ast, ref, states, stack);
    }

    stack.pop();
    if (states.get(ref) !== 'done') {
      states.set(ref, 'done');
    }
    return cell.value;
  }

  _evaluateNode(node, ref, states, stack) {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'string':
        return node.value;
      case 'boolean':
        return node.value;
      case 'unary': {
        const value = this._evaluateNode(node.argument, ref, states, stack);
        if (isError(value)) {
          return value;
        }
        if (node.operator === '-') {
          return -coerceNumber(value);
        }
        return makeError('#ERR!');
      }
      case 'binary':
        return this._evaluateBinary(node, ref, states, stack);
      case 'cell':
        return this._getReferencedCellValue(node.ref, states, stack);
      case 'range':
        return getRangeRefs(node.start, node.end).map((rangeRef) => this._getReferencedCellValue(rangeRef, states, stack));
      case 'function':
        return this._evaluateFunction(node, ref, states, stack);
      default:
        return makeError('#ERR!');
    }
  }

  _getReferencedCellValue(ref, states, stack) {
    return this._evaluateCell(normalizeCellRef(ref), states, stack);
  }

  _evaluateBinary(node, ref, states, stack) {
    const left = this._evaluateNode(node.left, ref, states, stack);
    if (isError(left)) {
      return left;
    }
    const right = this._evaluateNode(node.right, ref, states, stack);
    if (isError(right)) {
      return right;
    }

    switch (node.operator) {
      case '+':
        return coerceNumber(left) + coerceNumber(right);
      case '-':
        return coerceNumber(left) - coerceNumber(right);
      case '*':
        return coerceNumber(left) * coerceNumber(right);
      case '/': {
        const divisor = coerceNumber(right);
        if (divisor === 0) {
          return makeError('#DIV/0!');
        }
        return coerceNumber(left) / divisor;
      }
      case '&':
        return coerceText(left) + coerceText(right);
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
        return makeError('#ERR!');
    }
  }

  _evaluateFunction(node, ref, states, stack) {
    const name = node.name;

    if (name === 'IF') {
      if (node.args.length < 2 || node.args.length > 3) {
        return makeError('#ERR!');
      }
      const condition = this._evaluateNode(node.args[0], ref, states, stack);
      if (isError(condition)) {
        return condition;
      }
      const branch = truthy(condition) ? node.args[1] : node.args[2] || { type: 'boolean', value: false };
      return this._evaluateNode(branch, ref, states, stack);
    }

    const values = [];
    for (const arg of node.args) {
      const evaluated = this._evaluateNode(arg, ref, states, stack);
      if (isError(evaluated)) {
        return evaluated;
      }
      if (Array.isArray(evaluated)) {
        values.push(...evaluated);
      } else {
        values.push(evaluated);
      }
    }

    switch (name) {
      case 'SUM':
        return values.reduce((sum, value) => sum + coerceNumber(value), 0);
      case 'AVERAGE': {
        const numericValues = values.filter((value) => !isEmpty(value)).map(coerceNumber);
        return numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : 0;
      }
      case 'MIN': {
        const numericValues = values.filter((value) => !isEmpty(value)).map(coerceNumber);
        return numericValues.length ? Math.min(...numericValues) : 0;
      }
      case 'MAX': {
        const numericValues = values.filter((value) => !isEmpty(value)).map(coerceNumber);
        return numericValues.length ? Math.max(...numericValues) : 0;
      }
      case 'COUNT':
        return values.filter((value) => !isEmpty(value)).length;
      case 'AND':
        return values.every((value) => truthy(value));
      case 'OR':
        return values.some((value) => truthy(value));
      case 'NOT':
        return !truthy(values[0]);
      case 'ABS':
        return Math.abs(coerceNumber(values[0]));
      case 'ROUND': {
        const number = coerceNumber(values[0]);
        const digits = values.length > 1 ? coerceNumber(values[1]) : 0;
        const factor = 10 ** digits;
        return Math.round(number * factor) / factor;
      }
      case 'CONCAT':
        return values.map(coerceText).join('');
      default:
        return makeError('#NAME?');
    }
  }
}

function translateFormula(raw, sourceRef, targetRef) {
  if (!String(raw).startsWith('=')) {
    return String(raw);
  }

  const source = decodeCellRef(normalizeCellRef(sourceRef));
  const target = decodeCellRef(normalizeCellRef(targetRef));
  const rowOffset = target.row - source.row;
  const colOffset = target.col - source.col;
  const tokens = tokenize(String(raw).slice(1));

  return '=' + tokens.map((token) => {
    if (token.type !== 'cell') {
      return token.lexeme;
    }
    const parsed = parseCellToken(token.lexeme);
    return shiftCellToken(parsed, rowOffset, colOffset);
  }).join('');
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
      let value = '';
      index += 1;
      while (index < input.length && input[index] !== '"') {
        value += input[index];
        index += 1;
      }
      if (input[index] !== '"') {
        throw new Error('Unterminated string');
      }
      index += 1;
      tokens.push({ type: 'string', value, lexeme: `"${value}"` });
      continue;
    }

    const twoChar = input.slice(index, index + 2);
    if (['<=', '>=', '<>'].includes(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar, lexeme: twoChar });
      index += 2;
      continue;
    }

    if ('+-*/&=(),:<>'.includes(char)) {
      const type = char === ',' ? 'comma' : char === '(' || char === ')' ? 'paren' : char === ':' ? 'colon' : 'operator';
      tokens.push({ type, value: char, lexeme: char });
      index += 1;
      continue;
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(input[index + 1] || ''))) {
      let value = char;
      index += 1;
      while (index < input.length && /[\d.]/.test(input[index])) {
        value += input[index];
        index += 1;
      }
      tokens.push({ type: 'number', value: Number(value), lexeme: value });
      continue;
    }

    if (char === '$' || /[A-Za-z_]/.test(char)) {
      let value = char;
      index += 1;
      while (index < input.length && /[$A-Za-z0-9_]/.test(input[index])) {
        value += input[index];
        index += 1;
      }
      const upper = value.toUpperCase();
      if (isCellToken(upper)) {
        tokens.push({ type: 'cell', value: upper, lexeme: upper });
      } else if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'boolean', value: upper === 'TRUE', lexeme: upper });
      } else {
        tokens.push({ type: 'identifier', value: upper, lexeme: upper });
      }
      continue;
    }

    throw new Error(`Unexpected token: ${char}`);
  }

  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  parseExpression() {
    const expression = this.parseComparison();
    if (this.peek()) {
      throw new Error('Unexpected trailing token');
    }
    return expression;
  }

  parseComparison() {
    let left = this.parseConcatenation();
    while (this.matchOperator('=', '<>', '<', '<=', '>', '>=')) {
      const operator = this.previous().value;
      const right = this.parseConcatenation();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseConcatenation() {
    let left = this.parseAdditive();
    while (this.matchOperator('&')) {
      const operator = this.previous().value;
      const right = this.parseAdditive();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.matchOperator('+', '-')) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.matchOperator('*', '/')) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.matchOperator('-')) {
      return { type: 'unary', operator: '-', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.advance();
    if (!token) {
      throw new Error('Unexpected end of input');
    }

    if (token.type === 'number') {
      return { type: 'number', value: token.value };
    }
    if (token.type === 'string') {
      return { type: 'string', value: token.value };
    }
    if (token.type === 'boolean') {
      return { type: 'boolean', value: token.value };
    }
    if (token.type === 'cell') {
      const ref = normalizeCellRef(token.value);
      if (this.matchType('colon')) {
        const end = this.expect('cell').value;
        return { type: 'range', start: ref, end: normalizeCellRef(end) };
      }
      return { type: 'cell', ref };
    }
    if (token.type === 'identifier') {
      const name = token.value;
      if (!this.matchParen('(')) {
        throw new Error('Expected function call');
      }
      const args = [];
      if (!this.checkParen(')')) {
        do {
          args.push(this.parseComparison());
        } while (this.matchType('comma'));
      }
      this.expectParen(')');
      return { type: 'function', name, args };
    }
    if (token.type === 'paren' && token.value === '(') {
      const expression = this.parseComparison();
      this.expectParen(')');
      return expression;
    }

    throw new Error('Unexpected token');
  }

  matchOperator(...operators) {
    const token = this.peek();
    if (token && token.type === 'operator' && operators.includes(token.value)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  matchParen(value) {
    const token = this.peek();
    if (token && token.type === 'paren' && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  checkParen(value) {
    const token = this.peek();
    return Boolean(token && token.type === 'paren' && token.value === value);
  }

  matchType(type) {
    const token = this.peek();
    if (token && token.type === type) {
      this.index += 1;
      return true;
    }
    return false;
  }

  expect(type) {
    const token = this.advance();
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type}`);
    }
    return token;
  }

  expectParen(value) {
    const token = this.advance();
    if (!token || token.type !== 'paren' || token.value !== value) {
      throw new Error(`Expected ${value}`);
    }
    return token;
  }

  advance() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  previous() {
    return this.tokens[this.index - 1];
  }

  peek() {
    return this.tokens[this.index];
  }
}

function collectDependencies(node, deps = new Set()) {
  if (!node) {
    return deps;
  }
  switch (node.type) {
    case 'cell':
      deps.add(node.ref);
      break;
    case 'range':
      for (const ref of getRangeRefs(node.start, node.end)) {
        deps.add(ref);
      }
      break;
    case 'binary':
      collectDependencies(node.left, deps);
      collectDependencies(node.right, deps);
      break;
    case 'unary':
      collectDependencies(node.argument, deps);
      break;
    case 'function':
      for (const arg of node.args) {
        collectDependencies(arg, deps);
      }
      break;
    default:
      break;
  }
  return deps;
}

function getRangeRefs(startRef, endRef) {
  const start = decodeCellRef(startRef);
  const end = decodeCellRef(endRef);
  const refs = [];
  const rowStart = Math.min(start.row, end.row);
  const rowEnd = Math.max(start.row, end.row);
  const colStart = Math.min(start.col, end.col);
  const colEnd = Math.max(start.col, end.col);

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      refs.push(encodeCellRef({ row, col }));
    }
  }
  return refs;
}

function normalizeCellRef(ref) {
  const parsed = parseCellToken(String(ref).toUpperCase());
  return encodeCellRef(parsed);
}

function parseCellToken(token) {
  const match = String(token).toUpperCase().match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid cell reference: ${token}`);
  }
  return {
    colAbsolute: Boolean(match[1]),
    colLabel: match[2],
    rowAbsolute: Boolean(match[3]),
    row: Number(match[4]),
    col: columnLabelToIndex(match[2]),
  };
}

function decodeCellRef(ref) {
  const parsed = parseCellToken(ref);
  return { row: parsed.row, col: parsed.col };
}

function encodeCellRef({ row, col }) {
  return `${columnIndexToLabel(col)}${row}`;
}

function shiftCellToken(parsed, rowOffset, colOffset) {
  const nextRow = parsed.rowAbsolute ? parsed.row : Math.max(1, parsed.row + rowOffset);
  const nextCol = parsed.colAbsolute ? parsed.col : Math.max(1, parsed.col + colOffset);
  return `${parsed.colAbsolute ? '$' : ''}${columnIndexToLabel(nextCol)}${parsed.rowAbsolute ? '$' : ''}${nextRow}`;
}

function isCellToken(value) {
  return /^(\$?)[A-Z]+(\$?)\d+$/.test(value);
}

function columnLabelToIndex(label) {
  let index = 0;
  for (const char of label) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index;
}

function columnIndexToLabel(index) {
  let value = index;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label || 'A';
}

function parseLiteralCell(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return EMPTY;
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

function formatDisplay(value) {
  if (isError(value)) {
    return value.code;
  }
  if (isEmpty(value)) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

function compareValues(left, right) {
  const leftNumber = maybeNumber(left);
  const rightNumber = maybeNumber(right);
  if (leftNumber != null && rightNumber != null) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  const leftText = coerceText(left);
  const rightText = coerceText(right);
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
}

function maybeNumber(value) {
  if (isEmpty(value)) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function coerceNumber(value) {
  if (isEmpty(value)) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return 0;
    }
    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? 0 : numeric;
  }
  return 0;
}

function coerceText(value) {
  if (isEmpty(value)) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

function truthy(value) {
  if (isEmpty(value)) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value !== '';
  }
  return Boolean(value);
}

function isEmpty(value) {
  return value && value.kind === 'empty';
}

function makeError(code) {
  return { kind: 'error', code };
}

function isError(value) {
  return value && value.kind === 'error';
}

module.exports = {
  createFormulaEngine,
  translateFormula,
};
