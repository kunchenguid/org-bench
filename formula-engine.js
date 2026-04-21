'use strict';

const ERROR_DIV_ZERO = '#DIV/0!';
const ERROR_REF = '#REF!';
const ERROR_CIRC = '#CIRC!';
const ERROR_GENERIC = '#ERR!';

const PRECEDENCE = {
  comparison: 1,
  concat: 2,
  additive: 3,
  multiplicative: 4,
  unary: 5,
  primary: 6,
};

function isDigit(char) {
  return char >= '0' && char <= '9';
}

function isLetter(char) {
  const upper = char.toUpperCase();
  return upper >= 'A' && upper <= 'Z';
}

function columnLabelToIndex(label) {
  let value = 0;
  const upper = label.toUpperCase();
  for (let index = 0; index < upper.length; index += 1) {
    value = (value * 26) + (upper.charCodeAt(index) - 64);
  }
  return value;
}

function columnIndexToLabel(index) {
  let value = index;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function parseAddress(address) {
  const match = /^([A-Z]+)([1-9][0-9]*)$/i.exec(String(address || '').trim());
  if (!match) {
    throw new Error('Invalid cell address: ' + address);
  }
  return {
    column: columnLabelToIndex(match[1]),
    row: Number(match[2]),
  };
}

function makeAddress(column, row) {
  return columnIndexToLabel(column) + String(row);
}

function cloneReference(reference) {
  return {
    kind: 'reference',
    column: reference.column,
    row: reference.row,
    columnAbsolute: reference.columnAbsolute,
    rowAbsolute: reference.rowAbsolute,
  };
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
      while (index < input.length) {
        const next = input[index];
        if (next === '"') {
          if (input[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        value += next;
        index += 1;
      }
      tokens.push({ type: 'string', value });
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(input[index + 1]))) {
      let end = index + 1;
      while (end < input.length && isDigit(input[end])) {
        end += 1;
      }
      if (input[end] === '.') {
        end += 1;
        while (end < input.length && isDigit(input[end])) {
          end += 1;
        }
      }
      tokens.push({ type: 'number', value: Number(input.slice(index, end)) });
      index = end;
      continue;
    }

    const doubled = input.slice(index, index + 2);
    if (doubled === '<=' || doubled === '>=' || doubled === '<>') {
      tokens.push({ type: 'operator', value: doubled });
      index += 2;
      continue;
    }

    if ('+-*/&=<>(),:'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if (char === '$') {
      tokens.push({ type: 'dollar', value: char });
      index += 1;
      continue;
    }

    if (isLetter(char)) {
      let end = index + 1;
      while (end < input.length && isLetter(input[end])) {
        end += 1;
      }
      while (end < input.length && isDigit(input[end])) {
        end += 1;
      }
      tokens.push({ type: 'identifier', value: input.slice(index, end).toUpperCase() });
      index = end;
      continue;
    }

    throw new Error('Unexpected token: ' + char);
  }

  return tokens;
}

function parseFormulaAst(formulaText) {
  const source = formulaText[0] === '=' ? formulaText.slice(1) : formulaText;
  const tokens = tokenize(source);
  let index = 0;

  function peek(offset) {
    return tokens[index + (offset || 0)] || null;
  }

  function match(type, value) {
    const token = peek();
    if (!token || token.type !== type) {
      return null;
    }
    if (value != null && token.value !== value) {
      return null;
    }
    index += 1;
    return token;
  }

  function expect(type, value) {
    const token = match(type, value);
    if (!token) {
      throw new Error('Unexpected token');
    }
    return token;
  }

  function tryParseReference() {
    const start = index;
    const columnAbsolute = Boolean(match('dollar'));
    const identifier = match('identifier');
    if (!identifier) {
      index = start;
      return null;
    }
    const cellMatch = /^([A-Z]+)([1-9][0-9]*)$/.exec(identifier.value);
    if (cellMatch) {
      const rowAbsolute = Boolean(match('dollar'));
      if (!rowAbsolute && /^[A-Z]+$/.test(identifier.value)) {
        index = start;
        return null;
      }
      if (rowAbsolute) {
        const rowToken = match('number') || match('identifier');
        if (!rowToken || !/^\d+$/.test(String(rowToken.value))) {
          index = start;
          return null;
        }
      }
      return {
        kind: 'reference',
        column: columnLabelToIndex(cellMatch[1]),
        row: Number(cellMatch[2]),
        columnAbsolute,
        rowAbsolute: false,
      };
    }
    if (!/^[A-Z]+$/.test(identifier.value)) {
      index = start;
      return null;
    }
    const rowDollar = Boolean(match('dollar'));
    const rowToken = match('number');
    if (!rowToken) {
      index = start;
      return null;
    }
    return {
      kind: 'reference',
      column: columnLabelToIndex(identifier.value),
      row: rowToken.value,
      columnAbsolute,
      rowAbsolute: rowDollar,
    };
  }

  function parsePrimary() {
    const reference = tryParseReference();
    if (reference) {
      if (match('operator', ':')) {
        const endReference = tryParseReference();
        if (!endReference) {
          throw new Error('Invalid range');
        }
        return {
          kind: 'range',
          start: reference,
          end: endReference,
        };
      }
      return reference;
    }

    const number = match('number');
    if (number) {
      return { kind: 'number', value: number.value };
    }

    const string = match('string');
    if (string) {
      return { kind: 'string', value: string.value };
    }

    const identifier = match('identifier');
    if (identifier) {
      if (identifier.value === 'TRUE' || identifier.value === 'FALSE') {
        return {
          kind: 'boolean',
          value: identifier.value === 'TRUE',
        };
      }
      if (match('operator', '(')) {
        const args = [];
        if (!match('operator', ')')) {
          do {
            args.push(parseExpression());
          } while (match('operator', ','));
          expect('operator', ')');
        }
        return {
          kind: 'call',
          name: identifier.value,
          args,
        };
      }
      throw new Error('Unknown identifier');
    }

    if (match('operator', '(')) {
      const expression = parseExpression();
      expect('operator', ')');
      return expression;
    }

    throw new Error('Unexpected primary');
  }

  function parseUnary() {
    if (match('operator', '-')) {
      return {
        kind: 'unary',
        operator: '-',
        argument: parseUnary(),
      };
    }
    return parsePrimary();
  }

  function parseBinary(nextParser, operators, kind) {
    let left = nextParser();
    let token = peek();
    while (token && token.type === 'operator' && operators.includes(token.value)) {
      index += 1;
      left = {
        kind: 'binary',
        operator: token.value,
        left,
        right: nextParser(),
        precedence: PRECEDENCE[kind],
      };
      token = peek();
    }
    return left;
  }

  function parseMultiplicative() {
    return parseBinary(parseUnary, ['*', '/'], 'multiplicative');
  }

  function parseAdditive() {
    return parseBinary(parseMultiplicative, ['+', '-'], 'additive');
  }

  function parseConcat() {
    return parseBinary(parseAdditive, ['&'], 'concat');
  }

  function parseComparison() {
    return parseBinary(parseConcat, ['=', '<>', '<', '<=', '>', '>='], 'comparison');
  }

  function parseExpression() {
    return parseComparison();
  }

  const ast = parseExpression();
  if (index !== tokens.length) {
    throw new Error('Unexpected trailing tokens');
  }
  return ast;
}

function flattenArgs(values) {
  const flattened = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        flattened.push(item);
      }
    } else {
      flattened.push(value);
    }
  }
  return flattened;
}

