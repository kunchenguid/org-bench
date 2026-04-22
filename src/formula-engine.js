const ERROR_ERR = '#ERR!';
const ERROR_DIV0 = '#DIV/0!';
const ERROR_REF = '#REF!';
const ERROR_CIRC = '#CIRC!';

function isErrorValue(value) {
  return typeof value === 'string' && /^#.+!$/.test(value);
}

function columnToIndex(label) {
  let value = 0;
  const upper = String(label || '').toUpperCase();
  for (let i = 0; i < upper.length; i += 1) {
    value = value * 26 + (upper.charCodeAt(i) - 64);
  }
  return value;
}

function indexToColumn(index) {
  let current = Number(index);
  let label = '';
  while (current > 0) {
    current -= 1;
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26);
  }
  return label || 'A';
}

function normalizeAddress(address) {
  const match = /^([A-Za-z]+)(\d+)$/.exec(String(address || '').trim());
  if (!match) {
    throw new Error(`Invalid address: ${address}`);
  }
  return `${match[1].toUpperCase()}${Number(match[2])}`;
}

function parseAddress(address) {
  const normalized = normalizeAddress(address);
  const match = /^([A-Z]+)(\d+)$/.exec(normalized);
  return { col: columnToIndex(match[1]), row: Number(match[2]) };
}

function makeAddress(col, row) {
  return `${indexToColumn(col)}${row}`;
}

function parseReferenceText(text) {
  if (text === '#REF!') {
    return { refError: true };
  }
  const match = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(String(text || '').trim());
  if (!match) {
    return null;
  }
  return {
    absoluteCol: match[1] === '$',
    col: columnToIndex(match[2]),
    absoluteRow: match[3] === '$',
    row: Number(match[4]),
  };
}

function makeReference(ref) {
  if (!ref || ref.refError || ref.col < 1 || ref.row < 1) {
    return '#REF!';
  }
  return `${ref.absoluteCol ? '$' : ''}${indexToColumn(ref.col)}${ref.absoluteRow ? '$' : ''}${ref.row}`;
}

function shiftReference(ref, rowDelta, colDelta) {
  if (!ref || ref.refError) {
    return { refError: true };
  }
  const shifted = { ...ref };
  if (!shifted.absoluteCol) {
    shifted.col += colDelta;
  }
  if (!shifted.absoluteRow) {
    shifted.row += rowDelta;
  }
  if (shifted.col < 1 || shifted.row < 1) {
    return { refError: true };
  }
  return shifted;
}

function mapRowInsert(point, atRow, count) {
  if (point.row >= atRow) {
    return { col: point.col, row: point.row + count };
  }
  return point;
}

function mapRowDelete(point, atRow, count) {
  const endRow = atRow + count - 1;
  if (point.row < atRow) {
    return point;
  }
  if (point.row > endRow) {
    return { col: point.col, row: point.row - count };
  }
  return null;
}

function mapColumnInsert(point, atCol, count) {
  if (point.col >= atCol) {
    return { col: point.col + count, row: point.row };
  }
  return point;
}

function mapColumnDelete(point, atCol, count) {
  const endCol = atCol + count - 1;
  if (point.col < atCol) {
    return point;
  }
  if (point.col > endCol) {
    return { col: point.col - count, row: point.row };
  }
  return null;
}

function collectMappedRange(startValue, endValue, mapper) {
  if (startValue.refError || endValue.refError) {
    return null;
  }
  const points = [];
  const minCol = Math.min(startValue.col, endValue.col);
  const maxCol = Math.max(startValue.col, endValue.col);
  const minRow = Math.min(startValue.row, endValue.row);
  const maxRow = Math.max(startValue.row, endValue.row);
  for (let col = minCol; col <= maxCol; col += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const mapped = mapper({ col, row });
      if (mapped) {
        points.push(mapped);
      }
    }
  }
  return points;
}

function stringifyRange(points) {
  if (!points || !points.length) {
    return '#REF!';
  }
  let minCol = points[0].col;
  let maxCol = points[0].col;
  let minRow = points[0].row;
  let maxRow = points[0].row;
  for (let i = 1; i < points.length; i += 1) {
    minCol = Math.min(minCol, points[i].col);
    maxCol = Math.max(maxCol, points[i].col);
    minRow = Math.min(minRow, points[i].row);
    maxRow = Math.max(maxRow, points[i].row);
  }
  return `${makeAddress(minCol, minRow)}:${makeAddress(maxCol, maxRow)}`;
}

