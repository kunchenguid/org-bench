function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function keyForCell(row, col) {
  return `${row}:${col}`;
}

function getCellRaw(state, row, col) {
  return state.cells[keyForCell(row, col)] || '';
}

function createInitialState(seed = {}) {
  const initialSelection = seed.selection || { row: 0, col: 0 };

  return {
    grid: {
      rows: 100,
      cols: 26,
    },
    cells: { ...(seed.cells || {}) },
    selection: {
      anchor: { ...initialSelection },
      focus: { ...initialSelection },
    },
    mode: 'nav',
    editor: null,
  };
}

function moveSelection(state, row, col) {
  const nextRow = clamp(row, 0, state.grid.rows - 1);
  const nextCol = clamp(col, 0, state.grid.cols - 1);

  state.selection.anchor = { row: nextRow, col: nextCol };
  state.selection.focus = { row: nextRow, col: nextCol };
}

function extendSelection(state, row, col) {
  state.selection.focus = {
    row: clamp(row, 0, state.grid.rows - 1),
    col: clamp(col, 0, state.grid.cols - 1),
  };
}

function beginEdit(state, source) {
  const { row, col } = state.selection.focus;

  state.mode = 'edit';
  state.editor = {
    source,
    row,
    col,
    original: getCellRaw(state, row, col),
    draft: getCellRaw(state, row, col),
  };
}

function updateDraft(state, draft) {
  if (!state.editor) {
    return;
  }

  state.editor.draft = draft;
}

function commitEdit(state) {
  if (!state.editor) {
    return;
  }

  state.cells[keyForCell(state.editor.row, state.editor.col)] = state.editor.draft;
  state.mode = 'nav';
  state.editor = null;
}

function cancelEdit(state) {
  state.mode = 'nav';
  state.editor = null;
}

const api = {
  keyForCell,
  getCellRaw,
  createInitialState,
  moveSelection,
  extendSelection,
  beginEdit,
  updateDraft,
  commitEdit,
  cancelEdit,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.oracleSheetState = api;
}
