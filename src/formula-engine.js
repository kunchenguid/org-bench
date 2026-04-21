'use strict';

const EMPTY = Symbol('empty');

class FormulaFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

class SpreadsheetEngine {
  constructor() {
    this.cells = new Map();
  }

  setCell(cellId, raw) {
    const id = normalizeCellId(cellId);
    this.cells.set(id, { raw: String(raw ?? '') });
  }

  getFormula(cellId) {
    return this.getCellRecord(cellId).raw;
  }

  getDisplayValue(cellId) {
    return this.getCellRecord(cellId).value ?? '';
  }

  getDependencies(cellId) {
    const record = this.getCellRecord(cellId);
    return [...(record.dependencies || [])].sort(compareCellIds);
  }

  recalculate() {
    for (const [cellId, record] of this.cells.entries()) {
      record.error = null;
      record.dependencies = [];
      record.ast = null;
      record.value = '';

      if (!record.raw.startsWith('=')) {
        record.value = parseLiteralCellValue(record.raw);
        continue;
      }

      try {
        const ast = parseFormula(record.raw);
        record.ast = ast;
        record.dependencies = collectDependencies(ast);
      } catch (error) {
        record.error = error instanceof FormulaFailure ? error.code : '#ERR!';
      }
    }

    const cache = new Map();
    for (const cellId of this.cells.keys()) {
      this.evaluateCell(cellId, new Set(), cache);
    }
  }

  evaluateCell(cellId, stack, cache) {
    if (cache.has(cellId)) {
      return cache.get(cellId);
    }

    const record = this.getCellRecord(cellId);
    if (!record.raw.startsWith('=')) {
      cache.set(cellId, record.value);
      return record.value;
    }

    if (stack.has(cellId)) {
      record.value = '#CIRC!';
      cache.set(cellId, record.value);
      return record.value;
    }

    if (record.error) {
      record.value = record.error;
      cache.set(cellId, record.value);
      return record.value;
    }

    stack.add(cellId);
    try {
      const result = evaluateNode(record.ast, this, stack, cache);
      record.value = finalizeValue(result);
    } catch (error) {
      record.value = error instanceof FormulaFailure ? error.code : '#ERR!';
    }
    stack.delete(cellId);
    cache.set(cellId, record.value);
    return record.value;
  }

  getCellRecord(cellId) {
    return this.cells.get(normalizeCellId(cellId)) || { raw: '', value: '', dependencies: [] };
  }

  getCellValueForReference(cellId, stack, cache) {
    if (!this.cells.has(cellId)) {
      return EMPTY;
    }
    const value = this.evaluateCell(cellId, stack, cache);
    if (typeof value === 'string' && /^#/.test(value)) {
      throw new FormulaFailure(value);
    }
    return value;
  }

  insertRows(index, count) {
    this.remapCells((pos) => {
      if (pos.row >= index) {
        return { row: pos.row + count, col: pos.col };
      }
      return pos;
    });
    this.rewriteAllFormulas((ref) => adjustRefForInsert(ref, 'row', index, count));
  }

  deleteRows(index, count) {
    const end = index + count - 1;
    this.remapCells((pos) => {
      if (pos.row >= index && pos.row <= end) {
        return null;
      }
      if (pos.row > end) {
        return { row: pos.row - count, col: pos.col };
      }
      return pos;
    });
    this.rewriteAllFormulas((ref) => adjustRefForDelete(ref, 'row', index, count));
  }

  insertColumns(index, count) {
    this.remapCells((pos) => {
      if (pos.col >= index) {
        return { row: pos.row, col: pos.col + count };
      }
      return pos;
    });
    this.rewriteAllFormulas((ref) => adjustRefForInsert(ref, 'col', index, count));
  }

  deleteColumns(index, count) {
    const end = index + count - 1;
    this.remapCells((pos) => {
      if (pos.col >= index && pos.col <= end) {
        return null;
      }
      if (pos.col > end) {
        return { row: pos.row, col: pos.col - count };
      }
      return pos;
    });
    this.rewriteAllFormulas((ref) => adjustRefForDelete(ref, 'col', index, count));
  }

  remapCells(mapper) {
    const next = new Map();
    for (const [cellId, record] of this.cells.entries()) {
      const mapped = mapper(parseCellId(cellId));
      if (!mapped) {
        continue;
      }
      next.set(formatCellId(mapped.col, mapped.row), { raw: record.raw });
    }
    this.cells = next;
  }

  rewriteAllFormulas(transformer) {
    for (const record of this.cells.values()) {
      if (!record.raw.startsWith('=')) {
        continue;
      }
      record.raw = rewriteFormulaReferences(record.raw, transformer);
    }
  }
}

