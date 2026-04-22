const ERR = '#ERR!';
const DIV0 = '#DIV/0!';
const CIRC = '#CIRC!';
const REF = '#REF!';

function createSpreadsheetEngine() {
  const cells = new Map();

  function setCell(address, raw) {
    cells.set(normalizeAddress(address), raw == null ? '' : String(raw));
  }

  function getCellInput(address) {
    return cells.get(normalizeAddress(address)) || '';
  }

  function getDisplayValue(address) {
    const value = evaluateCell(normalizeAddress(address), new Set());
    return displayValue(value);
  }

  function evaluateCell(address, visiting) {
    if (visiting.has(address)) {
      return errorValue(CIRC);
    }

    const raw = getCellInput(address);
    if (!raw) {
      return emptyValue();
    }

    if (!raw.startsWith('=')) {
      return parseLiteral(raw);
    }

    visiting.add(address);
    try {
      const tokens = tokenize(raw.slice(1));
      const parser = createParser(tokens, {
        getCell(reference) {
          return evaluateCell(reference, visiting);
        },
        getRange(startRef, endRef) {
          return collectRange(startRef, endRef, visiting);
        },
      });
      const result = parser.parseExpression();
      if (!parser.isDone()) {
        return errorValue(ERR);
      }
      return result;
    } catch (error) {
      if (error && error.kind === 'spreadsheet-error') {
        return errorValue(error.code);
      }
      return errorValue(ERR);
    } finally {
      visiting.delete(address);
    }
  }

  function collectRange(startRef, endRef, visiting) {
    const start = addressToPoint(startRef);
    const end = addressToPoint(endRef);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const values = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        values.push(evaluateCell(pointToAddress(row, col), visiting));
      }
    }

    return values;
  }

  return {
    setCell,
    getCellInput,
    getDisplayValue,
  };
}

function shiftFormulaReferences(formula, rowDelta, colDelta) {
  return rewriteFormulaTokens(formula, (token) => {
    if (token.type !== 'reference') {
      return token.text;
    }
    return shiftReference(token.text, rowDelta, colDelta);
  });
}

function rewriteFormulaForStructuralChange(formula, change) {
  return rewriteFormulaTokens(formula, (token) => {
    if (token.type !== 'reference') {
      return token.text;
    }
    return rewriteReference(token.text, change);
  });
}

function rewriteFormulaTokens(formula, transform) {
  const tokens = tokenizeFormulaText(formula);
  return tokens.map(transform).join('');
}

function tokenizeFormulaText(formula) {
  const tokens = [];
  let index = 0;

  while (index < formula.length) {
    const char = formula[index];

    if (char === '"') {
      let end = index + 1;
      while (end < formula.length) {
        if (formula[end] === '"') {
          end += 1;
          if (formula[end] === '"') {
            end += 1;
            continue;
          }
          break;
        }
        end += 1;
      }
      tokens.push({ type: 'text', text: formula.slice(index, end) });
      index = end;
      continue;
    }

    const refMatch = /^(\$?[A-Z]+\$?\d+)(:\$?[A-Z]+\$?\d+)?/.exec(formula.slice(index));
    if (refMatch) {
      if (isReferenceBoundary(formula, index, refMatch[0].length)) {
        tokens.push({ type: 'reference', text: refMatch[0] });
        index += refMatch[0].length;
        continue;
      }
    }

    tokens.push({ type: 'text', text: char });
    index += 1;
  }

  return tokens;
}

function isReferenceBoundary(text, start, length) {
  const before = text[start - 1] || '';
  const after = text[start + length] || '';
  return !/[A-Z0-9_]/.test(before) && !/[A-Z0-9_]/.test(after);
}

function shiftReference(referenceText, rowDelta, colDelta) {
  if (referenceText.includes(':')) {
    const [start, end] = referenceText.split(':');
    return `${shiftReference(start, rowDelta, colDelta)}:${shiftReference(end, rowDelta, colDelta)}`;
  }

  const parsed = parseReferenceText(referenceText);
  const nextRow = parsed.absRow ? parsed.row : parsed.row + rowDelta;
  const nextCol = parsed.absCol ? parsed.col : parsed.col + colDelta;
  return formatReference({ ...parsed, row: nextRow, col: nextCol });
}