function rewriteSingleReference(text, mapper) {
  const parsed = parseReferenceText(text);
  if (!parsed) {
    return text;
  }
  if (parsed.refError) {
    return '#REF!';
  }
  const mapped = mapper({ col: parsed.col, row: parsed.row });
  if (!mapped) {
    return '#REF!';
  }
  return `${parsed.absoluteCol ? '$' : ''}${indexToColumn(mapped.col)}${parsed.absoluteRow ? '$' : ''}${mapped.row}`;
}

function rewriteRange(text, mapper) {
  const [left, right] = String(text).split(':');
  const points = collectMappedRange(parseReferenceText(left), parseReferenceText(right), mapper);
  return stringifyRange(points);
}

function transformFormulaReferences(formula, transformer) {
  const source = String(formula || '');
  if (!source.startsWith('=')) {
    return source;
  }
  let result = '=';
  let i = 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '"') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '"' && source[j + 1] === '"') {
          j += 2;
          continue;
        }
        if (source[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      result += source.slice(i, j);
      i = j;
      continue;
    }
    const slice = source.slice(i);
    if (slice.startsWith('#REF!')) {
      result += transformer('#REF!', false);
      i += 5;
      continue;
    }
    const rangeMatch = /^(\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+)/.exec(slice);
    if (rangeMatch) {
      result += transformer(rangeMatch[1], true);
      i += rangeMatch[1].length;
      continue;
    }
    const refMatch = /^(\$?[A-Za-z]+\$?\d+)/.exec(slice);
    if (refMatch) {
      result += transformer(refMatch[1], false);
      i += refMatch[1].length;
      continue;
    }
    result += char;
    i += 1;
  }
  return result;
}

function shiftFormula(formula, sourceAddress, targetAddress) {
  const source = parseAddress(sourceAddress);
  const target = parseAddress(targetAddress);
  const rowDelta = target.row - source.row;
  const colDelta = target.col - source.col;
  return transformFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      const [left, right] = token.split(':');
      return `${makeReference(shiftReference(parseReferenceText(left), rowDelta, colDelta))}:${makeReference(shiftReference(parseReferenceText(right), rowDelta, colDelta))}`;
    }
    return makeReference(shiftReference(parseReferenceText(token), rowDelta, colDelta));
  });
}

function rewriteFormulaOnRowInsert(formula, atRow, count) {
  return transformFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      return rewriteRange(token, (point) => mapRowInsert(point, atRow, count));
    }
    return rewriteSingleReference(token, (point) => mapRowInsert(point, atRow, count));
  });
}

function rewriteFormulaOnRowDelete(formula, atRow, count) {
  return transformFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      return rewriteRange(token, (point) => mapRowDelete(point, atRow, count));
    }
    return rewriteSingleReference(token, (point) => mapRowDelete(point, atRow, count));
  });
}

function rewriteFormulaOnColumnInsert(formula, atCol, count) {
  return transformFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      return rewriteRange(token, (point) => mapColumnInsert(point, atCol, count));
    }
    return rewriteSingleReference(token, (point) => mapColumnInsert(point, atCol, count));
  });
}

function rewriteFormulaOnColumnDelete(formula, atCol, count) {
  return transformFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      return rewriteRange(token, (point) => mapColumnDelete(point, atCol, count));
    }
    return rewriteSingleReference(token, (point) => mapColumnDelete(point, atCol, count));
  });
}

class Tokenizer {
  constructor(input) {
    this.input = input;
    this.index = 0;
  }

  skipWhitespace() {
    while (this.index < this.input.length && /\s/.test(this.input[this.index])) {
      this.index += 1;
    }
  }

  peek() {
    const saved = this.index;
    const token = this.next();
    this.index = saved;
    return token;
  }

