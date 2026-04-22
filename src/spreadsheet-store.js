const STATE_STORAGE_SUFFIX = 'spreadsheet-state';

function createSpreadsheetStore({ storage, storageNamespace }) {
  if (!storage) {
    throw new Error('storage is required');
  }

  if (!storageNamespace) {
    throw new Error('storageNamespace is required');
  }

  const state = {
    cells: {},
    selection: createSelection('A1'),
  };

  const history = {
    undo: [],
    redo: [],
  };

  const storageKey = `${storageNamespace}:${STATE_STORAGE_SUFFIX}`;

  return {
    getState() {
      return {
        cells: cloneCells(state.cells),
        selection: { ...state.selection },
      };
    },

    getHistory() {
      return {
        undo: history.undo.slice(),
        redo: history.redo.slice(),
      };
    },

    setCellRaw(address, raw) {
      if (raw === '' || raw == null) {
        delete state.cells[address];
        return;
      }

      state.cells[address] = { raw: String(raw) };
    },

    selectCell(address) {
      state.selection = createSelection(address);
    },

    recordAction(action) {
      history.undo.push(action);
      history.redo = [];
    },

    save() {
      storage.setItem(storageKey, JSON.stringify({
        cells: cloneCells(state.cells),
        selection: { ...state.selection },
      }));
    },

    load() {
      const raw = storage.getItem(storageKey);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      state.cells = cloneCells(parsed.cells || {});
      state.selection = parsed.selection ? { ...parsed.selection } : createSelection('A1');
      history.undo = [];
      history.redo = [];
    },

    insertRows(startRow, count = 1) {
      remapState(state, (cell) => insertRowsInCell(cell, startRow, count), (selection) => ({
        active: shiftAddressRows(selection.active, startRow, count),
        anchor: shiftAddressRows(selection.anchor, startRow, count),
        focus: shiftAddressRows(selection.focus, startRow, count),
      }));
    },

    deleteRows(startRow, count = 1) {
      remapState(state, (cell) => deleteRowsInCell(cell, startRow, count), (selection) => ({
        active: deleteAddressRows(selection.active, startRow, count),
        anchor: deleteAddressRows(selection.anchor, startRow, count),
        focus: deleteAddressRows(selection.focus, startRow, count),
      }));
    },

    insertColumns(startColumn, count = 1) {
      remapState(state, (cell) => insertColumnsInCell(cell, startColumn, count), (selection) => ({
        active: shiftAddressColumns(selection.active, startColumn, count),
        anchor: shiftAddressColumns(selection.anchor, startColumn, count),
        focus: shiftAddressColumns(selection.focus, startColumn, count),
      }));
    },

    deleteColumns(startColumn, count = 1) {
      remapState(state, (cell) => deleteColumnsInCell(cell, startColumn, count), (selection) => ({
        active: deleteAddressColumns(selection.active, startColumn, count),
        anchor: deleteAddressColumns(selection.anchor, startColumn, count),
        focus: deleteAddressColumns(selection.focus, startColumn, count),
      }));
    },
  };
}

function remapState(state, mapCell, mapSelection) {
  const nextCells = {};

  for (const [address, cell] of Object.entries(state.cells)) {
    const mapped = mapCell({ address, raw: cell.raw });
    if (!mapped) {
      continue;
    }

    nextCells[mapped.address] = { raw: mapped.raw };
  }

  state.cells = nextCells;
  state.selection = normalizeSelection(mapSelection(state.selection));
}

function insertRowsInCell(cell, startRow, count) {
  return {
    address: shiftAddressRows(cell.address, startRow, count),
    raw: transformFormulaReferences(cell.raw, {
      row: { type: 'insert', start: startRow, count },
    }),
  };
}

function deleteRowsInCell(cell, startRow, count) {
  const address = deleteAddressRows(cell.address, startRow, count);

  if (!address) {
    return null;
  }

  return {
    address,
    raw: transformFormulaReferences(cell.raw, {
      row: { type: 'delete', start: startRow, count },
    }),
  };
}

function insertColumnsInCell(cell, startColumn, count) {
  return {
    address: shiftAddressColumns(cell.address, startColumn, count),
    raw: transformFormulaReferences(cell.raw, {
      column: { type: 'insert', start: startColumn, count },
    }),
  };
}

