function columnNameToIndex(name) {
  let value = 0;
  for (let i = 0; i < name.length; i += 1) {
    value = value * 26 + (name.charCodeAt(i) - 64);
  }
  return value;
}

function columnIndexToName(index) {
  let value = index;
  let name = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function parseReference(reference) {
  const match = reference.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    columnAbsolute: match[1] === '$',
    columnName: match[2],
    column: columnNameToIndex(match[2]),
    rowAbsolute: match[3] === '$',
    row: Number(match[4]),
  };
}

function formatReference(reference) {
  if (reference.invalid) {
    return '#REF!';
  }

  return [
    reference.columnAbsolute ? '$' : '',
    columnIndexToName(reference.column),
    reference.rowAbsolute ? '$' : '',
    String(reference.row),
  ].join('');
}

function shiftReference(reference, operation) {
  const next = { ...reference };

  if (operation.type === 'insert-row') {
    if (next.row >= operation.index) {
      next.row += 1;
    }
    return next;
  }

  if (operation.type === 'delete-row') {
    if (next.row === operation.index) {
      next.invalid = true;
    } else if (next.row > operation.index) {
      next.row -= 1;
    }
    return next;
  }

  if (operation.type === 'insert-column') {
    if (next.column >= operation.index) {
      next.column += 1;
    }
    return next;
  }

  if (operation.type === 'delete-column') {
    if (next.column === operation.index) {
      next.invalid = true;
    } else if (next.column > operation.index) {
      next.column -= 1;
    }
    return next;
  }

  return next;
}

function rewriteReferenceToken(token, operation) {
  const parts = token.split(':');
  const rewrittenParts = parts.map((part) => formatReference(shiftReference(parseReference(part), operation)));

  if (rewrittenParts.includes('#REF!')) {
    return '#REF!';
  }

  return rewrittenParts.join(':');
}

function rewriteFormulaForStructuralEdit(rawValue, operation) {
  if (typeof rawValue !== 'string' || rawValue.charAt(0) !== '=') {
    return rawValue;
  }

  return rawValue.replace(/\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, (token) => {
    return rewriteReferenceToken(token, operation);
  });
}

function shiftCellAddress(address, operation) {
  const reference = parseReference(address);
  if (!reference) {
    return null;
  }

  const shifted = shiftReference(reference, operation);
  return shifted.invalid ? null : formatReference(shifted);
}

function applyStructuralEdit(cells, operation) {
  const nextCells = {};
  const entries = Object.entries(cells || {});

  for (const [address, rawValue] of entries) {
    const nextAddress = shiftCellAddress(address, operation);
    if (!nextAddress) {
      continue;
    }

    nextCells[nextAddress] = rewriteFormulaForStructuralEdit(rawValue, operation);
  }

  return nextCells;
}

const api = {
  applyStructuralEdit,
  rewriteFormulaForStructuralEdit,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.StructuralEdit = api;
}
