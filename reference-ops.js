function rewriteFormulaReferences(formula, operation) {
  let result = '';

  for (let index = 0; index < formula.length; ) {
    const char = formula[index];

    if (char === '"') {
      const stringEnd = findStringEnd(formula, index + 1);
      result += formula.slice(index, stringEnd);
      index = stringEnd;
      continue;
    }

    if (isReferenceStart(formula, index)) {
      const token = readReferenceToken(formula, index);

      if (token) {
        result += rewriteReferenceToken(token, operation);
        index += token.length;
        continue;
      }
    }

    result += char;
    index += 1;
  }

  return result;
}

function findStringEnd(text, start) {
  let index = start;

  while (index < text.length) {
    if (text[index] === '"') {
      if (text[index + 1] === '"') {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index += 1;
  }

  return text.length;
}

function isReferenceStart(text, index) {
  const previous = text[index - 1];
  return !previous || !/[A-Za-z0-9_]/.test(previous);
}

function readReferenceToken(text, index) {
  const match = /^(\$?)([A-Z]+)(\$?)(\d+)/.exec(text.slice(index));

  if (!match) {
    return null;
  }

  const token = match[0];
  const next = text[index + token.length];

  if (next && /[A-Za-z0-9_]/.test(next)) {
    return null;
  }

  return {
    length: token.length,
    raw: token,
    columnAbsolute: match[1] === '$',
    columnLabel: match[2],
    rowAbsolute: match[3] === '$',
    rowNumber: Number(match[4]),
  };
}

function rewriteReferenceToken(token, operation) {
  const updated = applyOperation(token, operation);

  if (updated.deleted) {
    return '#REF!';
  }

  return [
    updated.columnAbsolute ? '$' : '',
    columnNumberToLabel(updated.columnNumber),
    updated.rowAbsolute ? '$' : '',
    updated.rowNumber,
  ].join('');
}

function applyOperation(token, operation) {
  let columnNumber = columnLabelToNumber(token.columnLabel);
  let rowNumber = token.rowNumber;

  if (operation.type === 'insert-row') {
    if (rowNumber >= operation.index) {
      rowNumber += operation.count;
    }
  }

  if (operation.type === 'insert-column') {
    if (columnNumber >= operation.index) {
      columnNumber += operation.count;
    }
  }

  if (operation.type === 'delete-row') {
    if (isDeleted(rowNumber, operation.index, operation.count)) {
      return { deleted: true };
    }

    if (rowNumber > operation.index + operation.count - 1) {
      rowNumber -= operation.count;
    }
  }

  if (operation.type === 'delete-column') {
    if (isDeleted(columnNumber, operation.index, operation.count)) {
      return { deleted: true };
    }

    if (columnNumber > operation.index + operation.count - 1) {
      columnNumber -= operation.count;
    }
  }

  return {
    deleted: false,
    columnAbsolute: token.columnAbsolute,
    columnNumber,
    rowAbsolute: token.rowAbsolute,
    rowNumber,
  };
}

function isDeleted(value, start, count) {
  return value >= start && value <= start + count - 1;
}

function columnLabelToNumber(label) {
  let number = 0;

  for (let index = 0; index < label.length; index += 1) {
    number = number * 26 + (label.charCodeAt(index) - 64);
  }

  return number;
}

function columnNumberToLabel(number) {
  let remaining = number;
  let label = '';

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    label = String.fromCharCode(65 + offset) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
}

module.exports = {
  rewriteFormulaReferences,
};