function rewriteReference(referenceText, change) {
  if (referenceText.includes(':')) {
    return rewriteRangeReference(referenceText, change);
  }

  const rewritten = applyStructuralChange(parseReferenceText(referenceText), change);
  return rewritten.deleted ? REF : formatReference(rewritten);
}

function rewriteRangeReference(referenceText, change) {
  const [startText, endText] = referenceText.split(':');
  const start = parseReferenceText(startText);
  const end = parseReferenceText(endText);
  const axis = change.type.endsWith('row') ? 'row' : 'col';

  if (change.type.startsWith('insert')) {
    const nextStart = applyStructuralChange(start, change);
    const nextEnd = applyStructuralChange(end, change);
    return `${formatReference(nextStart)}:${formatReference(nextEnd)}`;
  }

  const nextStart = { ...start };
  const nextEnd = { ...end };
  const low = Math.min(start[axis], end[axis]);
  const high = Math.max(start[axis], end[axis]);
  const removedStart = change.index;
  const removedEnd = change.index + change.count - 1;
  const newLow = rewriteRangeBoundaryLow(low, removedStart, removedEnd, change.count);
  const newHigh = rewriteRangeBoundaryHigh(high, removedStart, removedEnd, change.count);

  if (newLow > newHigh) {
    return REF;
  }

  nextStart[axis] = start[axis] <= end[axis] ? newLow : newHigh;
  nextEnd[axis] = start[axis] <= end[axis] ? newHigh : newLow;
  return `${formatReference(nextStart)}:${formatReference(nextEnd)}`;
}

function rewriteRangeBoundaryLow(value, removedStart, removedEnd, count) {
  if (value < removedStart) {
    return value;
  }
  if (value > removedEnd) {
    return value - count;
  }
  return removedStart;
}

function rewriteRangeBoundaryHigh(value, removedStart, removedEnd, count) {
  if (value < removedStart) {
    return value;
  }
  if (value > removedEnd) {
    return value - count;
  }
  return removedStart - 1;
}

function applyStructuralChange(reference, change) {
  const updated = { ...reference, deleted: false };
  const isRowChange = change.type === 'insert-row' || change.type === 'delete-row';
  const axis = isRowChange ? 'row' : 'col';
  const start = change.index;
  const end = change.index + change.count - 1;
  const value = updated[axis];

  if (change.type.startsWith('insert')) {
    if (value >= start) {
      updated[axis] = value + change.count;
    }
    return updated;
  }

  if (value < start) {
    return updated;
  }

  if (value <= end) {
    updated.deleted = true;
    return updated;
  }

  updated[axis] = value - change.count;
  return updated;
}

function createParser(tokens, context) {
  let index = 0;

  function current() {
    return tokens[index] || { type: 'eof', value: '' };
  }

  function consume(type, value) {
    const token = current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw spreadsheetError(ERR);
    }
    index += 1;
    return token;
  }

  function match(type, value) {
    const token = current();
    if (token.type === type && (value === undefined || token.value === value)) {
      index += 1;
      return true;
    }
    return false;
  }

  function parseExpression(precedence = 0) {
    let left = parsePrefix();

    while (true) {
      const token = current();
      const nextPrecedence = infixPrecedence(token);
      if (nextPrecedence <= precedence) {
        break;
      }
      index += 1;
      left = applyOperator(token.value, left, parseExpression(nextPrecedence));
    }

    return left;
  }

  function parsePrefix() {
    const token = current();
    index += 1;

    if (token.type === 'number') {
      return numberValue(token.value);
    }
    if (token.type === 'string') {
      return stringValue(token.value);
    }
    if (token.type === 'boolean') {
      return booleanValue(token.value);
    }
    if (token.type === 'reference') {
      if (match('operator', ':')) {
        const end = consume('reference').value;
        return rangeValue(context.getRange(token.value, end));
      }
      return context.getCell(token.value);
    }
    if (token.type === 'identifier') {
      consume('paren', '(');
      const args = [];
      if (!match('paren', ')')) {
        do {
          args.push(parseExpression());
        } while (match('comma', ','));
        consume('paren', ')');
      }
      return callFunction(token.value, args);
    }
    if (token.type === 'operator' && token.value === '-') {
      return numberValue(-toNumber(parseExpression(5)));
    }
    if (token.type === 'paren' && token.value === '(') {
      const expression = parseExpression();
      consume('paren', ')');
      return expression;
    }

    throw spreadsheetError(ERR);
  }

  return {
    parseExpression,
    isDone() {
      return current().type === 'eof';
    },
  };
}

