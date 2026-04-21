function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createEmptyCells() {
  return new Map();
}

function getCellKey(row, col) {
  return `${row}:${col}`;
}

function isPrintableKey(key) {
  return key.length === 1 && key !== '\r' && key !== '\n';
}

function createSpreadsheetController(options = {}) {
  const rows = options.rows ?? 100;
  const cols = options.cols ?? 26;
  const cells = createEmptyCells();

  const state = {
    selection: { row: 0, col: 0 },
    editor: null,
  };

  function getCellRaw(row, col) {
    return cells.get(getCellKey(row, col)) ?? '';
  }

  function setCellRaw(row, col, value) {
    const key = getCellKey(row, col);
    if (value) {
      cells.set(key, value);
      return;
    }

    cells.delete(key);
  }

  function getSelection() {
    return { ...state.selection };
  }

  function selectCell(row, col) {
    state.selection = {
      row: clamp(row, 0, rows - 1),
      col: clamp(col, 0, cols - 1),
    };
    return getSelection();
  }

  function beginEdit(source, draft) {
    state.editor = {
      source,
      row: state.selection.row,
      col: state.selection.col,
      original: getCellRaw(state.selection.row, state.selection.col),
      draft,
    };
    return getEditorState();
  }

  function startCellEdit() {
    return beginEdit('cell', getCellRaw(state.selection.row, state.selection.col));
  }

  function startFormulaBarEdit() {
    return beginEdit('formula', getCellRaw(state.selection.row, state.selection.col));
  }

  function startReplacement(key) {
    return beginEdit('cell', key);
  }

  function getEditorState() {
    return state.editor ? { ...state.editor } : null;
  }

  function isEditing() {
    return Boolean(state.editor);
  }

  function moveSelection(deltaRow, deltaCol) {
    return selectCell(state.selection.row + deltaRow, state.selection.col + deltaCol);
  }

  function commitEdit(move) {
    if (!state.editor) {
      return getSelection();
    }

    const { row, col, draft } = state.editor;
    setCellRaw(row, col, draft);
    state.editor = null;

    if (move === 'down') {
      return moveSelection(1, 0);
    }

    if (move === 'right') {
      return moveSelection(0, 1);
    }

    return getSelection();
  }

  function cancelEdit() {
    state.editor = null;
    return getSelection();
  }

  function handleEditorInput(value) {
    if (!state.editor) {
      return null;
    }

    state.editor = {
      ...state.editor,
      draft: value,
    };
    return getEditorState();
  }

  function handleEditorKeyDown(event) {
    if (!state.editor) {
      return null;
    }

    if (event.key === 'Escape') {
      return cancelEdit();
    }

    if (event.key === 'Enter') {
      return commitEdit('down');
    }

    if (event.key === 'Tab') {
      return commitEdit('right');
    }

    return getEditorState();
  }

  function handleKeyDown(event) {
    if (state.editor) {
      return handleEditorKeyDown(event);
    }

    switch (event.key) {
      case 'ArrowUp':
        return moveSelection(-1, 0);
      case 'ArrowDown':
        return moveSelection(1, 0);
      case 'ArrowLeft':
        return moveSelection(0, -1);
      case 'ArrowRight':
        return moveSelection(0, 1);
      case 'Enter':
      case 'F2':
        return startCellEdit();
      default:
        if (isPrintableKey(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
          return startReplacement(event.key);
        }

        return getSelection();
    }
  }

  function clickCell(row, col) {
    return selectCell(row, col);
  }

  function doubleClickCell(row, col) {
    selectCell(row, col);
    return startCellEdit();
  }

  return {
    cancelEdit,
    clickCell,
    commitEdit,
    doubleClickCell,
    getCellRaw,
    getEditorState,
    getSelection,
    handleEditorInput,
    handleEditorKeyDown,
    handleKeyDown,
    isEditing,
    selectCell,
    setCellRaw,
    startFormulaBarEdit,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createSpreadsheetController,
  };
}

if (typeof window !== 'undefined') {
  window.SpreadsheetController = {
    createSpreadsheetController,
  };
}
