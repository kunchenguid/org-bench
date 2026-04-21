'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.GridSelection = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clampPoint(point, dimensions) {
    return {
      row: clamp(point.row, 0, dimensions.rowCount - 1),
      col: clamp(point.col, 0, dimensions.colCount - 1),
    };
  }

  function normalizeSelectionRange(selection) {
    return {
      startRow: Math.min(selection.anchor.row, selection.focus.row),
      endRow: Math.max(selection.anchor.row, selection.focus.row),
      startCol: Math.min(selection.anchor.col, selection.focus.col),
      endCol: Math.max(selection.anchor.col, selection.focus.col),
    };
  }

  function clonePoint(point) {
    return { row: point.row, col: point.col };
  }

  function createSelectionController(store, dimensions) {
    function selectCell(point, behavior) {
      const snapshot = store.getSnapshot();
      const nextPoint = clampPoint(point, dimensions);
      const extend = Boolean(behavior && behavior.extend);
      const anchor = extend ? snapshot.selection.anchor : nextPoint;

      store.setActiveCell(nextPoint);
      store.setSelection({
        anchor: clonePoint(anchor),
        focus: clonePoint(nextPoint),
      });
    }

    function moveActiveCell(rowDelta, colDelta, behavior) {
      const snapshot = store.getSnapshot();
      selectCell(
        {
          row: snapshot.activeCell.row + rowDelta,
          col: snapshot.activeCell.col + colDelta,
        },
        behavior
      );
    }

    return {
      selectCell,
      moveActiveCell,
    };
  }

  return {
    clampPoint,
    normalizeSelectionRange,
    createSelectionController,
  };
});