function makeScalar(type, value, blank) {
  return { kind: 'scalar', type, value, blank: Boolean(blank) };
}

function makeError(error) {
  return { kind: 'error', error };
}

function asNumber(result) {
  if (result.kind === 'error') {
    return result;
  }
  if (result.kind !== 'scalar') {
    return makeError(ERROR_GENERIC);
  }
  if (result.blank) {
    return makeScalar('number', 0, true);
  }
  if (result.type === 'number') {
    return result;
  }
  if (result.type === 'boolean') {
    return makeScalar('number', result.value ? 1 : 0);
  }
  if (result.type === 'text' && result.value === '') {
    return makeScalar('number', 0, true);
  }
  const parsed = Number(result.value);
  return Number.isFinite(parsed) ? makeScalar('number', parsed) : makeError(ERROR_GENERIC);
}

function asText(result) {
  if (result.kind === 'error') {
    return result;
  }
  if (result.kind !== 'scalar') {
    return makeError(ERROR_GENERIC);
  }
  if (result.blank) {
    return makeScalar('text', '', true);
  }
  if (result.type === 'text') {
    return result;
  }
  if (result.type === 'boolean') {
    return makeScalar('text', result.value ? 'TRUE' : 'FALSE');
  }
  return makeScalar('text', String(result.value));
}

