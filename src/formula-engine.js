const DEFAULT_MAX_COLUMNS = 26;
const DEFAULT_MAX_ROWS = 100;

const ERROR_CODES = {
  CIRC: '#CIRC!',
  DIV0: '#DIV/0!',
  ERR: '#ERR!',
  REF: '#REF!',
};

function createSpreadsheetEngine(options = {}) {
  const config = {
    maxColumns: options.maxColumns || DEFAULT_MAX_COLUMNS,
    maxRows: options.maxRows || DEFAULT_MAX_ROWS,
  };

  const cells = new Map();
  const dependencies = new Map();
  const dependents = new Map();
  const computed = new Map();

  function setCell(address, raw) {
    const ref = normalizeAddress(address, config);
    const value = String(raw ?? '');

    if (value === '') {
      cells.delete(ref);
    } else {
      cells.set(ref, { raw: value });
    }

    updateDependencies(ref, value);
    recomputeAll();
  }

  function getCellRaw(address) {
    const ref = normalizeAddress(address, config);
    return cells.get(ref)?.raw ?? '';
  }

  function getCellDisplay(address) {
    const ref = normalizeAddress(address, config);
    if (!computed.has(ref)) {
      recomputeAll();
    }

    const entry = computed.get(ref);
    if (!entry) {
      return '';
    }

    return formatValue(entry);
  }

  function translateFormula(formula, fromAddress, toAddress) {
    if (typeof formula !== 'string' || !formula.startsWith('=')) {
      return formula;
    }

    const from = parseAddress(normalizeAddress(fromAddress, config), config);
    const to = parseAddress(normalizeAddress(toAddress, config), config);
    const rowOffset = to.row - from.row;
    const columnOffset = to.column - from.column;
    const tokens = tokenize(formula.slice(1));

    return '=' + tokens.map((token) => {
      if (token.type !== 'REF') {
        return token.raw;
      }

      return shiftReferenceToken(token.raw, rowOffset, columnOffset, config);
    }).join('');
  }

  function recomputeAll() {
    computed.clear();
    const addresses = Array.from(new Set([...cells.keys(), ...dependencies.keys(), ...dependents.keys()])).sort(compareAddresses);
    for (const address of addresses) {
      evaluateCell(address, []);
    }
  }

  function evaluateCell(address, stack) {
    if (computed.has(address)) {
      return computed.get(address);
    }

    if (stack.includes(address)) {
      const cycle = new Set(stack.slice(stack.indexOf(address)).concat(address));
      for (const ref of cycle) {
        computed.set(ref, { type: 'error', value: ERROR_CODES.CIRC });
      }
      return computed.get(address);
    }

    const raw = cells.get(address)?.raw ?? '';
    let result;

    if (raw === '') {
      result = { type: 'blank', value: '' };
    } else if (!raw.startsWith('=')) {
      result = parseLiteral(raw);
    } else {
      try {
        const ast = parseFormula(raw.slice(1));
        const value = evaluateNode(ast, stack.concat(address));
        result = wrapScalar(value);
      } catch (error) {
        result = { type: 'error', value: error.code || ERROR_CODES.ERR };
      }
    }

    computed.set(address, result);
    return result;
  }

  function evaluateNode(node, stack) {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'string':
        return node.value;
      case 'boolean':
        return node.value;
      case 'unary':
        return -toNumber(evaluateNode(node.argument, stack));
      case 'binary':
        return evaluateBinary(node, stack);
      case 'ref':
        return scalarFromCell(node.address, stack);
      case 'bad-ref':
        throw spreadsheetError(ERROR_CODES.REF);
      case 'range':
        return expandRange(node.start, node.end, config).map((ref) => scalarFromCell(ref, stack));
      case 'call':
        return evaluateFunction(node, stack);
      default:
        throw spreadsheetError(ERROR_CODES.ERR);
    }
  }

  function scalarFromCell(address, stack) {
    const ref = normalizeAddress(address, config);
    const result = evaluateCell(ref, stack);
    if (result.type === 'error') {
      throw spreadsheetError(result.value);
    }
    if (result.type === 'blank') {
      return BLANK;
    }
    return result.value;
  }

  function evaluateBinary(node, stack) {
    if (node.operator === '&') {
      return toText(evaluateNode(node.left, stack)) + toText(evaluateNode(node.right, stack));
    }

    const left = evaluateNode(node.left, stack);
    const right = evaluateNode(node.right, stack);

    switch (node.operator) {
      case '+':
        return toNumber(left) + toNumber(right);
      case '-':
        return toNumber(left) - toNumber(right);
      case '*':
        return toNumber(left) * toNumber(right);
      case '/':
        if (toNumber(right) === 0) {
          throw spreadsheetError(ERROR_CODES.DIV0);
        }
        return toNumber(left) / toNumber(right);
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
        throw spreadsheetError(ERROR_CODES.ERR);
    }
  }

  function evaluateFunction(node, stack) {
    const name = node.name;
    const args = node.args.map((arg) => evaluateArgument(arg, stack));
    const flat = args.flat();

    switch (name) {
      case 'SUM':
        return flat.reduce((sum, value) => sum + toNumber(value), 0);
      case 'AVERAGE': {
        const values = flat.map((value) => toNumber(value));
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      }
      case 'MIN': {
        const values = flat.map((value) => toNumber(value));
        return values.length ? Math.min(...values) : 0;
      }
      case 'MAX': {
        const values = flat.map((value) => toNumber(value));
        return values.length ? Math.max(...values) : 0;
      }
      case 'COUNT':
        return flat.filter((value) => typeof value === 'number' && Number.isFinite(value)).length;
      case 'IF':
        return isTruthy(args[0]?.[0]) ? (args[1]?.[0] ?? BLANK) : (args[2]?.[0] ?? BLANK);
      case 'AND':
        return flat.every((value) => isTruthy(value));
      case 'OR':
        return flat.some((value) => isTruthy(value));
      case 'NOT':
        return !isTruthy(args[0]?.[0]);
      case 'ABS':
        return Math.abs(toNumber(args[0]?.[0]));
      case 'ROUND':
        return Math.round(toNumber(args[0]?.[0]));
      case 'CONCAT':
        return flat.map((value) => toText(value)).join('');
      default:
        throw spreadsheetError(ERROR_CODES.ERR);
    }
  }

  function evaluateArgument(node, stack) {
    if (node.type === 'range') {
      return expandRange(node.start, node.end, config).map((ref) => scalarFromCell(ref, stack));
    }
    return [evaluateNode(node, stack)];
  }

  function updateDependencies(address, raw) {
    const previous = dependencies.get(address) || new Set();
    for (const dep of previous) {
      dependents.get(dep)?.delete(address);
    }

    let next = new Set();
    if (raw.startsWith('=')) {
      try {
        next = collectDependencies(parseFormula(raw.slice(1)));
      } catch (_error) {
        next = new Set();
      }
    }

    dependencies.set(address, next);
    for (const dep of next) {
      if (!dependents.has(dep)) {
        dependents.set(dep, new Set());
      }
      dependents.get(dep).add(address);
    }
  }

  return {
    setCell,
    getCellRaw,
    getCellDisplay,
    translateFormula,
  };
}