  next() {
    this.skipWhitespace();
    if (this.index >= this.input.length) {
      return { type: 'EOF' };
    }
    const slice = this.input.slice(this.index);
    if (slice.startsWith('#REF!')) {
      this.index += 5;
      return { type: 'REF_ERROR', value: '#REF!' };
    }
    const two = this.input.slice(this.index, this.index + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      this.index += 2;
      return { type: 'OP', value: two };
    }
    const one = this.input[this.index];
    if ('+-*/&=<>(),:'.includes(one)) {
      this.index += 1;
      return { type: 'OP', value: one };
    }
    if (one === '"') {
      this.index += 1;
      let value = '';
      while (this.index < this.input.length) {
        const char = this.input[this.index];
        if (char === '"' && this.input[this.index + 1] === '"') {
          value += '"';
          this.index += 2;
          continue;
        }
        if (char === '"') {
          this.index += 1;
          return { type: 'STRING', value };
        }
        value += char;
        this.index += 1;
      }
      throw new Error('Unterminated string');
    }
    if (/\d|\./.test(one)) {
      const match = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(slice);
      this.index += match[0].length;
      return { type: 'NUMBER', value: Number(match[0]) };
    }
    if (/[A-Za-z_$]/.test(one)) {
      const refMatch = /^(\$?[A-Za-z]+\$?\d+)/.exec(slice);
      if (refMatch) {
        this.index += refMatch[1].length;
        return { type: 'REFERENCE', value: refMatch[1] };
      }
      const identMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(slice);
      this.index += identMatch[0].length;
      return { type: 'IDENT', value: identMatch[0].toUpperCase() };
    }
    throw new Error(`Unexpected token: ${one}`);
  }
}

function parseFormulaExpression(input) {
  const tokenizer = new Tokenizer(input);

  function expectOperator(value) {
    const token = tokenizer.next();
    if (token.type !== 'OP' || token.value !== value) {
      throw new Error(`Expected ${value}`);
    }
  }

  function parsePrimary() {
    const token = tokenizer.next();
    if (token.type === 'NUMBER') {
      return { type: 'number', value: token.value };
    }
    if (token.type === 'STRING') {
      return { type: 'string', value: token.value };
    }
    if (token.type === 'REF_ERROR') {
      return { type: 'error', value: ERROR_REF };
    }
    if (token.type === 'REFERENCE') {
      const next = tokenizer.peek();
      if (next.type === 'OP' && next.value === ':') {
        tokenizer.next();
        const end = tokenizer.next();
        if (end.type !== 'REFERENCE') {
          throw new Error('Invalid range');
        }
        return { type: 'range', start: token.value, end: end.value };
      }
      return { type: 'reference', value: token.value };
    }
    if (token.type === 'IDENT') {
      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'boolean', value: token.value === 'TRUE' };
      }
      const next = tokenizer.peek();
      if (next.type === 'OP' && next.value === '(') {
        tokenizer.next();
        const args = [];
        const peek = tokenizer.peek();
        if (!(peek.type === 'OP' && peek.value === ')')) {
          while (true) {
            args.push(parseComparison());
            const separator = tokenizer.peek();
            if (separator.type === 'OP' && separator.value === ',') {
              tokenizer.next();
              continue;
            }
            break;
          }
        }
        expectOperator(')');
        return { type: 'function', name: token.value, args };
      }
      throw new Error(`Unknown identifier: ${token.value}`);
    }
    if (token.type === 'OP' && token.value === '(') {
      const expr = parseComparison();
      expectOperator(')');
      return expr;
    }
    if (token.type === 'OP' && token.value === '-') {
      return { type: 'unary', op: '-', value: parsePrimary() };
    }
    throw new Error('Invalid expression');
  }

  function parseMultiplication() {
    let node = parsePrimary();
    while (true) {
      const token = tokenizer.peek();
      if (token.type === 'OP' && (token.value === '*' || token.value === '/')) {
        tokenizer.next();
        node = { type: 'binary', op: token.value, left: node, right: parsePrimary() };
        continue;
      }
      return node;
    }
  }

  function parseAddition() {
    let node = parseMultiplication();
    while (true) {
      const token = tokenizer.peek();
      if (token.type === 'OP' && (token.value === '+' || token.value === '-')) {
        tokenizer.next();
        node = { type: 'binary', op: token.value, left: node, right: parseMultiplication() };
        continue;
      }
      return node;
    }
  }

  function parseConcatenation() {
    let node = parseAddition();
    while (true) {
      const token = tokenizer.peek();
      if (token.type === 'OP' && token.value === '&') {
        tokenizer.next();
        node = { type: 'binary', op: '&', left: node, right: parseAddition() };
        continue;
      }
      return node;
    }
  }

  function parseComparison() {
    let node = parseConcatenation();
    while (true) {
      const token = tokenizer.peek();
      if (token.type === 'OP' && ['=', '<>', '<', '<=', '>', '>='].includes(token.value)) {
        tokenizer.next();
        node = { type: 'binary', op: token.value, left: node, right: parseConcatenation() };
        continue;
      }
      return node;
    }
  }

  const ast = parseComparison();
  if (tokenizer.next().type !== 'EOF') {
    throw new Error('Unexpected trailing input');
  }
  return ast;
}