function asBoolean(result) {
  if (result.kind === 'error') {
    return result;
  }
  if (result.kind !== 'scalar') {
    return makeError(ERROR_GENERIC);
  }
  if (result.blank) {
    return makeScalar('boolean', false, true);
  }
  if (result.type === 'boolean') {
    return result;
  }
  if (result.type === 'number') {
    return makeScalar('boolean', result.value !== 0);
  }
  return makeScalar('boolean', result.value !== '');
}

function toComparable(result) {
  if (result.kind === 'error') {
    return result;
  }
  if (result.kind !== 'scalar') {
    return makeError(ERROR_GENERIC);
  }
  if (result.blank) {
    return makeScalar('number', 0, true);
  }
  return result;
}

function normalizeExternalValue(value) {
  if (value && typeof value === 'object' && value.kind === 'error') {
    return value;
  }
  if (value && typeof value === 'object' && value.kind === 'scalar') {
    return value;
  }
  if (value == null) {
    return makeScalar('number', 0, true);
  }
  if (typeof value === 'number') {
    return makeScalar('number', value);
  }
  if (typeof value === 'boolean') {
    return makeScalar('boolean', value);
  }
  if (typeof value === 'string') {
    return makeScalar('text', value);
  }
  return makeError(ERROR_GENERIC);
}

function compareScalars(left, right, operator) {
  const leftComparable = toComparable(left);
  if (leftComparable.kind === 'error') {
    return leftComparable;
  }
  const rightComparable = toComparable(right);
  if (rightComparable.kind === 'error') {
    return rightComparable;
  }

  let outcome;
  if (leftComparable.type === 'text' || rightComparable.type === 'text') {
    const leftText = asText(leftComparable);
    const rightText = asText(rightComparable);
    if (leftText.kind === 'error') {
      return leftText;
    }
    if (rightText.kind === 'error') {
      return rightText;
    }
    if (operator === '=') outcome = leftText.value === rightText.value;
    if (operator === '<>') outcome = leftText.value !== rightText.value;
    if (operator === '<') outcome = leftText.value < rightText.value;
    if (operator === '<=') outcome = leftText.value <= rightText.value;
    if (operator === '>') outcome = leftText.value > rightText.value;
    if (operator === '>=') outcome = leftText.value >= rightText.value;
  } else {
    const leftNumber = asNumber(leftComparable);
    const rightNumber = asNumber(rightComparable);
    if (leftNumber.kind === 'error') {
      return leftNumber;
    }
    if (rightNumber.kind === 'error') {
      return rightNumber;
    }
    if (operator === '=') outcome = leftNumber.value === rightNumber.value;
    if (operator === '<>') outcome = leftNumber.value !== rightNumber.value;
    if (operator === '<') outcome = leftNumber.value < rightNumber.value;
    if (operator === '<=') outcome = leftNumber.value <= rightNumber.value;
    if (operator === '>') outcome = leftNumber.value > rightNumber.value;
    if (operator === '>=') outcome = leftNumber.value >= rightNumber.value;
  }

  return makeScalar('boolean', Boolean(outcome));
}

function buildRangeAddresses(start, end) {
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const addresses = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      addresses.push(makeAddress(column, row));
    }
  }
  return addresses;
}

