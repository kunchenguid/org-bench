(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetState = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  var DEFAULT_COLUMNS = 26;
  var DEFAULT_ROWS = 100;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function cloneCell(cell) {
    return { col: cell.col, row: cell.row };
  }

  function normalizeCell(cell, grid) {
    return {
      col: clamp(cell.col, 0, grid.columns - 1),
      row: clamp(cell.row, 0, grid.rows - 1),
    };
  }

  function getCellKey(cell) {
    return getColumnLabel(cell.col) + String(cell.row + 1);
  }

  function getColumnLabel(index) {
    var current = index;
    var label = '';

    do {
      label = String.fromCharCode(65 + (current % 26)) + label;
      current = Math.floor(current / 26) - 1;
    } while (current >= 0);

    return label;
  }

  function getCellRawValue(state, cell) {
    var entry = state.cells[getCellKey(cell)];
    return entry ? entry.raw : '';
  }

  function collapseSelection(state, cell) {
    return {
      anchor: cloneCell(cell),
      focus: cloneCell(cell),
    };
  }

  function copyCells(cells) {
    return Object.assign({}, cells);
  }

  function createInitialState(options) {
    var initial = options || {};
    var grid = {
      columns: DEFAULT_COLUMNS,
      rows: DEFAULT_ROWS,
    };
    var activeCell = normalizeCell(initial.activeCell || { col: 0, row: 0 }, grid);

    return {
      grid: grid,
      activeCell: activeCell,
      selection: collapseSelection({}, activeCell),
      mode: 'navigation',
      editing: null,
      cells: copyCells(initial.cells || {}),
    };
  }

  function withSelection(state, anchor, focus) {
    return Object.assign({}, state, {
      activeCell: cloneCell(focus),
      selection: {
        anchor: cloneCell(anchor),
        focus: cloneCell(focus),
      },
    });
  }

  function beginRangeSelection(state, cell) {
    var target = normalizeCell(cell, state.grid);
    return withSelection(state, target, target);
  }

  function extendSelectionTo(state, cell) {
    var focus = normalizeCell(cell, state.grid);
    var anchor = state.selection ? state.selection.anchor : state.activeCell;
    return withSelection(state, anchor, focus);
  }

  function moveActiveCell(state, delta) {
    var nextCell = normalizeCell(
      {
        col: state.activeCell.col + (delta.colDelta || 0),
        row: state.activeCell.row + (delta.rowDelta || 0),
      },
      state.grid
    );

    return Object.assign({}, state, {
      activeCell: nextCell,
      selection: collapseSelection(state, nextCell),
    });
  }

  function beginEditing(state) {
    if (state.mode === 'editing') {
      return state;
    }

    var raw = getCellRawValue(state, state.activeCell);
    return Object.assign({}, state, {
      mode: 'editing',
      editing: {
        cell: cloneCell(state.activeCell),
        originalValue: raw,
        draft: raw,
      },
    });
  }

  function beginEditingWithValue(state, draft) {
    var editingState = beginEditing(state);
    return applyEditDraft(editingState, draft);
  }

  function applyEditDraft(state, draft) {
    if (state.mode !== 'editing' || !state.editing) {
      return state;
    }

    return Object.assign({}, state, {
      editing: Object.assign({}, state.editing, { draft: draft }),
    });
  }

  function writeCell(state, cell, raw) {
    var key = getCellKey(cell);
    var nextCells = copyCells(state.cells);

    if (raw === '') {
      delete nextCells[key];
    } else {
      nextCells[key] = { raw: raw };
    }

    return nextCells;
  }

  function finishEditing(state, nextState) {
    return Object.assign({}, nextState, {
      mode: 'navigation',
      editing: null,
    });
  }

  function commitEdit(state, delta) {
    if (state.mode !== 'editing' || !state.editing) {
      return state;
    }

    var target = state.editing.cell;
    var nextCells = writeCell(state, target, state.editing.draft);
    var navigated = moveActiveCell(
      Object.assign({}, state, {
        cells: nextCells,
        activeCell: cloneCell(target),
        selection: collapseSelection(state, target),
      }),
      delta || { colDelta: 0, rowDelta: 0 }
    );

    return finishEditing(state, Object.assign({}, navigated, { cells: nextCells }));
  }

  function cancelEdit(state) {
    if (state.mode !== 'editing') {
      return state;
    }

    return finishEditing(state, state);
  }

  function getSelectionBounds(state) {
    var anchor = state.selection.anchor;
    var focus = state.selection.focus;

    return {
      minCol: Math.min(anchor.col, focus.col),
      maxCol: Math.max(anchor.col, focus.col),
      minRow: Math.min(anchor.row, focus.row),
      maxRow: Math.max(anchor.row, focus.row),
    };
  }

  function isCellInSelection(state, cell) {
    var bounds = getSelectionBounds(state);
    return (
      cell.col >= bounds.minCol &&
      cell.col <= bounds.maxCol &&
      cell.row >= bounds.minRow &&
      cell.row <= bounds.maxRow
    );
  }

  return {
    DEFAULT_COLUMNS: DEFAULT_COLUMNS,
    DEFAULT_ROWS: DEFAULT_ROWS,
    createInitialState: createInitialState,
    moveActiveCell: moveActiveCell,
    beginRangeSelection: beginRangeSelection,
    extendSelectionTo: extendSelectionTo,
    beginEditing: beginEditing,
    beginEditingWithValue: beginEditingWithValue,
    applyEditDraft: applyEditDraft,
    commitEdit: commitEdit,
    cancelEdit: cancelEdit,
    getSelectionBounds: getSelectionBounds,
    isCellInSelection: isCellInSelection,
    getCellKey: getCellKey,
    getColumnLabel: getColumnLabel,
    getCellRawValue: getCellRawValue,
  };
});
