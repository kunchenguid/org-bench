(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetClipboard = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cellsToClearAfterCut(sourceOrigin, matrix, targetOrigin) {
    var sourceCells = {};
    var targetCells = {};
    var cells = [];

    for (var row = 0; row < matrix.length; row += 1) {
      for (var col = 0; col < matrix[row].length; col += 1) {
        var sourceKey = (sourceOrigin.row + row) + ',' + (sourceOrigin.col + col);
        var targetKey = (targetOrigin.row + row) + ',' + (targetOrigin.col + col);
        sourceCells[sourceKey] = { row: sourceOrigin.row + row, col: sourceOrigin.col + col };
        targetCells[targetKey] = true;
      }
    }

    Object.keys(sourceCells).forEach(function (key) {
      if (!targetCells[key]) {
        cells.push(sourceCells[key]);
      }
    });

    return cells;
  }

  return {
    cellsToClearAfterCut: cellsToClearAfterCut,
  };
});
