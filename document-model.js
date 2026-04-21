function createDocumentModel(options) {
  const storage = options && options.storage ? options.storage : null;
  const namespace = options && options.namespace ? String(options.namespace) : '';
  const storageKey = namespace + 'spreadsheet-document';
  const historyLimit = options && options.historyLimit ? options.historyLimit : 50;

  let state = loadState(storage, storageKey);
  let undoStack = [];
  let redoStack = [];

  function persist() {
    if (!storage) {
      return;
    }

    storage.setItem(storageKey, JSON.stringify(state));
  }

  function commit(nextState) {
    undoStack.push(cloneState(state));
    if (undoStack.length > historyLimit) {
      undoStack.shift();
    }

    state = nextState;
    redoStack = [];
    persist();
  }

  function mutate(mutator) {
    const nextState = cloneState(state);
    mutator(nextState);
    commit(compactState(nextState));
  }

  persist();

  return {
    getCell(address) {
      return state.cells[address] || '';
    },

    setCell(address, raw) {
      mutate(function (nextState) {
        if (raw === '') {
          delete nextState.cells[address];
          return;
        }

        nextState.cells[address] = String(raw);
      });
    },

    getSelection() {
      return state.selection;
    },

    setSelection(address) {
      mutate(function (nextState) {
        nextState.selection = address;
      });
    },

    clearRange(range) {
      mutate(function (nextState) {
        forEachCellInRange(range, function (address) {
          delete nextState.cells[address];
        });
      });
    },

    copyRange(range) {
      return buildClipboard(state, range, false);
    },

    cutRange(range) {
      const clipboard = buildClipboard(state, range, true);

      mutate(function (nextState) {
        forEachCellInRange(range, function (address) {
          delete nextState.cells[address];
        });
      });

      return clipboard;
    },

    pasteRange(targetAddress, clipboard) {
      const target = parseCellAddress(targetAddress);

      mutate(function (nextState) {
        for (let rowOffset = 0; rowOffset < clipboard.height; rowOffset += 1) {
          for (let colOffset = 0; colOffset < clipboard.width; colOffset += 1) {
            const sourceValue = clipboard.cells[rowOffset][colOffset];
            const destination = {
              row: target.row + rowOffset,
              col: target.col + colOffset,
            };
            const destinationAddress = formatCellAddress(destination);

            if (!sourceValue) {
              delete nextState.cells[destinationAddress];
              continue;
            }

            nextState.cells[destinationAddress] = shiftFormulaForPaste(
              sourceValue,
              target.row - clipboard.source.row,
              target.col - clipboard.source.col
            );
          }
        }
      });
    },

    insertRows(startRow, count) {
      mutate(function (nextState) {
        nextState.cells = transformStructure(nextState.cells, {
          type: 'insert-rows',
          start: startRow,
          count: count,
        });
      });
    },

    deleteRows(startRow, count) {
      mutate(function (nextState) {
        nextState.cells = transformStructure(nextState.cells, {
          type: 'delete-rows',
          start: startRow,
          count: count,
        });
      });
    },

    insertColumns(startColumn, count) {
      mutate(function (nextState) {
        nextState.cells = transformStructure(nextState.cells, {
          type: 'insert-columns',
          start: startColumn,
          count: count,
        });
      });
    },

    deleteColumns(startColumn, count) {
      mutate(function (nextState) {
        nextState.cells = transformStructure(nextState.cells, {
          type: 'delete-columns',
          start: startColumn,
          count: count,
        });
      });
    },

    undo() {
      if (!undoStack.length) {
        return false;
      }

      redoStack.push(cloneState(state));
      state = undoStack.pop();
      persist();
      return true;
    },

    redo() {
      if (!redoStack.length) {
        return false;
      }

      undoStack.push(cloneState(state));
      state = redoStack.pop();
      persist();
      return true;
    },

    exportState() {
      return cloneState(state);
    },
  };
}

