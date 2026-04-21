const DEFAULT_COLUMN_COUNT = 26;
const DEFAULT_ROW_COUNT = 100;

function columnIndexToLabel(index) {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function cellPositionToId(columnIndex, rowIndex) {
  return `${columnIndexToLabel(columnIndex)}${rowIndex + 1}`;
}

function parseCellId(cellId) {
  const match = /^([A-Z]+)(\d+)$/.exec(cellId);

  if (!match) {
    throw new Error(`Invalid cell id: ${cellId}`);
  }

  const [, columnLabel, rowLabel] = match;
  let columnIndex = 0;

  for (let index = 0; index < columnLabel.length; index += 1) {
    columnIndex = (columnIndex * 26) + (columnLabel.charCodeAt(index) - 64);
  }

  return {
    columnIndex: columnIndex - 1,
    rowIndex: Number(rowLabel) - 1,
  };
}

function createSpreadsheetShellModel(options = {}) {
  const columnCount = options.columnCount || DEFAULT_COLUMN_COUNT;
  const rowCount = options.rowCount || DEFAULT_ROW_COUNT;
  const columns = Array.from({ length: columnCount }, (_, columnIndex) => ({
    index: columnIndex,
    label: columnIndexToLabel(columnIndex),
  }));
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => ({
    index: rowIndex + 1,
    cells: columns.map((column) => ({
      id: `${column.label}${rowIndex + 1}`,
      columnIndex: column.index,
      rowIndex,
    })),
  }));

  return {
    columnCount,
    rowCount,
    columns,
    rows,
  };
}

function createInitialShellState() {
  return {
    cells: {},
    selection: {
      activeCellId: 'A1',
      anchorCellId: 'A1',
      focusCellId: 'A1',
    },
    mode: 'navigate',
    formulaBarValue: '',
    draftValue: '',
    editing: null,
  };
}

function createSpreadsheetEditingController(options = {}) {
  const model = createSpreadsheetShellModel(options.model);
  const baseState = createInitialShellState();
  const initialState = options.initialState || {};
  const state = {
    ...baseState,
    ...initialState,
    cells: {
      ...baseState.cells,
      ...(initialState.cells || {}),
    },
    selection: {
      ...baseState.selection,
      ...(initialState.selection || {}),
    },
  };

  syncFormulaBarWithSelection();

  function getCellRawValue(cellId) {
    return state.cells[cellId] || '';
  }

  function syncFormulaBarWithSelection() {
    const activeCellId = state.selection.activeCellId;

    state.formulaBarValue = state.mode === 'edit'
      ? state.draftValue
      : getCellRawValue(activeCellId);
  }

  function setActiveCell(cellId) {
    state.selection = {
      activeCellId: cellId,
      anchorCellId: cellId,
      focusCellId: cellId,
    };
    syncFormulaBarWithSelection();
  }

  function moveSelection(columnDelta, rowDelta) {
    const position = parseCellId(state.selection.activeCellId);
    const nextColumn = clamp(position.columnIndex + columnDelta, 0, model.columnCount - 1);
    const nextRow = clamp(position.rowIndex + rowDelta, 0, model.rowCount - 1);

    setActiveCell(cellPositionToId(nextColumn, nextRow));
  }

  function beginEdit(source = 'cell', replacementValue) {
    const cellId = state.selection.activeCellId;
    const originalValue = getCellRawValue(cellId);

    state.mode = 'edit';
    state.editing = {
      cellId,
      source,
      originalValue,
    };
    state.draftValue = replacementValue !== undefined ? replacementValue : originalValue;
    syncFormulaBarWithSelection();
  }

  function updateDraftValue(value) {
    if (state.mode !== 'edit') {
      beginEdit('formula-bar', value);
      return;
    }

    state.draftValue = value;
    syncFormulaBarWithSelection();
  }

  function cancelEdit() {
    if (state.mode !== 'edit') {
      return;
    }

    state.mode = 'navigate';
    state.draftValue = '';
    state.editing = null;
    syncFormulaBarWithSelection();
  }

  function commitEdit(move) {
    if (state.mode !== 'edit') {
      return;
    }

    const cellId = state.editing.cellId;
    state.cells[cellId] = state.draftValue;
    state.mode = 'navigate';
    state.draftValue = '';
    state.editing = null;

    if (move === 'down') {
      moveSelection(0, 1);
      return;
    }

    if (move === 'right') {
      moveSelection(1, 0);
      return;
    }

    syncFormulaBarWithSelection();
  }

  function handleKeyDown(event) {
    const key = event.key;

    if (state.mode === 'edit') {
      if (key === 'Enter') {
        commitEdit('down');
      } else if (key === 'Tab') {
        commitEdit('right');
      } else if (key === 'Escape') {
        cancelEdit();
      }
      return;
    }

    if (key === 'Enter' || key === 'F2') {
      beginEdit('cell');
      return;
    }

    if (key === 'ArrowLeft') {
      moveSelection(-1, 0);
    } else if (key === 'ArrowRight') {
      moveSelection(1, 0);
    } else if (key === 'ArrowUp') {
      moveSelection(0, -1);
    } else if (key === 'ArrowDown') {
      moveSelection(0, 1);
    }
  }

  function handleTextInput(text) {
    beginEdit('cell', text);
  }

  function getState() {
    return {
      cells: { ...state.cells },
      selection: { ...state.selection },
      mode: state.mode,
      formulaBarValue: state.formulaBarValue,
      draftValue: state.draftValue,
      editing: state.editing ? { ...state.editing } : null,
    };
  }

  return {
    getState,
    getCellRawValue,
    selectCell: setActiveCell,
    beginEdit,
    beginFormulaBarEdit() {
      beginEdit('formula-bar');
    },
    updateDraftValue,
    handleTextInput,
    commitEdit,
    cancelEdit,
    handleKeyDown,
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

module.exports = {
  createSpreadsheetShellModel,
  columnIndexToLabel,
  createInitialShellState,
  createSpreadsheetEditingController,
};

if (typeof window !== 'undefined') {
  window.SpreadsheetShell = module.exports;
}