function shiftFormula(formula, sourceCellId, targetCellId) {
  const source = parseCellId(sourceCellId);
  const target = parseCellId(targetCellId);
  const rowDelta = target.row - source.row;
  const colDelta = target.col - source.col;

  return rewriteFormulaReferences(formula, (ref) => ({
    ...ref,
    row: ref.rowAbsolute ? ref.row : ref.row + rowDelta,
    col: ref.colAbsolute ? ref.col : ref.col + colDelta,
  }));
}

function rewriteFormulaReferences(formula, transformer) {
  if (!formula.startsWith('=')) {
    return formula;
  }

  const tokens = tokenize(formula.slice(1));
  let invalid = false;
  const rewritten = tokens.map((token) => {
    if (token.type !== 'CELL') {
      return token.raw;
    }
    const next = transformer(token.ref);
    if (!next) {
      invalid = true;
      return '#REF!';
    }
    return formatRef(next);
  }).join('');

  return invalid ? '=#REF!' : `=${rewritten}`;
}

function adjustRefForInsert(ref, axis, index, count) {
  if (axis === 'row' && ref.row >= index) {
    return { ...ref, row: ref.row + count };
  }
  if (axis === 'col' && ref.col >= index) {
    return { ...ref, col: ref.col + count };
  }
  return ref;
}

function adjustRefForDelete(ref, axis, index, count) {
  const end = index + count - 1;
  if (axis === 'row') {
    if (ref.row >= index && ref.row <= end) {
      return null;
    }
    if (ref.row > end) {
      return { ...ref, row: ref.row - count };
    }
  }
  if (axis === 'col') {
    if (ref.col >= index && ref.col <= end) {
      return null;
    }
    if (ref.col > end) {
      return { ...ref, col: ref.col - count };
    }
  }
  return ref;
}

