const DEFAULT_SELECTION = {
  start: 'A1',
  end: 'A1',
  active: 'A1',
};

const STORAGE_SUFFIX = 'spreadsheet-state';
const DELETED_REFERENCE = '#REF!';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createSpreadsheetStore(options = {}) {
  const storage = options.storage || createMemoryStorage();
  const namespace = options.namespace || 'spreadsheet';
  const historyLimit = options.historyLimit || 50;
  const storageKey = `${namespace}:${STORAGE_SUFFIX}`;

  let state = loadState(storage, storageKey, options.initialState);
  let history = [];
  let future = [];

  function getState() {
    return cloneState(state);
  }

  function commit(nextState, recordHistory = true) {
    const normalized = normalizeState(nextState);
    if (recordHistory) {
      pushHistory(state);
      future = [];
    }
    state = normalized;
    persistState(storage, storageKey, state);
    return getState();
  }

  function setCell(address, rawContent) {
    const nextState = cloneState(state);
    if (rawContent === '' || rawContent == null) {
      delete nextState.cells[address];
    } else {
      nextState.cells[address] = String(rawContent);
    }
    nextState.selection = collapsedSelection(address);
    return commit(nextState, true);
  }

  function clearRange(range) {
    const bounds = normalizeRange(range);
    const nextState = cloneState(state);
    forEachCellInBounds(bounds, (address) => {
      delete nextState.cells[address];
    });
    nextState.selection = selectionFromBounds(bounds, bounds.start);
    return commit(nextState, true);
  }

  function copyRange(range) {
    return createClipboard(state, normalizeRange(range), false);
  }

  function cutRange(range) {
    const bounds = normalizeRange(range);
    const clipboard = createClipboard(state, bounds, true);
    const nextState = cloneState(state);
    forEachCellInBounds(bounds, (address) => {
      delete nextState.cells[address];
    });
    nextState.selection = selectionFromBounds(bounds, bounds.start);
    commit(nextState, true);
    return clipboard;
  }

  function pasteRange(targetAddress, clipboard) {
    const target = parseAddress(targetAddress);
    const nextState = cloneState(state);
    const source = clipboard.source;
    for (const item of clipboard.cells) {
      const destination = formatAddress({
        row: target.row + item.rowOffset,
        column: target.column + item.columnOffset,
      });
      nextState.cells[destination] = shiftFormula(item.raw, target.row - source.row, target.column - source.column);
    }
    nextState.selection = selectionFromBounds(
      {
        start: target,
        end: {
          row: target.row + clipboard.height - 1,
          column: target.column + clipboard.width - 1,
        },
      },
      formatAddress(target)
    );
    return commit(nextState, true);
  }

  function insertRows(startRow, count) {
    return applyStructuralChange({ axis: 'row', mode: 'insert', start: startRow, count });
  }

  function deleteRows(startRow, count) {
    return applyStructuralChange({ axis: 'row', mode: 'delete', start: startRow, count });
  }

  function insertColumns(startColumn, count) {
    return applyStructuralChange({ axis: 'column', mode: 'insert', start: startColumn, count });
  }

  function deleteColumns(startColumn, count) {
    return applyStructuralChange({ axis: 'column', mode: 'delete', start: startColumn, count });
  }

  function applyStructuralChange(change) {
    const nextState = cloneState(state);
    const movedCells = {};
    for (const [address, raw] of Object.entries(state.cells)) {
      const parsed = parseAddress(address);
      const rewrittenAddress = rewriteAddressForStructure(parsed, change);
      if (!rewrittenAddress) {
        continue;
      }
      const destination = formatAddress(rewrittenAddress);
      movedCells[destination] = rewriteFormulaForStructure(raw, change);
    }
    nextState.cells = movedCells;
    nextState.selection = rewriteSelectionForStructure(state.selection, change);
    return commit(nextState, true);
  }

  function undo() {
    if (history.length === 0) {
      return getState();
    }
    future.push(cloneState(state));
    state = history.pop();
    persistState(storage, storageKey, state);
    return getState();
  }

  function redo() {
    if (future.length === 0) {
      return getState();
    }
    pushHistory(state);
    state = future.pop();
    persistState(storage, storageKey, state);
    return getState();
  }

  function pushHistory(previousState) {
    history.push(cloneState(previousState));
    if (history.length > historyLimit) {
      history = history.slice(history.length - historyLimit);
    }
  }

  return {
    commit,
    copyRange,
    createClipboard: copyRange,
    cutRange,
    deleteColumns,
    deleteRows,
    getState,
    insertColumns,
    insertRows,
    pasteRange,
    redo,
    setCell,
    clearRange,
    undo,
  };
}

function loadState(storage, key, initialState) {
  const saved = storage.getItem(key);
  if (saved) {
    return normalizeState(JSON.parse(saved));
  }
  return normalizeState(initialState);
}

function persistState(storage, key, state) {
  storage.setItem(key, JSON.stringify(state));
}

function normalizeState(state) {
  return {
    cells: sortObjectKeys((state && state.cells) || {}),
    selection: {
      ...DEFAULT_SELECTION,
      ...((state && state.selection) || {}),
    },
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(normalizeState(state)));
}

function createClipboard(state, bounds, isCut) {
  const source = bounds.start;
  const cells = [];
  forEachCellInBounds(bounds, (address, rowOffset, columnOffset) => {
    if (state.cells[address] != null) {
      cells.push({ address, rowOffset, columnOffset, raw: state.cells[address] });
    }
  });
  return {
    source,
    width: bounds.end.column - bounds.start.column + 1,
    height: bounds.end.row - bounds.start.row + 1,
    isCut,
    cells,
  };
}

