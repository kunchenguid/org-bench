(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cellIdToPosition(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    if (!match) {
      throw new Error('Invalid cell id');
    }
    let col = 0;
    for (let index = 0; index < match[1].length; index += 1) {
      col = col * 26 + (match[1].charCodeAt(index) - 64);
    }
    return {
      col: col - 1,
      row: Number(match[2]) - 1,
    };
  }

  function positionToCellId(col, row) {
    let value = col + 1;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - remainder - 1) / 26);
    }
    return letters + String(row + 1);
  }

  function moveSelection(cellId, colDelta, rowDelta, colCount, rowCount) {
    const current = cellIdToPosition(cellId);
    const nextCol = Math.max(0, Math.min(colCount - 1, current.col + colDelta));
    const nextRow = Math.max(0, Math.min(rowCount - 1, current.row + rowDelta));
    return positionToCellId(nextCol, nextRow);
  }

  return {
    cellIdToPosition: cellIdToPosition,
    positionToCellId: positionToCellId,
    moveSelection: moveSelection,
  };
});