function parseFormula(raw) {
  if (raw === '=#REF!') {
    return { type: 'ERROR', code: '#REF!' };
  }
  const parser = new Parser(tokenize(raw.slice(1)));
  const ast = parser.parseExpression();
  parser.expect('EOF');
  return ast;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  consume(type) {
    if (this.current().type === type) {
      return this.tokens[this.index++];
    }
    return null;
  }

  expect(type) {
    const token = this.consume(type);
    if (!token) {
      throw new FormulaFailure('#ERR!');
    }
    return token;
  }

  parseExpression() {
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseConcat();
    while (['EQ', 'NE', 'LT', 'LTE', 'GT', 'GTE'].includes(this.current().type)) {
      const operator = this.tokens[this.index++].type;
      const right = this.parseConcat();
      left = { type: 'BINARY', operator, left, right };
    }
    return left;
  }

  parseConcat() {
    let left = this.parseAdditive();
    while (this.consume('AMP')) {
      const right = this.parseAdditive();
      left = { type: 'BINARY', operator: 'AMP', left, right };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (['PLUS', 'MINUS'].includes(this.current().type)) {
      const operator = this.tokens[this.index++].type;
      const right = this.parseMultiplicative();
      left = { type: 'BINARY', operator, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (['STAR', 'SLASH'].includes(this.current().type)) {
      const operator = this.tokens[this.index++].type;
      const right = this.parseUnary();
      left = { type: 'BINARY', operator, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.consume('MINUS')) {
      return { type: 'UNARY', operator: 'MINUS', value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.current();
    if (this.consume('NUMBER')) {
      return { type: 'NUMBER', value: Number(token.raw) };
    }
    if (this.consume('STRING')) {
      return { type: 'STRING', value: token.value };
    }
    if (this.consume('BOOLEAN')) {
      return { type: 'BOOLEAN', value: token.value };
    }
    if (this.consume('REF_ERROR')) {
      return { type: 'ERROR', code: '#REF!' };
    }
    if (this.consume('IDENT')) {
      const name = token.raw.toUpperCase();
      if (this.consume('LPAREN')) {
        const args = [];
        if (!this.consume('RPAREN')) {
          do {
            args.push(this.parseExpression());
          } while (this.consume('COMMA'));
          this.expect('RPAREN');
        }
        return { type: 'CALL', name, args };
      }
      throw new FormulaFailure('#ERR!');
    }
    if (this.consume('CELL')) {
      const ref = token.ref;
      if (this.consume('COLON')) {
        const end = this.expect('CELL');
        return { type: 'RANGE', start: ref, end: end.ref };
      }
      return { type: 'REF', ref };
    }
    if (this.consume('LPAREN')) {
      const value = this.parseExpression();
      this.expect('RPAREN');
      return value;
    }
    throw new FormulaFailure('#ERR!');
  }
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

    const slice = source.slice(index);

    if (slice.startsWith('#REF!')) {
      tokens.push({ type: 'REF_ERROR', raw: '#REF!' });
      index += 5;
      continue;
    }

    const stringMatch = slice.match(/^"((?:[^"]|"")*)"/);
    if (stringMatch) {
      tokens.push({ type: 'STRING', raw: stringMatch[0], value: stringMatch[1].replace(/""/g, '"') });
      index += stringMatch[0].length;
      continue;
    }

    const cellMatch = slice.match(/^\$?[A-Z]+\$?[1-9][0-9]*/);
    if (cellMatch) {
      tokens.push({ type: 'CELL', raw: cellMatch[0], ref: parseRef(cellMatch[0]) });
      index += cellMatch[0].length;
      continue;
    }

    const numberMatch = slice.match(/^\d+(?:\.\d+)?|^\.\d+/);
    if (numberMatch) {
      tokens.push({ type: 'NUMBER', raw: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    const identMatch = slice.match(/^[A-Z_][A-Z0-9_]*/i);
    if (identMatch) {
      const raw = identMatch[0];
      const upper = raw.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', raw, value: upper === 'TRUE' });
      } else {
        tokens.push({ type: 'IDENT', raw });
      }
      index += raw.length;
      continue;
    }

    const twoChar = {
      '<>': 'NE',
      '<=': 'LTE',
      '>=': 'GTE',
    };
    const pair = slice.slice(0, 2);
    if (twoChar[pair]) {
      tokens.push({ type: twoChar[pair], raw: pair });
      index += 2;
      continue;
    }

    const oneChar = {
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'STAR',
      '/': 'SLASH',
      '&': 'AMP',
      '=': 'EQ',
      '<': 'LT',
      '>': 'GT',
      '(': 'LPAREN',
      ')': 'RPAREN',
      ',': 'COMMA',
      ':': 'COLON',
    };
    if (oneChar[char]) {
      tokens.push({ type: oneChar[char], raw: char });
      index += 1;
      continue;
    }

    throw new FormulaFailure('#ERR!');
  }

  tokens.push({ type: 'EOF', raw: '' });
  return tokens;
}

function collectDependencies(ast) {
  const set = new Set();
  walkDependencies(ast, set);
  return [...set];
}

function walkDependencies(node, set) {
  if (!node) {
    return;
  }
  switch (node.type) {
    case 'REF':
      set.add(formatCellId(node.ref.col, node.ref.row));
      break;
    case 'RANGE':
      for (const cellId of expandRange(node.start, node.end)) {
        set.add(cellId);
      }
      break;
    case 'BINARY':
      walkDependencies(node.left, set);
      walkDependencies(node.right, set);
      break;
    case 'UNARY':
      walkDependencies(node.value, set);
      break;
    case 'CALL':
      for (const arg of node.args) {
        walkDependencies(arg, set);
      }
      break;
    default:
      break;
  }
}

function evaluateNode(node, engine, stack, cache) {
  switch (node.type) {
    case 'NUMBER':
    case 'STRING':
    case 'BOOLEAN':
      return node.value;
    case 'ERROR':
      throw new FormulaFailure(node.code);
    case 'REF':
      return engine.getCellValueForReference(formatCellId(node.ref.col, node.ref.row), stack, cache);
    case 'RANGE':
      return expandRange(node.start, node.end).map((cellId) => engine.getCellValueForReference(cellId, stack, cache));
    case 'UNARY':
      return -coerceNumber(evaluateNode(node.value, engine, stack, cache));
    case 'BINARY':
      return evaluateBinary(node, engine, stack, cache);
    case 'CALL':
      return evaluateCall(node, engine, stack, cache);
    default:
      throw new FormulaFailure('#ERR!');
  }
}

function evaluateBinary(node, engine, stack, cache) {
  const left = evaluateNode(node.left, engine, stack, cache);
  const right = evaluateNode(node.right, engine, stack, cache);
  switch (node.operator) {
    case 'PLUS':
      return coerceNumber(left) + coerceNumber(right);
    case 'MINUS':
      return coerceNumber(left) - coerceNumber(right);
    case 'STAR':
      return coerceNumber(left) * coerceNumber(right);
    case 'SLASH':
      if (coerceNumber(right) === 0) {
        throw new FormulaFailure('#DIV/0!');
      }
      return coerceNumber(left) / coerceNumber(right);
    case 'AMP':
      return coerceText(left) + coerceText(right);
    case 'EQ':
      return compareValues(left, right) === 0;
    case 'NE':
      return compareValues(left, right) !== 0;
    case 'LT':
      return compareValues(left, right) < 0;
    case 'LTE':
      return compareValues(left, right) <= 0;
    case 'GT':
      return compareValues(left, right) > 0;
    case 'GTE':
      return compareValues(left, right) >= 0;
    default:
      throw new FormulaFailure('#ERR!');
  }
}

function evaluateCall(node, engine, stack, cache) {
  const name = node.name.toUpperCase();
  if (name === 'IF') {
    if (node.args.length < 2 || node.args.length > 3) {
      throw new FormulaFailure('#ERR!');
    }
    const condition = coerceBoolean(evaluateNode(node.args[0], engine, stack, cache));
    return evaluateNode(node.args[condition ? 1 : 2] || { type: 'STRING', value: '' }, engine, stack, cache);
  }

  const args = node.args.map((arg) => evaluateNode(arg, engine, stack, cache));
  const flat = flattenArgs(args);

  switch (name) {
    case 'SUM':
      return flat.reduce((sum, value) => sum + coerceNumber(value), 0);
    case 'AVERAGE':
      return flat.length ? flat.reduce((sum, value) => sum + coerceNumber(value), 0) / flat.length : 0;
    case 'MIN':
      return flat.length ? Math.min(...flat.map(coerceNumber)) : 0;
    case 'MAX':
      return flat.length ? Math.max(...flat.map(coerceNumber)) : 0;
    case 'COUNT':
      return flat.filter((value) => value !== EMPTY).length;
    case 'AND':
      return flat.every((value) => coerceBoolean(value));
    case 'OR':
      return flat.some((value) => coerceBoolean(value));
    case 'NOT':
      if (flat.length !== 1) {
        throw new FormulaFailure('#ERR!');
      }
      return !coerceBoolean(flat[0]);
    case 'ABS':
      if (flat.length !== 1) {
        throw new FormulaFailure('#ERR!');
      }
      return Math.abs(coerceNumber(flat[0]));
    case 'ROUND':
      if (flat.length < 1 || flat.length > 2) {
        throw new FormulaFailure('#ERR!');
      }
      return roundTo(coerceNumber(flat[0]), flat[1] == null ? 0 : coerceNumber(flat[1]));
    case 'CONCAT':
      return flat.map(coerceText).join('');
    default:
      throw new FormulaFailure('#ERR!');
  }
}

function parseLiteralCellValue(raw) {
  const trimmed = String(raw);
  if (trimmed === '') {
    return '';
  }
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function flattenArgs(values) {
  return values.flatMap((value) => Array.isArray(value) ? value : [value]);
}

function coerceNumber(value) {
  if (value === EMPTY || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    throw new FormulaFailure('#ERR!');
  }
  return numeric;
}

function coerceText(value) {
  if (value === EMPTY) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

function coerceBoolean(value) {
  if (value === EMPTY || value === '') {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return Boolean(value);
}

function compareValues(left, right) {
  if ((typeof left === 'number' || left === EMPTY) && (typeof right === 'number' || right === EMPTY)) {
    return coerceNumber(left) - coerceNumber(right);
  }
  const leftText = coerceText(left);
  const rightText = coerceText(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function finalizeValue(value) {
  if (value === EMPTY) {
    return 0;
  }
  return value;
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function expandRange(start, end) {
  const startRow = Math.min(start.row, end.row);
  const endRow = Math.max(start.row, end.row);
  const startCol = Math.min(start.col, end.col);
  const endCol = Math.max(start.col, end.col);
  const cells = [];
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      cells.push(formatCellId(col, row));
    }
  }
  return cells;
}

function parseRef(raw) {
  const match = raw.match(/^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/);
  return {
    colAbsolute: Boolean(match[1]),
    col: lettersToColumn(match[2]),
    rowAbsolute: Boolean(match[3]),
    row: Number(match[4]),
  };
}

function formatRef(ref) {
  if (ref.row < 1 || ref.col < 1) {
    throw new FormulaFailure('#REF!');
  }
  return `${ref.colAbsolute ? '$' : ''}${columnToLetters(ref.col)}${ref.rowAbsolute ? '$' : ''}${ref.row}`;
}

function normalizeCellId(cellId) {
  const parsed = parseCellId(cellId);
  return formatCellId(parsed.col, parsed.row);
}

function parseCellId(cellId) {
  const match = String(cellId).toUpperCase().match(/^([A-Z]+)([1-9][0-9]*)$/);
  if (!match) {
    throw new FormulaFailure('#REF!');
  }
  return { col: lettersToColumn(match[1]), row: Number(match[2]) };
}

function formatCellId(col, row) {
  return `${columnToLetters(col)}${row}`;
}

function lettersToColumn(letters) {
  let value = 0;
  for (const char of letters) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value;
}

function columnToLetters(column) {
  let value = column;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function compareCellIds(left, right) {
  const a = parseCellId(left);
  const b = parseCellId(right);
  if (a.col !== b.col) {
    return a.col - b.col;
  }
  return a.row - b.row;
}

const formulaEngineApi = {
  SpreadsheetEngine,
  shiftFormula,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = formulaEngineApi;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetFormulaEngine = formulaEngineApi;
}
