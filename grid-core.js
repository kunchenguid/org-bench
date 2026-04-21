(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.GridCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COLS = 26;
  const ROWS = 100;

  function buildInitialState() {
    return {
      active: { col: 0, row: 0 },
      anchor: null,
      range: null,
      editing: false,
    };
  }

  function clampCell(cell) {
    return {
      col: Math.max(0, Math.min(COLS - 1, cell.col)),
      row: Math.max(0, Math.min(ROWS - 1, cell.row)),
    };
  }

  function normalizeRange(range) {
    return {
      start: {
        col: Math.min(range.start.col, range.end.col),
        row: Math.min(range.start.row, range.end.row),
      },
      end: {
        col: Math.max(range.start.col, range.end.col),
        row: Math.max(range.start.row, range.end.row),
      },
      active: clampCell(range.active),
    };
  }

  function moveActive(from, key) {
    const next = { col: from.col, row: from.row };

    if (key === 'ArrowLeft') next.col -= 1;
    if (key === 'ArrowRight') next.col += 1;
    if (key === 'ArrowUp') next.row -= 1;
    if (key === 'ArrowDown') next.row += 1;

    return clampCell(next);
  }

  function selectionFromAnchor(anchor, active) {
    return normalizeRange({
      start: anchor,
      end: active,
      active,
    });
  }

  function colLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function cellId(cell) {
    return colLabel(cell.col) + String(cell.row + 1);
  }

  function cellKey(cell) {
    return cell.row + ':' + cell.col;
  }

  return {
    COLS,
    ROWS,
    buildInitialState,
    clampCell,
    normalizeRange,
    moveActive,
    selectionFromAnchor,
    colLabel,
    cellId,
    cellKey,
  };
});