function callFunction(name, args) {
  const values = flattenArgs(args);
  if (values.some((value) => value && value.kind === 'error')) {
    return values.find((value) => value && value.kind === 'error');
  }

  const upper = name.toUpperCase();

  if (upper === 'SUM') {
    let total = 0;
    for (const value of values) {
      const numeric = asNumber(value);
      if (numeric.kind === 'error') return numeric;
      total += numeric.value;
    }
    return makeScalar('number', total);
  }

  if (upper === 'AVERAGE') {
    if (values.length === 0) {
      return makeScalar('number', 0);
    }
    let total = 0;
    for (const value of values) {
      const numeric = asNumber(value);
      if (numeric.kind === 'error') return numeric;
      total += numeric.value;
    }
    return makeScalar('number', total / values.length);
  }

  if (upper === 'MIN' || upper === 'MAX') {
    if (values.length === 0) {
      return makeScalar('number', 0);
    }
    const numerics = [];
    for (const value of values) {
      const numeric = asNumber(value);
      if (numeric.kind === 'error') return numeric;
      numerics.push(numeric.value);
    }
    return makeScalar('number', upper === 'MIN' ? Math.min(...numerics) : Math.max(...numerics));
  }

  if (upper === 'COUNT') {
    let count = 0;
    for (const value of values) {
      if (value.kind !== 'scalar' || value.blank) {
        continue;
      }
      if (value.type === 'number') {
        count += 1;
      }
    }
    return makeScalar('number', count);
  }

  if (upper === 'IF') {
    if (args.length < 2) {
      return makeError(ERROR_GENERIC);
    }
    const condition = asBoolean(args[0]);
    if (condition.kind === 'error') return condition;
    return condition.value ? (args[1] || makeScalar('text', '')) : (args[2] || makeScalar('text', ''));
  }

  if (upper === 'AND' || upper === 'OR') {
    let result = upper === 'AND';
    for (const value of values) {
      const booleanValue = asBoolean(value);
      if (booleanValue.kind === 'error') return booleanValue;
      if (upper === 'AND') {
        result = result && booleanValue.value;
      } else {
        result = result || booleanValue.value;
      }
    }
    return makeScalar('boolean', result);
  }

  if (upper === 'NOT') {
    if (args.length !== 1) {
      return makeError(ERROR_GENERIC);
    }
    const booleanValue = asBoolean(args[0]);
    if (booleanValue.kind === 'error') return booleanValue;
    return makeScalar('boolean', !booleanValue.value);
  }

  if (upper === 'ABS') {
    if (args.length !== 1) {
      return makeError(ERROR_GENERIC);
    }
    const numeric = asNumber(args[0]);
    if (numeric.kind === 'error') return numeric;
    return makeScalar('number', Math.abs(numeric.value));
  }

  if (upper === 'ROUND') {
    if (args.length < 1 || args.length > 2) {
      return makeError(ERROR_GENERIC);
    }
    const numeric = asNumber(args[0]);
    if (numeric.kind === 'error') return numeric;
    const places = args[1] ? asNumber(args[1]) : makeScalar('number', 0);
    if (places.kind === 'error') return places;
    const factor = 10 ** places.value;
    return makeScalar('number', Math.round(numeric.value * factor) / factor);
  }

  if (upper === 'CONCAT') {
    let text = '';
    for (const value of values) {
      const scalar = asText(value);
      if (scalar.kind === 'error') return scalar;
      text += scalar.value;
    }
    return makeScalar('text', text);
  }

  return makeError(ERROR_GENERIC);
}

function evaluateAst(ast, context, dependencies) {
  if (ast.kind === 'number') {
    return makeScalar('number', ast.value);
  }
  if (ast.kind === 'string') {
    return makeScalar('text', ast.value);
  }
  if (ast.kind === 'boolean') {
    return makeScalar('boolean', ast.value);
  }
  if (ast.kind === 'errorLiteral') {
    return makeError(ast.error);
  }
  if (ast.kind === 'reference') {
    const address = makeAddress(ast.column, ast.row);
    dependencies.add(address);
    const value = context.getCellValue ? context.getCellValue(address) : null;
    return normalizeExternalValue(value);
  }
  if (ast.kind === 'range') {
    const addresses = buildRangeAddresses(ast.start, ast.end);
    return addresses.map((address) => {
      dependencies.add(address);
      const value = context.getCellValue ? context.getCellValue(address) : null;
      return normalizeExternalValue(value);
    });
  }
  if (ast.kind === 'unary') {
    const argument = asNumber(evaluateAst(ast.argument, context, dependencies));
    if (argument.kind === 'error') {
      return argument;
    }
    return makeScalar('number', -argument.value);
  }
  if (ast.kind === 'call') {
    const args = ast.args.map((arg) => evaluateAst(arg, context, dependencies));
    return callFunction(ast.name, args);
  }
  if (ast.kind === 'binary') {
    const left = evaluateAst(ast.left, context, dependencies);
    const right = evaluateAst(ast.right, context, dependencies);
    if (left.kind === 'error') return left;
    if (right.kind === 'error') return right;

    if (ast.operator === '&') {
      const leftText = asText(left);
      const rightText = asText(right);
      if (leftText.kind === 'error') return leftText;
      if (rightText.kind === 'error') return rightText;
      return makeScalar('text', leftText.value + rightText.value);
    }

    if (['=', '<>', '<', '<=', '>', '>='].includes(ast.operator)) {
      return compareScalars(left, right, ast.operator);
    }

    const leftNumber = asNumber(left);
    const rightNumber = asNumber(right);
    if (leftNumber.kind === 'error') return leftNumber;
    if (rightNumber.kind === 'error') return rightNumber;

    if (ast.operator === '+') {
      return makeScalar('number', leftNumber.value + rightNumber.value);
    }
    if (ast.operator === '-') {
      return makeScalar('number', leftNumber.value - rightNumber.value);
    }
    if (ast.operator === '*') {
      return makeScalar('number', leftNumber.value * rightNumber.value);
    }
    if (ast.operator === '/') {
      if (rightNumber.value === 0) {
        return makeError(ERROR_DIV_ZERO);
      }
      return makeScalar('number', leftNumber.value / rightNumber.value);
    }
  }

  return makeError(ERROR_GENERIC);
}

