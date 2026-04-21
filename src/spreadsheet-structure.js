function createEmptyState(options = {}) {
  return {
    rowCount: options.rowCount || 100,
    columnCount: options.columnCount || 26,
    cells: cloneCells(options.cells || {}),
  };
}

function insertRow(state, rowIndex) {
  return transformState(state, {
    moveCell(address) {
      if (address.row >= rowIndex) {
        return { ...address, row: address.row + 1 };
      }
      return address;
    },
    rewriteFormula(formula) {
      return rewriteFormula(formula, createRowInserter(rowIndex), null);
    },
    nextRowCount: state.rowCount + 1,
    nextColumnCount: state.columnCount,
  });
}

function deleteRow(state, rowIndex) {
  return transformState(state, {
    moveCell(address) {
      if (address.row === rowIndex) {
        return null;
      }
      if (address.row > rowIndex) {
        return { ...address, row: address.row - 1 };
      }
      return address;
    },
    rewriteFormula(formula) {
      return rewriteFormula(formula, createRowDeleter(rowIndex), null);
    },
    nextRowCount: Math.max(1, state.rowCount - 1),
    nextColumnCount: state.columnCount,
  });
}

function insertColumn(state, columnIndex) {
  return transformState(state, {
    moveCell(address) {
      if (address.column >= columnIndex) {
        return { ...address, column: address.column + 1 };
      }
      return address;
    },
    rewriteFormula(formula) {
      return rewriteFormula(formula, null, createColumnInserter(columnIndex));
    },
    nextRowCount: state.rowCount,
    nextColumnCount: state.columnCount + 1,
  });
}

function deleteColumn(state, columnIndex) {
  return transformState(state, {
    moveCell(address) {
      if (address.column === columnIndex) {
        return null;
      }
      if (address.column > columnIndex) {
        return { ...address, column: address.column - 1 };
      }
      return address;
    },
    rewriteFormula(formula) {
      return rewriteFormula(formula, null, createColumnDeleter(columnIndex));
    },
    nextRowCount: state.rowCount,
    nextColumnCount: Math.max(1, state.columnCount - 1),
  });
}