function flattenValues(values) {
  const result = [];
  for (let i = 0; i < values.length; i += 1) {
    if (Array.isArray(values[i])) {
      result.push(...flattenValues(values[i]));
    } else {
      result.push(values[i]);
    }
  }
  return result;
}

function coerceToNumber(value) {
  if (isErrorValue(value)) {
    return value;
  }
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? ERROR_ERR : parsed;
}

function coerceToText(value) {
  if (isErrorValue(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

function compareValues(left, right, op) {
  if (isErrorValue(left)) {
    return left;
  }
  if (isErrorValue(right)) {
    return right;
  }
  const leftNumber = coerceToNumber(left);
  const rightNumber = coerceToNumber(right);
  const lhs = isErrorValue(leftNumber) || isErrorValue(rightNumber) ? coerceToText(left) : leftNumber;
  const rhs = isErrorValue(leftNumber) || isErrorValue(rightNumber) ? coerceToText(right) : rightNumber;
  switch (op) {
    case '=':
      return lhs === rhs;
    case '<>':
      return lhs !== rhs;
    case '<':
      return lhs < rhs;
    case '<=':
      return lhs <= rhs;
    case '>':
      return lhs > rhs;
    case '>=':
      return lhs >= rhs;
    default:
      return ERROR_ERR;
  }
}

class FormulaEngine {
  constructor(initialCells) {
    this.cells = new Map();
    this.dependencies = new Map();
    this.dependents = new Map();
    this.cache = new Map();
    if (initialCells) {
      this.setCells(initialCells);
    }
  }

  setCells(cells) {
    const entries = cells instanceof Map ? Array.from(cells.entries()) : Object.entries(cells);
    for (const [address, raw] of entries) {
      this.cells.set(normalizeAddress(address), String(raw));
    }
    this.recalculate();
  }

  setCell(address, raw) {
    this.cells.set(normalizeAddress(address), String(raw));
    this.recalculate();
  }

  getRawValue(address) {
    return this.cells.get(normalizeAddress(address)) || '';
  }

  getComputedValue(address) {
    const normalized = normalizeAddress(address);
    if (!this.cache.has(normalized)) {
      this.recalculate();
    }
    return this.cache.get(normalized);
  }

  getDisplayValue(address) {
    return this.formatValue(this.getComputedValue(address));
  }

  getDependencies(address) {
    return new Set(this.dependencies.get(normalizeAddress(address)) || []);
  }

  getDependents(address) {
    return new Set(this.dependents.get(normalizeAddress(address)) || []);
  }

  recalculate() {
    this.dependencies = new Map();
    this.dependents = new Map();
    this.cache = new Map();
    for (const address of this.cells.keys()) {
      this.evaluateAddress(address, []);
    }
  }

  parseLiteral(raw) {
    const trimmed = String(raw).trim();
    if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
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

  trackDependency(fromAddress, toAddress) {
    if (!this.dependencies.has(fromAddress)) {
      this.dependencies.set(fromAddress, new Set());
    }
    this.dependencies.get(fromAddress).add(toAddress);
    if (!this.dependents.has(toAddress)) {
      this.dependents.set(toAddress, new Set());
    }
    this.dependents.get(toAddress).add(fromAddress);
  }

  evaluateAddress(address, stack) {
    const normalized = normalizeAddress(address);
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized);
    }
    if (stack.includes(normalized)) {
      this.cache.set(normalized, ERROR_CIRC);
      return ERROR_CIRC;
    }
    const raw = this.cells.get(normalized);
    if (raw === undefined || raw === '') {
      return '';
    }
    const nextStack = stack.concat(normalized);
    let value;
    if (raw.startsWith('=')) {
      try {
        value = this.evaluateAst(parseFormulaExpression(raw.slice(1)), normalized, nextStack);
      } catch (error) {
        value = ERROR_ERR;
      }
    } else {
      value = this.parseLiteral(raw);
    }
    this.cache.set(normalized, value);
    return value;
  }

  evaluateAst(node, currentAddress, stack) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'error':
        return node.value;
      case 'reference': {
        const ref = parseReferenceText(node.value);
        if (!ref || ref.refError) {
          return ERROR_REF;
        }
        const address = makeAddress(ref.col, ref.row);
        this.trackDependency(currentAddress, address);
        return this.evaluateAddress(address, stack);
      }
      case 'range': {
        const start = parseReferenceText(node.start);
        const end = parseReferenceText(node.end);
        if (!start || !end || start.refError || end.refError) {
          return ERROR_REF;
        }
        const values = [];
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        for (let col = minCol; col <= maxCol; col += 1) {
          for (let row = minRow; row <= maxRow; row += 1) {
            const address = makeAddress(col, row);
            this.trackDependency(currentAddress, address);
            values.push(this.evaluateAddress(address, stack));
          }
        }
        return values;
      }
      case 'unary': {
        const value = coerceToNumber(this.evaluateAst(node.value, currentAddress, stack));
        return isErrorValue(value) ? value : -value;
      }
      case 'binary': {
        const left = this.evaluateAst(node.left, currentAddress, stack);
        const right = this.evaluateAst(node.right, currentAddress, stack);
        if (node.op === '&') {
          const lhs = coerceToText(left);
          const rhs = coerceToText(right);
          return isErrorValue(lhs) ? lhs : isErrorValue(rhs) ? rhs : lhs + rhs;
        }
        if (['=', '<>', '<', '<=', '>', '>='].includes(node.op)) {
          return compareValues(left, right, node.op);
        }
        const lhs = coerceToNumber(left);
        const rhs = coerceToNumber(right);
        if (isErrorValue(lhs)) {
          return lhs;
        }
        if (isErrorValue(rhs)) {
          return rhs;
        }
        if (node.op === '+') {
          return lhs + rhs;
        }
        if (node.op === '-') {
          return lhs - rhs;
        }
        if (node.op === '*') {
          return lhs * rhs;
        }
        if (rhs === 0) {
          return ERROR_DIV0;
        }
        return lhs / rhs;
      }
      case 'function':
        return this.evaluateFunction(node, currentAddress, stack);
      default:
        return ERROR_ERR;
    }
  }

  evaluateFunction(node, currentAddress, stack) {
    const rawArgs = node.args.map((arg) => this.evaluateAst(arg, currentAddress, stack));
    const flat = flattenValues(rawArgs);
    const error = flat.find(isErrorValue);
    if (error) {
      return error;
    }
    switch (node.name) {
      case 'SUM':
        return flat.reduce((sum, value) => sum + coerceToNumber(value), 0);
      case 'AVERAGE':
        return flat.length ? flat.reduce((sum, value) => sum + coerceToNumber(value), 0) / flat.length : ERROR_DIV0;
      case 'MIN':
        return flat.length ? Math.min(...flat.map(coerceToNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max(...flat.map(coerceToNumber)) : 0;
      case 'COUNT':
        return flat.filter((value) => value !== '' && value !== null && value !== undefined && !Number.isNaN(Number(value))).length;
      case 'IF':
        return rawArgs.length < 2 ? ERROR_ERR : (this.truthy(rawArgs[0]) ? rawArgs[1] : (rawArgs.length > 2 ? rawArgs[2] : false));
      case 'AND':
        return rawArgs.every((value) => this.truthy(value));
      case 'OR':
        return rawArgs.some((value) => this.truthy(value));
      case 'NOT':
        return rawArgs.length === 1 ? !this.truthy(rawArgs[0]) : ERROR_ERR;
      case 'ABS': {
        if (rawArgs.length !== 1) {
          return ERROR_ERR;
        }
        const value = coerceToNumber(rawArgs[0]);
        return isErrorValue(value) ? value : Math.abs(value);
      }
      case 'ROUND': {
        if (!rawArgs.length) {
          return ERROR_ERR;
        }
        const value = coerceToNumber(rawArgs[0]);
        const places = rawArgs.length > 1 ? coerceToNumber(rawArgs[1]) : 0;
        if (isErrorValue(value) || isErrorValue(places)) {
          return ERROR_ERR;
        }
        const factor = Math.pow(10, places);
        return Math.round(value * factor) / factor;
      }
      case 'CONCAT':
        return rawArgs.map((value) => coerceToText(value)).join('');
      default:
        return ERROR_ERR;
    }
  }

  truthy(value) {
    if (isErrorValue(value)) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (value === '' || value === null || value === undefined) {
      return false;
    }
    return String(value).length > 0;
  }

  formatValue(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === '' || value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(12)));
    }
    return String(value);
  }
}

module.exports = {
  FormulaEngine,
  shiftFormula,
  rewriteFormulaOnRowInsert,
  rewriteFormulaOnRowDelete,
  rewriteFormulaOnColumnInsert,
  rewriteFormulaOnColumnDelete,
  columnToIndex,
  indexToColumn,
};