function formatScalar(result) {
  if (result.kind === 'error') {
    return result.error;
  }
  if (result.kind !== 'scalar') {
    return ERROR_GENERIC;
  }
  if (result.blank) {
    return '';
  }
  if (result.type === 'boolean') {
    return result.value ? 'TRUE' : 'FALSE';
  }
  return String(result.value);
}

function evaluateFormula(formulaText, context) {
  try {
    const ast = parseFormulaAst(formulaText);
    const dependencies = new Set();
    const result = evaluateAst(ast, context || {}, dependencies);
    if (result.kind === 'error') {
      return {
        type: 'error',
        value: result.error,
        error: result.error,
        dependencies: Array.from(dependencies),
      };
    }
    return {
      type: result.type,
      value: result.value,
      dependencies: Array.from(dependencies),
    };
  } catch (_error) {
    return {
      type: 'error',
      value: ERROR_GENERIC,
      error: ERROR_GENERIC,
      dependencies: [],
    };
  }
}

function transformReference(reference, transformer) {
  return transformer(cloneReference(reference));
}

function transformAst(node, transformer) {
  if (node.kind === 'reference') {
    return transformReference(node, transformer);
  }
  if (node.kind === 'range') {
    return {
      kind: 'range',
      start: transformReference(node.start, transformer),
      end: transformReference(node.end, transformer),
    };
  }
  if (node.kind === 'binary') {
    return {
      kind: 'binary',
      operator: node.operator,
      precedence: node.precedence,
      left: transformAst(node.left, transformer),
      right: transformAst(node.right, transformer),
    };
  }
  if (node.kind === 'unary') {
    return {
      kind: 'unary',
      operator: node.operator,
      argument: transformAst(node.argument, transformer),
    };
  }
  if (node.kind === 'call') {
    return {
      kind: 'call',
      name: node.name,
      args: node.args.map((arg) => transformAst(arg, transformer)),
    };
  }
  return node;
}

function renderReference(reference) {
  if (reference.kind === 'errorLiteral') {
    return reference.error;
  }
  return (reference.columnAbsolute ? '$' : '') + columnIndexToLabel(reference.column) + (reference.rowAbsolute ? '$' : '') + String(reference.row);
}

