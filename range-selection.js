(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.RangeSelection = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeRange(start, end) {
    return {
      startRow: Math.min(start.row, end.row),
      endRow: Math.max(start.row, end.row),
      startCol: Math.min(start.col, end.col),
      endCol: Math.max(start.col, end.col),
    };
  }

  function buildRangeSelection(anchor, focus) {
    return {
      anchor: { row: anchor.row, col: anchor.col },
      focus: { row: focus.row, col: focus.col },
      active: { row: focus.row, col: focus.col },
      range: normalizeRange(anchor, focus),
    };
  }

  function extendSelectionWithArrow(selectionState, key, bounds) {
    var delta = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    }[key];

    if (!delta) {
      return buildRangeSelection(selectionState.anchor, selectionState.focus);
    }

    var nextFocus = {
      row: clamp(selectionState.focus.row + delta.row, 1, bounds.rows),
      col: clamp(selectionState.focus.col + delta.col, 1, bounds.cols),
    };

    return buildRangeSelection(selectionState.anchor, nextFocus);
  }

  function getCellRaw(grid, row, col) {
    var entry = grid.get(row + ':' + col);
    return entry && typeof entry.raw === 'string' ? entry.raw : '';
  }

  function copyRange(grid, range) {
    var rows = [];
    for (var row = range.startRow; row <= range.endRow; row += 1) {
      var cols = [];
      for (var col = range.startCol; col <= range.endCol; col += 1) {
        cols.push(getCellRaw(grid, row, col));
      }
      rows.push(cols);
    }
    return rows;
  }

  function planClearRange(range) {
    var operations = [];
    for (var row = range.startRow; row <= range.endRow; row += 1) {
      for (var col = range.startCol; col <= range.endCol; col += 1) {
        operations.push({ row: row, col: col, raw: '' });
      }
    }
    return operations;
  }

  function normalizePasteTarget(target) {
    if (typeof target.row === 'number' && typeof target.col === 'number') {
      return {
        startRow: target.row,
        endRow: target.row,
        startCol: target.col,
        endCol: target.col,
      };
    }

    return {
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    };
  }

  function getBlockSize(block) {
    return {
      rows: block.length,
      cols: block[0] ? block[0].length : 0,
    };
  }

  function getTargetSize(targetRange) {
    return {
      rows: targetRange.endRow - targetRange.startRow + 1,
      cols: targetRange.endCol - targetRange.startCol + 1,
    };
  }

  function planPaste(block, target, options) {
    var settings = options || {};
    var adjustCell = typeof settings.adjustCell === 'function'
      ? settings.adjustCell
      : function (context) {
          return context.raw;
        };
    var targetRange = normalizePasteTarget(target);
    var blockSize = getBlockSize(block);
    var targetSize = getTargetSize(targetRange);
    var repeatSingleCell = blockSize.rows === 1 && blockSize.cols === 1 && (targetSize.rows > 1 || targetSize.cols > 1);
    var matchingShape = blockSize.rows === targetSize.rows && blockSize.cols === targetSize.cols;

    if (!repeatSingleCell && !matchingShape) {
      targetRange.endRow = targetRange.startRow + blockSize.rows - 1;
      targetRange.endCol = targetRange.startCol + blockSize.cols - 1;
      targetSize = getTargetSize(targetRange);
    }

    var operations = [];
    for (var rowOffset = 0; rowOffset < targetSize.rows; rowOffset += 1) {
      for (var colOffset = 0; colOffset < targetSize.cols; colOffset += 1) {
        var sourceRowOffset = repeatSingleCell ? 0 : rowOffset;
        var sourceColOffset = repeatSingleCell ? 0 : colOffset;
        var raw = block[sourceRowOffset] && typeof block[sourceRowOffset][sourceColOffset] === 'string'
          ? block[sourceRowOffset][sourceColOffset]
          : '';
        var targetCell = {
          row: targetRange.startRow + rowOffset,
          col: targetRange.startCol + colOffset,
        };
        var sourceCell = {
          row: sourceRowOffset + 1,
          col: sourceColOffset + 1,
        };

        operations.push({
          row: targetCell.row,
          col: targetCell.col,
          raw: adjustCell({
            raw: raw,
            sourceCell: sourceCell,
            targetCell: targetCell,
          }),
        });
      }
    }

    return operations;
  }

  function planCut(grid, range) {
    return {
      block: copyRange(grid, range),
      clearOperations: planClearRange(range),
    };
  }

  return {
    normalizeRange: normalizeRange,
    buildRangeSelection: buildRangeSelection,
    extendSelectionWithArrow: extendSelectionWithArrow,
    copyRange: copyRange,
    planClearRange: planClearRange,
    planPaste: planPaste,
    planCut: planCut,
  };
});