function createHistory(limit = 50) {
  const undoStack = [];
  const redoStack = [];

  return {
    record(beforeState, afterState, label = 'action') {
      undoStack.push({
        before: cloneState(beforeState),
        after: cloneState(afterState),
        label,
      });
      if (undoStack.length > limit) {
        undoStack.shift();
      }
      redoStack.length = 0;
    },
    undo() {
      if (undoStack.length === 0) {
        return null;
      }
      const entry = undoStack.pop();
      redoStack.push(entry);
      return {
        state: cloneState(entry.before),
        label: entry.label,
      };
    },
    redo() {
      if (redoStack.length === 0) {
        return null;
      }
      const entry = redoStack.pop();
      undoStack.push(entry);
      return {
        state: cloneState(entry.after),
        label: entry.label,
      };
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
  };
}

function transformState(state, options) {
  const nextCells = {};
  const entries = Object.entries(state.cells || {});

  for (const [cellKey, rawValue] of entries) {
    const parsedAddress = parseCellAddress(cellKey);
    const movedAddress = options.moveCell(parsedAddress);

    if (!movedAddress) {
      continue;
    }

    nextCells[stringifyAddress(movedAddress)] = options.rewriteFormula(rawValue);
  }

  return {
    rowCount: options.nextRowCount,
    columnCount: options.nextColumnCount,
    cells: nextCells,
  };
}

function rewriteFormula(rawValue, rowTransform, columnTransform) {
  if (typeof rawValue !== 'string' || rawValue[0] !== '=') {
    return rawValue;
  }

  const rangePattern = /(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/g;
  let rewritten = rawValue.replace(rangePattern, (match, startRef, endRef) => {
    const range = rewriteRange(startRef, endRef, rowTransform, columnTransform);
    return range || '#REF!';
  });

  const singlePattern = /(\$?[A-Z]+\$?\d+)/g;
  rewritten = rewritten.replace(singlePattern, (match, refText, offset, source) => {
    const previous = source[offset - 1];
    const next = source[offset + refText.length];
    if (previous === ':' || next === ':') {
      return match;
    }
    return rewriteSingleReference(refText, rowTransform, columnTransform);
  });

  return rewritten;
}

function rewriteRange(startRef, endRef, rowTransform, columnTransform) {
  let start = parseReference(startRef);
  let end = parseReference(endRef);

  if (start.column > end.column) {
    const column = start;
    start = end;
    end = column;
  }
  if (start.row > end.row) {
    const row = start;
    start = end;
    end = row;
  }

  let rowBounds = { start: start.row, end: end.row };
  let columnBounds = { start: start.column, end: end.column };

  if (rowTransform && rowTransform.kind === 'insert') {
    if (rowBounds.start >= rowTransform.index) {
      rowBounds.start += 1;
    }
    if (rowBounds.end >= rowTransform.index) {
      rowBounds.end += 1;
    }
  }
  if (rowTransform && rowTransform.kind === 'delete') {
    rowBounds = rewriteDeletedBounds(rowBounds, rowTransform.index);
    if (!rowBounds) {
      return '#REF!';
    }
  }

  if (columnTransform && columnTransform.kind === 'insert') {
    if (columnBounds.start >= columnTransform.index) {
      columnBounds.start += 1;
    }
    if (columnBounds.end >= columnTransform.index) {
      columnBounds.end += 1;
    }
  }
  if (columnTransform && columnTransform.kind === 'delete') {
    columnBounds = rewriteDeletedBounds(columnBounds, columnTransform.index);
    if (!columnBounds) {
      return '#REF!';
    }
  }

  const nextStart = {
    ...start,
    row: rowBounds.start,
    column: columnBounds.start,
  };
  const nextEnd = {
    ...end,
    row: rowBounds.end,
    column: columnBounds.end,
  };

  return `${stringifyReference(nextStart)}:${stringifyReference(nextEnd)}`;
}

function rewriteDeletedBounds(bounds, deletedIndex) {
  if (deletedIndex < bounds.start) {
    return { start: bounds.start - 1, end: bounds.end - 1 };
  }
  if (deletedIndex > bounds.end) {
    return bounds;
  }
  if (bounds.start === bounds.end) {
    return null;
  }
  return { start: bounds.start, end: bounds.end - 1 };
}

function rewriteSingleReference(refText, rowTransform, columnTransform) {
  const reference = parseReference(refText);

  if (rowTransform) {
    if (rowTransform.kind === 'insert' && reference.row >= rowTransform.index) {
      reference.row += 1;
    }
    if (rowTransform.kind === 'delete') {
      if (reference.row === rowTransform.index) {
        return '#REF!';
      }
      if (reference.row > rowTransform.index) {
        reference.row -= 1;
      }
    }
  }

  if (columnTransform) {
    if (columnTransform.kind === 'insert' && reference.column >= columnTransform.index) {
      reference.column += 1;
    }
    if (columnTransform.kind === 'delete') {
      if (reference.column === columnTransform.index) {
        return '#REF!';
      }
      if (reference.column > columnTransform.index) {
        reference.column -= 1;
      }
    }
  }

  return stringifyReference(reference);
}

function createRowInserter(index) {
  return { kind: 'insert', index };
}

function createRowDeleter(index) {
  return { kind: 'delete', index };
}

function createColumnInserter(index) {
  return { kind: 'insert', index };
}

function createColumnDeleter(index) {
  return { kind: 'delete', index };
}

function parseCellAddress(address) {
  const reference = parseReference(address);
  return {
    row: reference.row,
    column: reference.column,
  };
}

function parseReference(referenceText) {
  const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(referenceText);
  if (!match) {
    throw new Error(`Invalid reference: ${referenceText}`);
  }

  return {
    columnAbsolute: Boolean(match[1]),
    columnLabel: match[2],
    column: columnLabelToNumber(match[2]),
    rowAbsolute: Boolean(match[3]),
    row: Number(match[4]),
  };
}

function stringifyAddress(address) {
  return `${numberToColumnLabel(address.column)}${address.row}`;
}

function stringifyReference(reference) {
  return `${reference.columnAbsolute ? '$' : ''}${numberToColumnLabel(reference.column)}${reference.rowAbsolute ? '$' : ''}${reference.row}`;
}

function columnLabelToNumber(label) {
  let value = 0;
  for (let index = 0; index < label.length; index += 1) {
    value = (value * 26) + (label.charCodeAt(index) - 64);
  }
  return value;
}

function numberToColumnLabel(value) {
  let label = '';
  let remaining = value;
  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    label = String.fromCharCode(65 + offset) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

function cloneCells(cells) {
  return { ...cells };
}

function cloneState(state) {
  return {
    rowCount: state.rowCount,
    columnCount: state.columnCount,
    cells: cloneCells(state.cells || {}),
  };
}

module.exports = {
  createEmptyState,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  createHistory,
};
