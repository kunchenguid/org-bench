function applyStructuralChange(state, operation) {
  const cells = state && state.cells ? state.cells : {};
  const nextCells = {};
  const deletedSnapshot = {};

  for (const [address, cell] of Object.entries(cells)) {
    const parsedAddress = parseReference(address);
    const movedAddress = transformCoordinate(parsedAddress, operation, false);

    if (movedAddress.deleted) {
      deletedSnapshot[address] = cloneCell(cell);
      continue;
    }

    const nextAddress = formatReference(movedAddress);
    nextCells[nextAddress] = {
      ...cloneCell(cell),
      raw: rewriteFormula(cell.raw, operation),
    };
  }

  return {
    state: {
      ...state,
      cells: nextCells,
    },
    undo: buildUndo(operation, deletedSnapshot),
  };
}

function buildUndo(operation, deletedSnapshot) {
  switch (operation.kind) {
    case 'insert-rows':
      return { kind: 'delete-rows', index: operation.index, count: operation.count };
    case 'insert-columns':
      return { kind: 'delete-columns', index: operation.index, count: operation.count };
    case 'delete-rows':
      return {
        kind: 'insert-rows',
        index: operation.index,
        count: operation.count,
        snapshot: deletedSnapshot,
      };
    case 'delete-columns':
      return {
        kind: 'insert-columns',
        index: operation.index,
        count: operation.count,
        snapshot: deletedSnapshot,
      };
    default:
      throw new Error(`Unsupported structural change: ${operation.kind}`);
  }
}

function rewriteFormula(raw, operation) {
  if (typeof raw !== 'string' || !raw.startsWith('=')) {
    return raw;
  }

  return raw.replace(/\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, (token) => {
    if (token.includes(':')) {
      const parts = token.split(':');
      const start = transformReference(parts[0], operation);
      const end = transformReference(parts[1], operation);
      return `${start}:${end}`;
    }

    return transformReference(token, operation);
  });
}

function transformReference(token, operation) {
  const transformed = transformCoordinate(parseReference(token), operation, true);
  return transformed.deleted ? '#REF!' : formatReference(transformed);
}

function transformCoordinate(reference, operation, preserveMarkers) {
  const next = {
    column: reference.column,
    row: reference.row,
    absoluteColumn: preserveMarkers ? reference.absoluteColumn : false,
    absoluteRow: preserveMarkers ? reference.absoluteRow : false,
    deleted: false,
  };

  switch (operation.kind) {
    case 'insert-rows':
      if (next.row >= operation.index) {
        next.row += operation.count;
      }
      return next;
    case 'delete-rows':
      if (next.row >= operation.index && next.row < operation.index + operation.count) {
        next.deleted = true;
        return next;
      }
      if (next.row >= operation.index + operation.count) {
        next.row -= operation.count;
      }
      return next;
    case 'insert-columns':
      if (next.column >= operation.index) {
        next.column += operation.count;
      }
      return next;
    case 'delete-columns':
      if (next.column >= operation.index && next.column < operation.index + operation.count) {
        next.deleted = true;
        return next;
      }
      if (next.column >= operation.index + operation.count) {
        next.column -= operation.count;
      }
      return next;
    default:
      throw new Error(`Unsupported structural change: ${operation.kind}`);
  }
}

function parseReference(token) {
  const match = token.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);

  if (!match) {
    throw new Error(`Invalid cell reference: ${token}`);
  }

  return {
    absoluteColumn: match[1] === '$',
    column: columnLabelToNumber(match[2]),
    absoluteRow: match[3] === '$',
    row: Number(match[4]),
  };
}

function formatReference(reference) {
  return `${reference.absoluteColumn ? '$' : ''}${columnNumberToLabel(reference.column)}${reference.absoluteRow ? '$' : ''}${reference.row}`;
}

function columnLabelToNumber(label) {
  let value = 0;

  for (const character of label) {
    value = value * 26 + (character.charCodeAt(0) - 64);
  }

  return value;
}

function columnNumberToLabel(value) {
  let column = value;
  let label = '';

  while (column > 0) {
    const remainder = (column - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    column = Math.floor((column - 1) / 26);
  }

  return label;
}

function cloneCell(cell) {
  return cell ? { ...cell } : cell;
}

module.exports = {
  applyStructuralChange,
};