function renderAst(node, parentPrecedence) {
  if (node.kind === 'number') {
    return String(node.value);
  }
  if (node.kind === 'string') {
    return '"' + node.value.replace(/"/g, '""') + '"';
  }
  if (node.kind === 'boolean') {
    return node.value ? 'TRUE' : 'FALSE';
  }
  if (node.kind === 'errorLiteral') {
    return node.error;
  }
  if (node.kind === 'reference') {
    return renderReference(node);
  }
  if (node.kind === 'range') {
    return renderAst(node.start, PRECEDENCE.primary) + ':' + renderAst(node.end, PRECEDENCE.primary);
  }
  if (node.kind === 'call') {
    return node.name + '(' + node.args.map((arg) => renderAst(arg, 0)).join(',') + ')';
  }
  if (node.kind === 'unary') {
    const rendered = '-' + renderAst(node.argument, PRECEDENCE.unary);
    return parentPrecedence && parentPrecedence > PRECEDENCE.unary ? '(' + rendered + ')' : rendered;
  }
  if (node.kind === 'binary') {
    const precedence = node.precedence || PRECEDENCE.additive;
    const rendered = renderAst(node.left, precedence) + node.operator + renderAst(node.right, precedence + (node.operator === '^' ? -1 : 0));
    return parentPrecedence && parentPrecedence > precedence ? '(' + rendered + ')' : rendered;
  }
  return '';
}

function rebaseFormula(formulaText, fromAddress, toAddress) {
  const from = parseAddress(fromAddress);
  const to = parseAddress(toAddress);
  const rowDelta = to.row - from.row;
  const columnDelta = to.column - from.column;
  const ast = parseFormulaAst(formulaText);
  const transformed = transformAst(ast, (reference) => ({
    kind: 'reference',
    column: reference.columnAbsolute ? reference.column : reference.column + columnDelta,
    row: reference.rowAbsolute ? reference.row : reference.row + rowDelta,
    columnAbsolute: reference.columnAbsolute,
    rowAbsolute: reference.rowAbsolute,
  }));
  return '=' + renderAst(transformed, 0);
}

function updateReferenceForMutation(reference, mutation, axis) {
  const start = mutation.index;
  const end = mutation.index + mutation.count - 1;
  const value = axis === 'row' ? reference.row : reference.column;
  const absolute = axis === 'row' ? reference.rowAbsolute : reference.columnAbsolute;
  if (absolute) {
    return reference;
  }

  if (mutation.type === 'insert-row' && axis === 'row' && value >= start) {
    reference.row += mutation.count;
  }
  if (mutation.type === 'insert-column' && axis === 'column' && value >= start) {
    reference.column += mutation.count;
  }
  if (mutation.type === 'delete-row' && axis === 'row') {
    if (value >= start && value <= end) {
      return { kind: 'errorLiteral', error: ERROR_REF };
    }
    if (value > end) {
      reference.row -= mutation.count;
    }
  }
  if (mutation.type === 'delete-column' && axis === 'column') {
    if (value >= start && value <= end) {
      return { kind: 'errorLiteral', error: ERROR_REF };
    }
    if (value > end) {
      reference.column -= mutation.count;
    }
  }
  return reference;
}

function updateFormulaReferences(formulaText, mutation) {
  const ast = parseFormulaAst(formulaText);
  const transformed = transformAst(ast, (reference) => {
    let next = cloneReference(reference);
    next = updateReferenceForMutation(next, mutation, 'row');
    if (next.kind === 'errorLiteral') {
      return next;
    }
    next = updateReferenceForMutation(next, mutation, 'column');
    return next;
  });
  return '=' + renderAst(transformed, 0);
}

function createSpreadsheetEngine() {
  const rawCells = new Map();
  const computedCells = new Map();

  function coerceLiteral(raw) {
    const trimmed = String(raw || '');
    if (trimmed === '') {
      return { type: 'blank', value: '', display: '', dependencies: [] };
    }
    if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
      return {
        type: 'number',
        value: Number(trimmed),
        display: String(Number(trimmed)),
        dependencies: [],
      };
    }
    return {
      type: 'text',
      value: trimmed,
      display: trimmed,
      dependencies: [],
    };
  }

  function evaluateCell(address, visiting) {
    if (computedCells.has(address)) {
      return computedCells.get(address);
    }

    const raw = rawCells.get(address) || '';
    if (!raw.startsWith('=')) {
      const literal = coerceLiteral(raw);
      computedCells.set(address, literal);
      return literal;
    }

    if (visiting.has(address)) {
      const circular = { type: 'error', value: ERROR_CIRC, display: ERROR_CIRC, dependencies: [] };
      computedCells.set(address, circular);
      return circular;
    }

    visiting.add(address);
    const result = evaluateFormula(raw, {
      getCellValue(referenceAddress) {
        const evaluated = evaluateCell(referenceAddress, visiting);
        if (evaluated.type === 'error') {
          return makeError(evaluated.value);
        }
        if (evaluated.type === 'blank') {
          return null;
        }
        return evaluated.value;
      },
    });
    visiting.delete(address);

    const computed = result.type === 'error'
      ? { type: 'error', value: result.value, display: result.value, dependencies: result.dependencies }
      : { type: result.type, value: result.value, display: formatScalar(makeScalar(result.type, result.value)), dependencies: result.dependencies };
    computedCells.set(address, computed);
    return computed;
  }

  function recalculate() {
    computedCells.clear();
    for (const address of rawCells.keys()) {
      evaluateCell(address, new Set());
    }
  }

  return {
    setCell(address, raw) {
      rawCells.set(address, String(raw || ''));
      recalculate();
    },
    getCell(address) {
      const raw = rawCells.get(address) || '';
      const computed = computedCells.get(address) || evaluateCell(address, new Set());
      return {
        raw,
        type: computed.type,
        value: computed.type === 'error' ? computed.display : computed.value,
        display: computed.display,
        dependencies: computed.dependencies,
      };
    },
    getDisplayValue(address) {
      return this.getCell(address).display;
    },
    getDependencies(address) {
      return this.getCell(address).dependencies.slice();
    },
  };
}

const api = {
  createSpreadsheetEngine,
  evaluateFormula,
  rebaseFormula,
  updateFormulaReferences,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.FormulaEngine = api;
}
