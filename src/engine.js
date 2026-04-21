class SpreadsheetEngine {
  constructor() {
    this.cells = new Map();
  }

  setCell(address, raw) {
    this.cells.set(normalizeAddress(address), String(raw));
  }

  getRawCell(address) {
    return this.cells.get(normalizeAddress(address)) || '';
  }

  getDisplayValue(address) {
    return this.evaluateCell(normalizeAddress(address), new Set());
  }

  evaluateCell(address, stack) {
    const raw = this.getRawCell(address);
    if (!raw) {
      return '';
    }

    if (!raw.startsWith('=')) {
      const trimmed = raw.trim();
      if (trimmed && !Number.isNaN(Number(trimmed))) {
        return Number(trimmed);
      }
      return raw;
    }

    if (stack.has(address)) {
      return '#CIRC!';
    }

    stack.add(address);
    const parser = new Parser(raw.slice(1), {
      resolveCell: (ref) => {
        const value = this.evaluateCell(ref, stack);
        if (value === '' || value == null) {
          return 0;
        }
        return value;
      },
      resolveRange: (start, end) => expandRange(start, end).map((ref) => {
        const value = this.evaluateCell(ref, stack);
        return value === '' || value == null ? 0 : value;
      }),
    });

    let value;
    try {
      value = parser.parse();
    } catch {
      value = '#ERR!';
    }
    stack.delete(address);
    return value;
  }
}

class Parser {
  constructor(source, runtime) {
    this.tokens = tokenize(source);
    this.index = 0;
    this.runtime = runtime;
  }

  parse() {
    const value = this.parseExpression();
    if (this.peek().type !== 'eof') {
      throw new Error('Unexpected token');
    }
    return value;
  }

  parseExpression() {
    let left = this.parseTerm();
    while (this.match('operator', '+') || this.match('operator', '-')) {
      const operator = this.previous().value;
      const right = this.parseTerm();
      left = operator === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
    }
    return left;
  }

  parseTerm() {
    let left = this.parseUnary();
    while (this.match('operator', '*') || this.match('operator', '/')) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      left = operator === '*' ? toNumber(left) * toNumber(right) : toNumber(left) / toNumber(right);
    }
    return left;
  }

  parseUnary() {
    if (this.match('operator', '-')) {
      return -toNumber(this.parseUnary());
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.match('number')) {
      return Number(this.previous().value);
    }

    if (this.match('identifier')) {
      const identifier = this.previous().value;
      if (this.match('paren', '(')) {
        return this.parseFunctionCall(identifier);
      }
      return this.runtime.resolveCell(identifier);
    }

    if (this.match('paren', '(')) {
      const value = this.parseExpression();
      this.consume('paren', ')');
      return value;
    }

    throw new Error('Unexpected token');
  }

  parseFunctionCall(name) {
    const args = [];
    if (!this.check('paren', ')')) {
      do {
        args.push(this.parseArgument());
      } while (this.match('comma'));
    }
    this.consume('paren', ')');

    const flatArgs = args.flat();
    switch (name) {
      case 'SUM':
        return flatArgs.reduce((sum, value) => sum + toNumber(value), 0);
      case 'AVERAGE':
        return flatArgs.reduce((sum, value) => sum + toNumber(value), 0) / flatArgs.length;
      default:
        throw new Error('Unknown function');
    }
  }

  parseArgument() {
    if (this.check('identifier') && this.checkNext('colon')) {
      const start = this.advance().value;
      this.advance();
      const end = this.consume('identifier').value;
      return this.runtime.resolveRange(start, end);
    }

    if (this.check('identifier') && this.checkNext('colon', 1)) {
      const start = this.advance().value;
      this.advance();
      const end = this.consume('identifier').value;
      return this.runtime.resolveRange(start, end);
    }

    return this.parseExpression();
  }

  match(type, value) {
    if (this.check(type, value)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  consume(type, value) {
    if (this.check(type, value)) {
      return this.tokens[this.index++];
    }
    throw new Error('Unexpected token');
  }

  check(type, value) {
    const token = this.peek();
    if (token.type !== type) {
      return false;
    }
    return value === undefined || token.value === value;
  }

  checkNext(type, offset = 1) {
    const token = this.tokens[this.index + offset];
    return Boolean(token && token.type === type);
  }

  advance() {
    return this.tokens[this.index++];
  }

  peek() {
    return this.tokens[this.index];
  }

  previous() {
    return this.tokens[this.index - 1];
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

    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[0-9.]/.test(source[end])) {
        end += 1;
      }
      tokens.push({ type: 'number', value: source.slice(index, end) });
      index = end;
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9]/.test(source[end])) {
        end += 1;
      }
      tokens.push({ type: 'identifier', value: source.slice(index, end).toUpperCase() });
      index = end;
      continue;
    }

    if ('+-*/'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if ('()'.includes(char)) {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      index += 1;
      continue;
    }

    if (char === ':') {
      tokens.push({ type: 'colon', value: char });
      index += 1;
      continue;
    }

    throw new Error('Unsupported token');
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function normalizeAddress(address) {
  return String(address).trim().toUpperCase();
}

function toNumber(value) {
  if (value === '#CIRC!') {
    return value;
  }
  return Number(value) || 0;
}

function expandRange(start, end) {
  const startRef = splitAddress(start);
  const endRef = splitAddress(end);
  const refs = [];

  for (let row = Math.min(startRef.row, endRef.row); row <= Math.max(startRef.row, endRef.row); row += 1) {
    for (let column = Math.min(startRef.column, endRef.column); column <= Math.max(startRef.column, endRef.column); column += 1) {
      refs.push(`${columnToLabel(column)}${row}`);
    }
  }

  return refs;
}

function splitAddress(address) {
  const match = /^([A-Z]+)([0-9]+)$/.exec(normalizeAddress(address));
  if (!match) {
    throw new Error('Invalid address');
  }

  return {
    column: labelToColumn(match[1]),
    row: Number(match[2]),
  };
}

function labelToColumn(label) {
  let column = 0;
  for (const char of label) {
    column = column * 26 + (char.charCodeAt(0) - 64);
  }
  return column;
}

function columnToLabel(column) {
  let value = column;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

module.exports = {
  SpreadsheetEngine,
};