const BLANK = Symbol('blank');

function parseLiteral(raw) {
  const trimmed = raw.trim();
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
    return { type: 'number', value: Number(trimmed) };
  }
  return { type: 'string', value: raw };
}

function wrapScalar(value) {
  if (value === BLANK) {
    return { type: 'blank', value: '' };
  }
  if (typeof value === 'number') {
    return { type: 'number', value };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }
  return { type: 'string', value: String(value) };
}

function formatValue(entry) {
  if (entry.type === 'error') {
    return entry.value;
  }
  if (entry.type === 'blank') {
    return '';
  }
  if (entry.type === 'boolean') {
    return entry.value ? 'TRUE' : 'FALSE';
  }
  if (entry.type === 'number') {
    if (Object.is(entry.value, -0)) {
      return '0';
    }
    return Number.isInteger(entry.value) ? String(entry.value) : String(Number(entry.value.toFixed(12)));
  }
  return entry.value;
}

function toNumber(value) {
  if (value === BLANK) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

function toText(value) {
  if (value === BLANK) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

function isTruthy(value) {
  if (value === BLANK) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return value !== '';
}

function compareValues(left, right) {
  const leftScalar = left === BLANK ? 0 : left;
  const rightScalar = right === BLANK ? 0 : right;
  if (typeof leftScalar === 'string' || typeof rightScalar === 'string') {
    return String(leftScalar).localeCompare(String(rightScalar));
  }
  if (leftScalar === rightScalar) {
    return 0;
  }
  return leftScalar < rightScalar ? -1 : 1;
}

function spreadsheetError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseFormula(source) {
  const parser = createParser(tokenize(source));
  const ast = parser.parseExpression();
  parser.expect('EOF');
  return ast;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ type: 'OP', value: two, raw: two });
      index += 2;
      continue;
    }

    if ('+-*/&=<>(),:'.includes(char)) {
      const type = char === '(' ? 'LPAREN'
        : char === ')' ? 'RPAREN'
        : char === ',' ? 'COMMA'
        : char === ':' ? 'COLON'
        : 'OP';
      tokens.push({ type, value: char, raw: char });
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
      if (end >= source.length) {
        throw spreadsheetError(ERROR_CODES.ERR);
      }
      const raw = source.slice(index, end + 1);
      tokens.push({ type: 'STRING', value, raw });
      index = end + 1;
      continue;
    }

    const numberMatch = source.slice(index).match(/^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push({ type: 'NUMBER', value: Number(numberMatch[0]), raw: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    const refMatch = source.slice(index).match(/^\$?[A-Z]+\$?\d+/);
    if (refMatch) {
      tokens.push({ type: 'REF', value: refMatch[0], raw: refMatch[0] });
      index += refMatch[0].length;
      continue;
    }

    const identMatch = source.slice(index).match(/^[A-Z_][A-Z0-9_]*/);
    if (identMatch) {
      tokens.push({ type: 'IDENT', value: identMatch[0], raw: identMatch[0] });
      index += identMatch[0].length;
      continue;
    }

    throw spreadsheetError(ERROR_CODES.ERR);
  }

  tokens.push({ type: 'EOF', value: '', raw: '' });
  return tokens;
}

function createParser(tokens) {
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consume(expectedType, expectedValue) {
    const token = tokens[index];
    if (!token || token.type !== expectedType || (expectedValue !== undefined && token.value !== expectedValue)) {
      throw spreadsheetError(ERROR_CODES.ERR);
    }
    index += 1;
    return token;
  }

  function match(type, value) {
    const token = peek();
    if (token && token.type === type && (value === undefined || token.value === value)) {
      index += 1;
      return token;
    }
    return null;
  }

  function parseExpression() {
    return parseComparison();
  }

  function parseComparison() {
    let node = parseConcat();
    while (peek().type === 'OP' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
      const operator = consume('OP').value;
      node = { type: 'binary', operator, left: node, right: parseConcat() };
    }
    return node;
  }

  function parseConcat() {
    let node = parseAdditive();
    while (peek().type === 'OP' && peek().value === '&') {
      consume('OP', '&');
      node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
    }
    return node;
  }

  function parseAdditive() {
    let node = parseMultiplicative();
    while (peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const operator = consume('OP').value;
      node = { type: 'binary', operator, left: node, right: parseMultiplicative() };
    }
    return node;
  }

  function parseMultiplicative() {
    let node = parseUnary();
    while (peek().type === 'OP' && (peek().value === '*' || peek().value === '/')) {
      const operator = consume('OP').value;
      node = { type: 'binary', operator, left: node, right: parseUnary() };
    }
    return node;
  }

  function parseUnary() {
    if (match('OP', '-')) {
      return { type: 'unary', argument: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();
    if (match('NUMBER')) {
      return { type: 'number', value: token.value };
    }
    if (match('STRING')) {
      return { type: 'string', value: token.value };
    }
    if (match('LPAREN')) {
      const node = parseExpression();
      consume('RPAREN');
      return node;
    }
    if (token.type === 'IDENT') {
      consume('IDENT');
      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'boolean', value: token.value === 'TRUE' };
      }
      if (match('LPAREN')) {
        const args = [];
        if (!match('RPAREN')) {
          do {
            args.push(parseExpression());
          } while (match('COMMA'));
          consume('RPAREN');
        }
        return { type: 'call', name: token.value, args };
      }
      throw spreadsheetError(ERROR_CODES.ERR);
    }
    if (token.type === 'REF') {
      consume('REF');
      if (match('COLON')) {
        const end = consume('REF').value;
        return makeRangeNode(token.value, end);
      }
      return makeRefNode(token.value);
    }
    throw spreadsheetError(ERROR_CODES.ERR);
  }

  return {
    parseExpression,
    expect(type) {
      consume(type);
    },
  };
}

function makeRefNode(token) {
  if (!isValidReferenceToken(token)) {
    return { type: 'bad-ref', address: token };
  }
  return { type: 'ref', address: normalizeReferenceToken(token) };
}

function makeRangeNode(start, end) {
  if (!isValidReferenceToken(start) || !isValidReferenceToken(end)) {
    return { type: 'bad-ref', address: `${start}:${end}` };
  }
  return {
    type: 'range',
    start: normalizeReferenceToken(start),
    end: normalizeReferenceToken(end),
  };
}

function collectDependencies(node, bucket = new Set()) {
  switch (node.type) {
    case 'ref':
      bucket.add(node.address);
      break;
    case 'range':
      for (const ref of expandRange(node.start, node.end, { maxColumns: DEFAULT_MAX_COLUMNS, maxRows: DEFAULT_MAX_ROWS })) {
        bucket.add(ref);
      }
      break;
    case 'binary':
      collectDependencies(node.left, bucket);
      collectDependencies(node.right, bucket);
      break;
    case 'unary':
      collectDependencies(node.argument, bucket);
      break;
    case 'call':
      for (const arg of node.args) {
        collectDependencies(arg, bucket);
      }
      break;
    default:
      break;
  }
  return bucket;
}

function isValidReferenceToken(token) {
  const match = token.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
  if (!match) {
    return false;
  }
  return match[2].length === 1;
}

function normalizeReferenceToken(token) {
  const match = token.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
  return `${match[1]}${match[2]}${match[3]}${match[4]}`;
}

function shiftReferenceToken(token, rowOffset, columnOffset, config) {
  const match = token.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
  if (!match || match[2].length !== 1) {
    return token;
  }

  const columnAbsolute = match[1] === '$';
  const rowAbsolute = match[3] === '$';
  const baseColumn = columnNameToIndex(match[2]);
  const baseRow = Number(match[4]) - 1;
  const nextColumn = columnAbsolute ? baseColumn : baseColumn + columnOffset;
  const nextRow = rowAbsolute ? baseRow : baseRow + rowOffset;

  if (nextColumn < 0 || nextColumn >= config.maxColumns || nextRow < 0 || nextRow >= config.maxRows) {
    return token;
  }

  return `${columnAbsolute ? '$' : ''}${indexToColumnName(nextColumn)}${rowAbsolute ? '$' : ''}${nextRow + 1}`;
}

function normalizeAddress(address, config) {
  const parsed = parseAddress(address, config);
  return `${indexToColumnName(parsed.column)}${parsed.row + 1}`;
}

function parseAddress(address, config) {
  const match = String(address).trim().toUpperCase().match(/^([A-Z])(\d+)$/);
  if (!match) {
    throw spreadsheetError(ERROR_CODES.REF);
  }
  const column = columnNameToIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (column < 0 || column >= config.maxColumns || row < 0 || row >= config.maxRows) {
    throw spreadsheetError(ERROR_CODES.REF);
  }
  return { column, row };
}

function expandRange(startAddress, endAddress, config) {
  const start = parseAddress(startAddress.replace(/\$/g, ''), config);
  const end = parseAddress(endAddress.replace(/\$/g, ''), config);
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const refs = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      refs.push(`${indexToColumnName(column)}${row + 1}`);
    }
  }
  return refs;
}

function compareAddresses(left, right) {
  const leftParsed = parseAddress(left, { maxColumns: DEFAULT_MAX_COLUMNS, maxRows: Number.MAX_SAFE_INTEGER });
  const rightParsed = parseAddress(right, { maxColumns: DEFAULT_MAX_COLUMNS, maxRows: Number.MAX_SAFE_INTEGER });
  if (leftParsed.row !== rightParsed.row) {
    return leftParsed.row - rightParsed.row;
  }
  return leftParsed.column - rightParsed.column;
}

function columnNameToIndex(name) {
  return name.charCodeAt(0) - 65;
}

function indexToColumnName(index) {
  return String.fromCharCode(65 + index);
}

module.exports = {
  createSpreadsheetEngine,
};
