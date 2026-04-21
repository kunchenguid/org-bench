(function (global) {
  'use strict';

  var GRID_COLUMNS = 26;
  var GRID_ROWS = 100;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampPosition(position) {
    return {
      col: clamp(position.col, 0, GRID_COLUMNS - 1),
      row: clamp(position.row, 0, GRID_ROWS - 1),
    };
  }

  function movePosition(position, colDelta, rowDelta) {
    return clampPosition({
      col: position.col + colDelta,
      row: position.row + rowDelta,
    });
  }

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function cellKey(position) {
    return columnLabel(position.col) + String(position.row + 1);
  }

  function storageKey(namespace, suffix) {
    return String(namespace || '') + suffix;
  }

  var api = {
    GRID_COLUMNS: GRID_COLUMNS,
    GRID_ROWS: GRID_ROWS,
    clampPosition: clampPosition,
    movePosition: movePosition,
    columnLabel: columnLabel,
    cellKey: cellKey,
    storageKey: storageKey,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
