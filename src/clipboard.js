(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./formula.js'));
    return;
  }

  root.ClipboardEngine = factory(root.FormulaEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (formulaEngine) {
  'use strict';

  function cloneCells(sheet) {
    return formulaEngine.createSheet(sheet.cells);
  }

  function boundsSize(bounds) {
    return {
      rows: bounds.bottom - bounds.top + 1,
      cols: bounds.right - bounds.left + 1,
    };
  }

  function applyMatrixToSheet(options) {
    var sheet = cloneCells(options.sheet);
    var targetBounds = options.targetBounds;
    var selectionSize = boundsSize(targetBounds);
    var sourceRows = options.matrix.length;
    var sourceCols = options.matrix[0] ? options.matrix[0].length : 1;
    var useSelectionSize = selectionSize.rows === sourceRows && selectionSize.cols === sourceCols && (selectionSize.rows > 1 || selectionSize.cols > 1);
    var targetTop = useSelectionSize ? targetBounds.top : options.activePoint.row;
    var targetLeft = useSelectionSize ? targetBounds.left : options.activePoint.col;
    var sourceTop = options.sourceBounds ? options.sourceBounds.top : 1;
    var sourceLeft = options.sourceBounds ? options.sourceBounds.left : 1;
    var rowIndex;
    var colIndex;

    for (rowIndex = 0; rowIndex < sourceRows; rowIndex += 1) {
      for (colIndex = 0; colIndex < sourceCols; colIndex += 1) {
        var destinationRow = targetTop + rowIndex;
        var destinationCol = targetLeft + colIndex;
        if (destinationRow > options.rowCount || destinationCol > options.columnCount) {
          continue;
        }
        var raw = options.matrix[rowIndex][colIndex] || '';
        if (options.sourceBounds && raw.charAt(0) === '=') {
          raw = formulaEngine.moveFormula(raw, destinationRow - (sourceTop + rowIndex), destinationCol - (sourceLeft + colIndex));
        }
        var destinationId = formulaEngine.indexToCol(destinationCol) + String(destinationRow);
        if (raw === '') {
          delete sheet.cells[destinationId];
        } else {
          sheet.cells[destinationId] = raw;
        }
      }
    }

    if (options.pendingCut && options.sourceBounds) {
      var row;
      var col;
      for (row = options.sourceBounds.top; row <= options.sourceBounds.bottom; row += 1) {
        for (col = options.sourceBounds.left; col <= options.sourceBounds.right; col += 1) {
          if (row >= targetTop && row < targetTop + sourceRows && col >= targetLeft && col < targetLeft + sourceCols) {
            continue;
          }
          delete sheet.cells[formulaEngine.indexToCol(col) + String(row)];
        }
      }
    }

    return {
      sheet: sheet,
      anchor: { row: targetTop, col: targetLeft },
      selection: {
        row: Math.min(options.rowCount, targetTop + sourceRows - 1),
        col: Math.min(options.columnCount, targetLeft + sourceCols - 1),
      },
      pendingCut: options.pendingCut && options.sourceBounds ? null : options.pendingCut,
    };
  }

  return {
    applyMatrixToSheet: applyMatrixToSheet,
  };
});
