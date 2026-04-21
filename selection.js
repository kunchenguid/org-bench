(function (global) {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clampCell(cell, rowCount, colCount) {
    return {
      row: clamp(cell.row, 0, rowCount - 1),
      col: clamp(cell.col, 0, colCount - 1),
    };
  }

  function normalizeRange(selection) {
    return {
      startRow: Math.min(selection.anchor.row, selection.focus.row),
      endRow: Math.max(selection.anchor.row, selection.focus.row),
      startCol: Math.min(selection.anchor.col, selection.focus.col),
      endCol: Math.max(selection.anchor.col, selection.focus.col),
    };
  }

  function createSelectionStore(options) {
    const rowCount = options.rowCount;
    const colCount = options.colCount;
    const listeners = new Set();

    let selection = {
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
      active: { row: 0, col: 0 },
    };

    function emit() {
      const snapshot = getSelection();
      listeners.forEach(function (listener) {
        listener(snapshot);
      });
    }

    function getSelection() {
      return {
        anchor: { row: selection.anchor.row, col: selection.anchor.col },
        focus: { row: selection.focus.row, col: selection.focus.col },
        active: { row: selection.active.row, col: selection.active.col },
      };
    }

    function setActiveCell(row, col, behavior) {
      const extend = Boolean(behavior && behavior.extend);
      const nextFocus = clampCell({ row: row, col: col }, rowCount, colCount);

      selection = {
        anchor: extend ? selection.anchor : nextFocus,
        focus: nextFocus,
        active: nextFocus,
      };

      emit();
    }

    function moveActiveCell(deltaRow, deltaCol, behavior) {
      setActiveCell(selection.active.row + deltaRow, selection.active.col + deltaCol, behavior);
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    return {
      getSelection: getSelection,
      setActiveCell: setActiveCell,
      moveActiveCell: moveActiveCell,
      subscribe: subscribe,
      getDimensions: function () {
        return { rowCount: rowCount, colCount: colCount };
      },
    };
  }

  const api = {
    clampCell: clampCell,
    normalizeRange: normalizeRange,
    createSelectionStore: createSelectionStore,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.SelectionModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