function deleteColumnsInCell(cell, startColumn, count) {
  const address = deleteAddressColumns(cell.address, startColumn, count);

  if (!address) {
    return null;
  }

  return {
    address,
    raw: transformFormulaReferences(cell.raw, {
      column: { type: 'delete', start: startColumn, count },
    }),
  };
}

function transformFormulaReferences(raw, operations) {
  if (typeof raw !== 'string' || !raw.startsWith('=')) {
    return raw;
  }

  return raw.replace(/(\$?[A-Z]+\$?\d+)(:\$?[A-Z]+\$?\d+)?/g, (match, startRef, rangeTail) => {
    const transformedStart = transformReference(startRef, operations);

    if (!rangeTail) {
      return transformedStart;
    }

    const transformedEnd = transformReference(rangeTail.slice(1), operations);
    return `${transformedStart}:${transformedEnd}`;
  });
}

function transformReference(reference, operations) {
  const parsed = parseReference(reference);
  let column = parsed.column;
  let row = parsed.row;

  if (operations.row) {
    row = applyAxisOperation(row, operations.row);
  }

  if (operations.column) {
    column = applyAxisOperation(column, operations.column);
  }

  if (row == null || column == null) {
    return '#REF!';
  }

  return `${parsed.columnAbsolute ? '$' : ''}${numberToColumn(column)}${parsed.rowAbsolute ? '$' : ''}${row}`;
}

function applyAxisOperation(value, operation) {
  if (operation.type === 'insert') {
    return value >= operation.start ? value + operation.count : value;
  }

  const end = operation.start + operation.count - 1;
  if (value >= operation.start && value <= end) {
    return null;
  }

  if (value > end) {
    return value - operation.count;
  }

  return value;
}

function shiftAddressRows(address, startRow, count) {
  const parsed = parseReference(address);
  const row = parsed.row >= startRow ? parsed.row + count : parsed.row;
  return `${numberToColumn(parsed.column)}${row}`;
}

function deleteAddressRows(address, startRow, count) {
  const parsed = parseReference(address);
  const end = startRow + count - 1;

  if (parsed.row >= startRow && parsed.row <= end) {
    return null;
  }

  const row = parsed.row > end ? parsed.row - count : parsed.row;
  return `${numberToColumn(parsed.column)}${row}`;
}

function shiftAddressColumns(address, startColumn, count) {
  const parsed = parseReference(address);
  const column = parsed.column >= startColumn ? parsed.column + count : parsed.column;
  return `${numberToColumn(column)}${parsed.row}`;
}

function deleteAddressColumns(address, startColumn, count) {
  const parsed = parseReference(address);
  const end = startColumn + count - 1;

  if (parsed.column >= startColumn && parsed.column <= end) {
    return null;
  }

  const column = parsed.column > end ? parsed.column - count : parsed.column;
  return `${numberToColumn(column)}${parsed.row}`;
}

function parseReference(reference) {
  const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(reference);

  if (!match) {
    throw new Error(`Invalid reference: ${reference}`);
  }

  return {
    columnAbsolute: match[1] === '$',
    column: columnToNumber(match[2]),
    rowAbsolute: match[3] === '$',
    row: Number(match[4]),
  };
}

function columnToNumber(columnLabel) {
  let value = 0;

  for (const char of columnLabel) {
    value = (value * 26) + (char.charCodeAt(0) - 64);
  }

  return value;
}

function numberToColumn(value) {
  let current = value;
  let column = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }

  return column;
}

function createSelection(address) {
  return {
    active: address,
    anchor: address,
    focus: address,
  };
}

function normalizeSelection(selection) {
  const active = selection.active || 'A1';
  return {
    active,
    anchor: selection.anchor || active,
    focus: selection.focus || active,
  };
}

function cloneCells(cells) {
  return Object.fromEntries(
    Object.entries(cells).map(([address, cell]) => [address, { raw: cell.raw }])
  );
}

if (typeof module !== 'undefined') {
  module.exports = {
    STATE_STORAGE_SUFFIX,
    createSpreadsheetStore,
  };
}

if (typeof window !== 'undefined') {
  window.createPersistentSpreadsheetStore = createSpreadsheetStore;
}
