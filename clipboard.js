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

  function normalizeRange(range) {
    return {
      start: {
        row: Math.min(range.start.row, range.end.row),
        col: Math.min(range.start.col, range.end.col),
      },
      end: {
        row: Math.max(range.start.row, range.end.row),
        col: Math.max(range.start.col, range.end.col),
      },
    };
  }

  function resolvePasteTarget(range, active, matrix) {
    var normalized = normalizeRange(range);
    var width = normalized.end.col - normalized.start.col + 1;
    var height = normalized.end.row - normalized.start.row + 1;
    var matrixHeight = matrix.length;
    var matrixWidth = matrix[0] ? matrix[0].length : 1;

    if (width === matrixWidth && height === matrixHeight) {
      return { row: normalized.start.row, col: normalized.start.col };
    }

    return { row: active.row, col: active.col };
  }

  return {
    cellsToClearAfterCut: cellsToClearAfterCut,
    resolvePasteTarget: resolvePasteTarget,
  };
});