function infixPrecedence(token) {
  if (token.type !== 'operator') {
    return 0;
  }
  if (['=', '<>', '<', '<=', '>', '>='].includes(token.value)) {
    return 1;
  }
  if (token.value === '&') {
    return 2;
  }
  if (token.value === '+' || token.value === '-') {
    return 3;
  }
  if (token.value === '*' || token.value === '/') {
    return 4;
  }
  return 0;
}

function applyOperator(operator, left, right) {
  if (isError(left)) {
    return left;
  }
  if (isError(right)) {
    return right;
  }

  switch (operator) {
    case '+':
      return numberValue(toNumber(left) + toNumber(right));
    case '-':
      return numberValue(toNumber(left) - toNumber(right));
    case '*':
      return numberValue(toNumber(left) * toNumber(right));
    case '/':
      if (toNumber(right) === 0) {
        return errorValue(DIV0);
      }
      return numberValue(toNumber(left) / toNumber(right));
    case '&':
      return stringValue(toText(left) + toText(right));
    case '=':
      return booleanValue(compareValues(left, right) === 0);
    case '<>':
      return booleanValue(compareValues(left, right) !== 0);
    case '<':
      return booleanValue(compareValues(left, right) < 0);
    case '<=':
      return booleanValue(compareValues(left, right) <= 0);
    case '>':
      return booleanValue(compareValues(left, right) > 0);
    case '>=':
      return booleanValue(compareValues(left, right) >= 0);
    default:
      throw spreadsheetError(ERR);
  }
}

