(function (global) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function columnLabel(column) {
    return String.fromCharCode(65 + column);
  }

  function cellKey(row, column) {
    return columnLabel(column) + String(row + 1);
  }

  function createSheetState() {
    return {
      rowCount: 100,
      columnCount: 26,
      selection: { row: 0, column: 0 },
      cells: {},
    };
  }

  function moveSelection(state, rowDelta, columnDelta) {
    state.selection = {
      row: clamp(state.selection.row + rowDelta, 0, state.rowCount - 1),
      column: clamp(state.selection.column + columnDelta, 0, state.columnCount - 1),
    };
    return state.selection;
  }

  function coerceDisplayValue(raw) {
    if (raw == null || raw === '') {
      return '';
    }

    if (raw[0] === '=') {
      return raw;
    }

    const trimmed = raw.trim();
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
      return String(Number(trimmed));
    }

    return raw;
  }

  function commitCellInput(state, row, column, raw) {
    const key = cellKey(row, column);

    if (!raw) {
      delete state.cells[key];
      return;
    }

    state.cells[key] = {
      raw,
      display: coerceDisplayValue(raw),
    };
  }

  function getCell(state, row, column) {
    return state.cells[cellKey(row, column)] || null;
  }

  function getCellDisplay(state, row, column) {
    const cell = getCell(state, row, column);
    return cell ? cell.display : '';
  }

  const api = {
    cellKey,
    columnLabel,
    commitCellInput,
    createSheetState,
    getCell,
    getCellDisplay,
    moveSelection,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