function loadState(storage, storageKey) {
  if (!storage) {
    return { cells: {}, selection: 'A1' };
  }

  const raw = storage.getItem(storageKey);
  if (!raw) {
    return { cells: {}, selection: 'A1' };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      cells: parsed && parsed.cells ? parsed.cells : {},
      selection: parsed && parsed.selection ? parsed.selection : 'A1',
    };
  } catch (_error) {
    return { cells: {}, selection: 'A1' };
  }
}

function cloneState(state) {
  return {
    cells: Object.assign({}, state.cells),
    selection: state.selection,
  };
}

function compactState(state) {
  const cells = {};
  const addresses = Object.keys(state.cells);

  for (let index = 0; index < addresses.length; index += 1) {
    const address = addresses[index];
    const value = state.cells[address];
    if (value !== '') {
      cells[address] = value;
    }
  }

  return {
    cells: cells,
    selection: state.selection || 'A1',
  };
}

function buildClipboard(state, range, isCut) {
  const bounds = normalizeRange(range);
  const cells = [];

  for (let row = bounds.start.row; row <= bounds.end.row; row += 1) {
    const rowValues = [];
    for (let col = bounds.start.col; col <= bounds.end.col; col += 1) {
      rowValues.push(state.cells[formatCellAddress({ row: row, col: col })] || '');
    }
    cells.push(rowValues);
  }

  return {
    kind: isCut ? 'cut' : 'copy',
    source: { row: bounds.start.row, col: bounds.start.col },
    width: bounds.end.col - bounds.start.col + 1,
    height: bounds.end.row - bounds.start.row + 1,
    cells: cells,
  };
}

function forEachCellInRange(range, callback) {
  const bounds = normalizeRange(range);

  for (let row = bounds.start.row; row <= bounds.end.row; row += 1) {
    for (let col = bounds.start.col; col <= bounds.end.col; col += 1) {
      callback(formatCellAddress({ row: row, col: col }), row, col);
    }
  }
}

function normalizeRange(range) {
  const start = parseCellAddress(range.start);
  const end = parseCellAddress(range.end);

  return {
    start: {
      row: Math.min(start.row, end.row),
      col: Math.min(start.col, end.col),
    },
    end: {
      row: Math.max(start.row, end.row),
      col: Math.max(start.col, end.col),
    },
  };
}

function parseCellAddress(address) {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) {
    throw new Error('Invalid cell address: ' + address);
  }

  return {
    col: columnLabelToNumber(match[1]),
    row: Number(match[2]),
  };
}

function formatCellAddress(position) {
  return numberToColumnLabel(position.col) + String(position.row);
}

function columnLabelToNumber(label) {
  let value = 0;

  for (let index = 0; index < label.length; index += 1) {
    value = (value * 26) + (label.charCodeAt(index) - 64);
  }

  return value;
}

function numberToColumnLabel(columnNumber) {
  let value = columnNumber;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function shiftFormulaForPaste(raw, rowOffset, colOffset) {
  if (!raw || raw.charAt(0) !== '=') {
    return raw;
  }

  return rewriteFormula(raw, function (reference) {
    return applyPasteShift(reference, rowOffset, colOffset);
  });
}

function transformStructure(cells, operation) {
  const nextCells = {};
  const addresses = Object.keys(cells);

  for (let index = 0; index < addresses.length; index += 1) {
    const originalAddress = addresses[index];
    const originalPosition = parseCellAddress(originalAddress);
    const nextPosition = transformPosition(originalPosition, operation);
    const nextRaw = rewriteFormulaForStructure(cells[originalAddress], operation);

    if (!nextPosition || nextRaw === '') {
      continue;
    }

    nextCells[formatCellAddress(nextPosition)] = nextRaw;
  }

  return nextCells;
}

function transformPosition(position, operation) {
  const end = operation.start + operation.count - 1;

  if (operation.type === 'insert-rows') {
    return {
      row: position.row >= operation.start ? position.row + operation.count : position.row,
      col: position.col,
    };
  }

  if (operation.type === 'delete-rows') {
    if (position.row >= operation.start && position.row <= end) {
      return null;
    }

    return {
      row: position.row > end ? position.row - operation.count : position.row,
      col: position.col,
    };
  }

  if (operation.type === 'insert-columns') {
    return {
      row: position.row,
      col: position.col >= operation.start ? position.col + operation.count : position.col,
    };
  }

  if (position.col >= operation.start && position.col <= end) {
    return null;
  }

  return {
    row: position.row,
    col: position.col > end ? position.col - operation.count : position.col,
  };
}

function rewriteFormulaForStructure(raw, operation) {
  if (!raw || raw.charAt(0) !== '=') {
    return raw;
  }

  return rewriteFormula(raw, function (reference) {
    return applyStructureShift(reference, operation);
  });
}

function rewriteFormula(raw, transformReference) {
  let result = '';
  let segment = '';
  let inString = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw.charAt(index);

    if (character === '"') {
      if (!inString) {
        result += rewriteSegment(segment, transformReference);
        segment = '';
      } else {
        result += segment;
        segment = '';
      }

      inString = !inString;
      result += character;
      continue;
    }

    segment += character;
  }

  if (inString) {
    result += segment;
  } else {
    result += rewriteSegment(segment, transformReference);
  }

  return result;
}

