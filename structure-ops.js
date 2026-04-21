const { rewriteFormulaReferences } = require('./reference-ops.js');

function applyStructureOperation(cells, operation) {
  const nextCells = {};

  for (const [address, rawValue] of Object.entries(cells)) {
    const parsed = parseAddress(address);
    const moved = moveAddress(parsed, operation);

    if (!moved) {
      continue;
    }

    nextCells[formatAddress(moved)] = isFormula(rawValue)
      ? rewriteFormulaReferences(rawValue, operation)
      : rawValue;
  }

  return nextCells;
}

function isFormula(rawValue) {
  return typeof rawValue === 'string' && rawValue.startsWith('=');
}

function parseAddress(address) {
  const match = /^([A-Z]+)(\d+)$/.exec(address);

  if (!match) {
    throw new Error(`Invalid cell address: ${address}`);
  }

  return {
    columnNumber: columnLabelToNumber(match[1]),
    rowNumber: Number(match[2]),
  };
}

function formatAddress(address) {
  return `${columnNumberToLabel(address.columnNumber)}${address.rowNumber}`;
}

function moveAddress(address, operation) {
  let { columnNumber, rowNumber } = address;

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
      return null;
    }

    if (rowNumber > operation.index + operation.count - 1) {
      rowNumber -= operation.count;
    }
  }

  if (operation.type === 'delete-column') {
    if (isDeleted(columnNumber, operation.index, operation.count)) {
      return null;
    }

    if (columnNumber > operation.index + operation.count - 1) {
      columnNumber -= operation.count;
    }
  }

  return { columnNumber, rowNumber };
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
  applyStructureOperation,
};