function normalizeRange(range) {
  const start = typeof range.start === 'string' ? parseAddress(range.start) : range.start;
  const end = typeof range.end === 'string' ? parseAddress(range.end) : range.end;
  return {
    start: {
      row: Math.min(start.row, end.row),
      column: Math.min(start.column, end.column),
    },
    end: {
      row: Math.max(start.row, end.row),
      column: Math.max(start.column, end.column),
    },
  };
}

function forEachCellInBounds(bounds, visitor) {
  for (let row = bounds.start.row; row <= bounds.end.row; row += 1) {
    for (let column = bounds.start.column; column <= bounds.end.column; column += 1) {
      visitor(formatAddress({ row, column }), row - bounds.start.row, column - bounds.start.column);
    }
  }
}

function collapsedSelection(address) {
  return { start: address, end: address, active: address };
}

function selectionFromBounds(bounds, active) {
  return {
    start: formatAddress(bounds.start),
    end: formatAddress(bounds.end),
    active,
  };
}

function rewriteSelectionForStructure(selection, change) {
  const next = {};
  for (const key of ['start', 'end', 'active']) {
    const rewritten = rewriteAddressForStructure(parseAddress(selection[key]), change);
    next[key] = formatAddress(rewritten || { row: 1, column: 1 });
  }
  return next;
}

function rewriteAddressForStructure(address, change) {
  const start = change.start;
  const end = start + change.count - 1;
  if (change.axis === 'row') {
    if (change.mode === 'insert') {
      return {
        row: address.row >= start ? address.row + change.count : address.row,
        column: address.column,
      };
    }
    if (address.row >= start && address.row <= end) {
      return null;
    }
    return {
      row: address.row > end ? address.row - change.count : address.row,
      column: address.column,
    };
  }

  if (change.mode === 'insert') {
    return {
      row: address.row,
      column: address.column >= start ? address.column + change.count : address.column,
    };
  }
  if (address.column >= start && address.column <= end) {
    return null;
  }
  return {
    row: address.row,
    column: address.column > end ? address.column - change.count : address.column,
  };
}

function rewriteFormulaForStructure(raw, change) {
  if (typeof raw !== 'string' || !raw.startsWith('=')) {
    return raw;
  }

  let deletedReferenceFound = false;
  const rewritten = raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, absoluteColumn, columnLabel, absoluteRow, rowLabel) => {
    const reference = {
      column: labelToColumn(columnLabel),
      row: Number(rowLabel),
      absoluteColumn: absoluteColumn === '$',
      absoluteRow: absoluteRow === '$',
    };
    const nextReference = rewriteReferenceForStructure(reference, change);
    if (nextReference === DELETED_REFERENCE) {
      deletedReferenceFound = true;
    }
    return nextReference;
  });

  return deletedReferenceFound ? DELETED_REFERENCE : rewritten;
}

function rewriteReferenceForStructure(reference, change) {
  const start = change.start;
  const end = start + change.count - 1;
  let nextRow = reference.row;
  let nextColumn = reference.column;

  if (change.axis === 'row') {
    if (change.mode === 'insert') {
      if (!reference.absoluteRow && reference.row >= start) {
        nextRow += change.count;
      }
  } else if (reference.row >= start && reference.row <= end) {
      return DELETED_REFERENCE;
    } else if (!reference.absoluteRow && reference.row > end) {
      nextRow -= change.count;
    }
  } else if (change.mode === 'insert') {
    if (!reference.absoluteColumn && reference.column >= start) {
      nextColumn += change.count;
    }
  } else if (reference.column >= start && reference.column <= end) {
    return DELETED_REFERENCE;
  } else if (!reference.absoluteColumn && reference.column > end) {
    nextColumn -= change.count;
  }

  return `${reference.absoluteColumn ? '$' : ''}${columnToLabel(nextColumn)}${reference.absoluteRow ? '$' : ''}${nextRow}`;
}

function shiftFormula(raw, rowDelta, columnDelta) {
  if (typeof raw !== 'string' || !raw.startsWith('=')) {
    return raw;
  }

  return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, absoluteColumn, columnLabel, absoluteRow, rowLabel) => {
    const nextColumn = absoluteColumn === '$' ? labelToColumn(columnLabel) : labelToColumn(columnLabel) + columnDelta;
    const nextRow = absoluteRow === '$' ? Number(rowLabel) : Number(rowLabel) + rowDelta;
    return `${absoluteColumn}${columnToLabel(nextColumn)}${absoluteRow}${nextRow}`;
  });
}

function parseAddress(address) {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) {
    throw new Error(`Invalid address: ${address}`);
  }
  return {
    column: labelToColumn(match[1]),
    row: Number(match[2]),
  };
}

function formatAddress(address) {
  return `${columnToLabel(address.column)}${address.row}`;
}

function labelToColumn(label) {
  let value = 0;
  for (const character of label) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
}

function columnToLabel(column) {
  let value = column;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function sortObjectKeys(object) {
  const sorted = {};
  for (const key of Object.keys(object).sort(compareAddresses)) {
    sorted[key] = object[key];
  }
  return sorted;
}

function compareAddresses(left, right) {
  const a = parseAddress(left);
  const b = parseAddress(right);
  if (a.row !== b.row) {
    return a.row - b.row;
  }
  return a.column - b.column;
}

const api = {
  createMemoryStorage,
  createSpreadsheetStore,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetActions = api;
}
