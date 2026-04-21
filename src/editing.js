const MAX_COLUMNS = 26;
const MAX_ROWS = 100;

function createSpreadsheetStore() {
  return {
    cells: {},
    selection: {
      activeCellId: 'A1',
    },
    editing: {
      active: false,
      source: 'cell',
      cellId: null,
      draft: '',
      originalRaw: '',
    },
  };
}

function getCellRaw(store, cellId) {
  const cell = store.cells[cellId];
  return cell ? cell.raw : '';
}

function setCellRaw(store, cellId, raw) {
  if (!raw) {
    delete store.cells[cellId];
    return;
  }

  store.cells[cellId] = { raw };
}

function getFormulaBarText(store) {
  if (store.editing.active) {
    return store.editing.draft;
  }

  return getCellRaw(store, store.selection.activeCellId);
}

function beginEdit(store, options) {
  const cellId = options && options.cellId ? options.cellId : store.selection.activeCellId;
  const source = options && options.source ? options.source : 'cell';
  const raw = getCellRaw(store, cellId);

  store.selection.activeCellId = cellId;
  store.editing.active = true;
  store.editing.source = source;
  store.editing.cellId = cellId;
  store.editing.draft = raw;
  store.editing.originalRaw = raw;
}

function applyTypedInput(store, text) {
  const cellId = store.selection.activeCellId;

  store.editing.active = true;
  store.editing.source = 'cell';
  store.editing.cellId = cellId;
  store.editing.originalRaw = getCellRaw(store, cellId);
  store.editing.draft = text;
}

function updateEditDraft(store, draft) {
  if (!store.editing.active) {
    beginEdit(store, { source: 'formula' });
  }

  store.editing.draft = draft;
}

function cancelEdit(store) {
  if (!store.editing.active) {
    return;
  }

  store.editing.active = false;
  store.editing.draft = '';
  store.editing.originalRaw = '';
  store.editing.cellId = null;
  store.editing.source = 'cell';
}

function commitEdit(store, options) {
  if (!store.editing.active) {
    return;
  }

  const move = options && options.move ? options.move : 'none';
  const cellId = store.editing.cellId || store.selection.activeCellId;

  setCellRaw(store, cellId, store.editing.draft);
  store.selection.activeCellId = moveSelection(cellId, move);
  store.editing.active = false;
  store.editing.draft = '';
  store.editing.originalRaw = '';
  store.editing.cellId = null;
  store.editing.source = 'cell';
}

function moveSelection(cellId, move) {
  if (move === 'none') {
    return cellId;
  }

  const position = parseCellId(cellId);
  let nextColumn = position.column;
  let nextRow = position.row;

  if (move === 'down') {
    nextRow += 1;
  } else if (move === 'up') {
    nextRow -= 1;
  } else if (move === 'right') {
    nextColumn += 1;
  } else if (move === 'left') {
    nextColumn -= 1;
  }

  return formatCellId({
    column: clamp(nextColumn, 1, MAX_COLUMNS),
    row: clamp(nextRow, 1, MAX_ROWS),
  });
}

function parseCellId(cellId) {
  const match = /^([A-Z])(\d+)$/.exec(cellId);
  if (!match) {
    throw new Error('Invalid cell id: ' + cellId);
  }

  return {
    column: match[1].charCodeAt(0) - 64,
    row: Number(match[2]),
  };
}

function formatCellId(position) {
  return String.fromCharCode(64 + position.column) + String(position.row);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const exportsObject = {
  MAX_COLUMNS,
  MAX_ROWS,
  createSpreadsheetStore,
  beginEdit,
  applyTypedInput,
  updateEditDraft,
  commitEdit,
  cancelEdit,
  getCellRaw,
  getFormulaBarText,
  moveSelection,
  parseCellId,
  formatCellId,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObject;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetEditing = exportsObject;
}