function rewriteSegment(segment, transformReference) {
  return segment.replace(/\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, function (token) {
    return transformReference(token);
  });
}

function applyPasteShift(reference, rowOffset, colOffset) {
  if (reference.indexOf(':') >= 0) {
    const parts = reference.split(':');
    return applyPasteShift(parts[0], rowOffset, colOffset) + ':' + applyPasteShift(parts[1], rowOffset, colOffset);
  }

  const parsed = parseReference(reference);
  const nextCol = parsed.absoluteCol ? parsed.col : parsed.col + colOffset;
  const nextRow = parsed.absoluteRow ? parsed.row : parsed.row + rowOffset;

  return formatReference({
    col: nextCol,
    row: nextRow,
    absoluteCol: parsed.absoluteCol,
    absoluteRow: parsed.absoluteRow,
  });
}

function applyStructureShift(reference, operation) {
  if (reference.indexOf(':') >= 0) {
    const parts = reference.split(':');
    const start = applyStructureShift(parts[0], operation);
    const end = applyStructureShift(parts[1], operation);

    if (start === '#REF!' || end === '#REF!') {
      return '#REF!';
    }

    return start + ':' + end;
  }

  const parsed = parseReference(reference);
  const shifted = shiftReferenceAxis(parsed, operation);

  if (!shifted) {
    return '#REF!';
  }

  return formatReference(shifted);
}

function shiftReferenceAxis(reference, operation) {
  const end = operation.start + operation.count - 1;
  const next = {
    col: reference.col,
    row: reference.row,
    absoluteCol: reference.absoluteCol,
    absoluteRow: reference.absoluteRow,
  };

  if (operation.type === 'insert-rows') {
    if (next.row >= operation.start) {
      next.row += operation.count;
    }
    return next;
  }

  if (operation.type === 'delete-rows') {
    if (next.row >= operation.start && next.row <= end) {
      return null;
    }
    if (next.row > end) {
      next.row -= operation.count;
    }
    return next;
  }

  if (operation.type === 'insert-columns') {
    if (next.col >= operation.start) {
      next.col += operation.count;
    }
    return next;
  }

  if (next.col >= operation.start && next.col <= end) {
    return null;
  }
  if (next.col > end) {
    next.col -= operation.count;
  }
  return next;
}

function parseReference(reference) {
  const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(reference);
  if (!match) {
    throw new Error('Invalid reference: ' + reference);
  }

  return {
    absoluteCol: match[1] === '$',
    col: columnLabelToNumber(match[2]),
    absoluteRow: match[3] === '$',
    row: Number(match[4]),
  };
}

function formatReference(reference) {
  return (reference.absoluteCol ? '$' : '') +
    numberToColumnLabel(reference.col) +
    (reference.absoluteRow ? '$' : '') +
    String(reference.row);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createDocumentModel: createDocumentModel,
  };
}

if (typeof window !== 'undefined') {
  window.createDocumentModel = createDocumentModel;
}