function callFunction(name, args) {
  const upper = name.toUpperCase();
  const values = args.flatMap((arg) => (arg && arg.kind === 'range' ? arg.values : [arg]));

  if (values.some(isError)) {
    return values.find(isError);
  }

  switch (upper) {
    case 'SUM':
      return numberValue(values.reduce((sum, value) => sum + toNumber(value), 0));
    case 'AVERAGE':
      return numberValue(values.length ? values.reduce((sum, value) => sum + toNumber(value), 0) / values.length : 0);
    case 'MIN':
      return numberValue(values.length ? Math.min(...values.map(toNumber)) : 0);
    case 'MAX':
      return numberValue(values.length ? Math.max(...values.map(toNumber)) : 0);
    case 'COUNT':
      return numberValue(values.filter((value) => !isEmpty(value)).length);
    case 'IF':
      return toBoolean(args[0]) ? args[1] || emptyValue() : args[2] || emptyValue();
    case 'AND':
      return booleanValue(values.every((value) => toBoolean(value)));
    case 'OR':
      return booleanValue(values.some((value) => toBoolean(value)));
    case 'NOT':
      return booleanValue(!toBoolean(args[0] || emptyValue()));
    case 'ABS':
      return numberValue(Math.abs(toNumber(args[0] || emptyValue())));
    case 'ROUND': {
      const amount = toNumber(args[0] || emptyValue());
      const digits = Math.trunc(toNumber(args[1] || numberValue(0)));
      const factor = 10 ** digits;
      return numberValue(Math.round(amount * factor) / factor);
    }
    case 'CONCAT':
      return stringValue(values.map(toText).join(''));
    default:
      throw spreadsheetError(ERR);
  }
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const twoChar = expression.slice(index, index + 2);
    if (['<=', '>=', '<>'].includes(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar });
      index += 2;
      continue;
    }

    if ('+-*/&=<>:'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'comma', value: ',' });
      index += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }

    if (char === '"') {
      let value = '';
      index += 1;
      while (index < expression.length) {
        if (expression[index] === '"') {
          if (expression[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        value += expression[index];
        index += 1;
      }
      tokens.push({ type: 'string', value });
      continue;
    }

    const numberMatch = /^\d+(?:\.\d+)?/.exec(expression.slice(index));
    if (numberMatch) {
      tokens.push({ type: 'number', value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const refMatch = /^\$?[A-Z]+\$?\d+/.exec(expression.slice(index));
    if (refMatch) {
      tokens.push({ type: 'reference', value: normalizeAddress(refMatch[0]) });
      index += refMatch[0].length;
      continue;
    }

    const nameMatch = /^[A-Z_][A-Z0-9_]*/i.exec(expression.slice(index));
    if (nameMatch) {
      const upper = nameMatch[0].toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'boolean', value: upper === 'TRUE' });
      } else {
        tokens.push({ type: 'identifier', value: upper });
      }
      index += nameMatch[0].length;
      continue;
    }

    throw spreadsheetError(ERR);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function parseLiteral(raw) {
  if (/^[+-]?\d+(?:\.\d+)?$/.test(raw.trim())) {
    return numberValue(Number(raw));
  }
  return stringValue(raw);
}

function compareValues(left, right) {
  if (left.type === 'number' || right.type === 'number') {
    return numericCompare(toNumber(left), toNumber(right));
  }
  return textCompare(toText(left), toText(right));
}

function numericCompare(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function textCompare(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toNumber(value) {
  if (isError(value)) {
    throw spreadsheetError(value.code);
  }
  if (isEmpty(value)) {
    return 0;
  }
  if (value.kind === 'range') {
    return value.values.length ? toNumber(value.values[0]) : 0;
  }
  if (value.type === 'number') {
    return value.value;
  }
  if (value.type === 'boolean') {
    return value.value ? 1 : 0;
  }
  const parsed = Number(value.value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value) {
  if (isError(value)) {
    throw spreadsheetError(value.code);
  }
  if (isEmpty(value)) {
    return '';
  }
  if (value.kind === 'range') {
    return value.values.map(toText).join('');
  }
  if (value.type === 'boolean') {
    return value.value ? 'TRUE' : 'FALSE';
  }
  return String(value.value);
}

function toBoolean(value) {
  if (isError(value)) {
    throw spreadsheetError(value.code);
  }
  if (isEmpty(value)) {
    return false;
  }
  if (value.kind === 'range') {
    return value.values.some(toBoolean);
  }
  if (value.type === 'boolean') {
    return value.value;
  }
  if (value.type === 'number') {
    return value.value !== 0;
  }
  return value.value !== '';
}

function displayValue(value) {
  if (isError(value)) {
    return value.code;
  }
  if (isEmpty(value)) {
    return '';
  }
  if (value.type === 'boolean') {
    return value.value ? 'TRUE' : 'FALSE';
  }
  if (value.type === 'number') {
    if (Number.isInteger(value.value)) {
      return String(value.value);
    }
    return String(Number(value.value.toFixed(10)));
  }
  return String(value.value);
}

function parseReferenceText(text) {
  const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(text);
  if (!match) {
    throw spreadsheetError(ERR);
  }
  return {
    absCol: match[1] === '$',
    col: lettersToColumn(match[2]),
    absRow: match[3] === '$',
    row: Number(match[4]) - 1,
  };
}

function formatReference(reference) {
  return `${reference.absCol ? '$' : ''}${columnToLetters(reference.col)}${reference.absRow ? '$' : ''}${reference.row + 1}`;
}

function normalizeAddress(address) {
  return formatReference(parseReferenceText(address));
}

function addressToPoint(address) {
  const parsed = parseReferenceText(address);
  return { row: parsed.row, col: parsed.col };
}

function pointToAddress(row, col) {
  return `${columnToLetters(col)}${row + 1}`;
}

function lettersToColumn(letters) {
  let value = 0;
  for (const char of letters) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

function columnToLetters(column) {
  let value = column + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function spreadsheetError(code) {
  return { kind: 'spreadsheet-error', code };
}

function numberValue(value) {
  return { type: 'number', value };
}

function stringValue(value) {
  return { type: 'string', value };
}

function booleanValue(value) {
  return { type: 'boolean', value };
}

function errorValue(code) {
  return { type: 'error', code };
}

function emptyValue() {
  return { type: 'empty', value: '' };
}

function rangeValue(values) {
  return { kind: 'range', values };
}

function isError(value) {
  return value && value.type === 'error';
}

function isEmpty(value) {
  return value && value.type === 'empty';
}

if (typeof module !== 'undefined') {
  module.exports = {
    createSpreadsheetEngine,
    shiftFormulaReferences,
    rewriteFormulaForStructuralChange,
  };
}

if (typeof window !== 'undefined') {
  window.createSpreadsheetEngine = createSpreadsheetEngine;
}
