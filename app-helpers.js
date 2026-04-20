(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetAppHelpers = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function cloneCells(cells) {
    return JSON.parse(JSON.stringify(cells));
  }

  function shiftFormulaForPaste(value, sourceCell, destinationCell, bounds) {
    if (!value || value.charAt(0) !== '=') {
      return value;
    }

    const maxCol = bounds ? bounds.maxCol : 25;
    const maxRow = bounds ? bounds.maxRow : 100;
    const colDelta = destinationCell.col - sourceCell.col;
    const rowDelta = destinationCell.row - sourceCell.row;

    return value.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (_, absCol, columnName, absRow, rowNumber) {
      let nextColumn = columnNameToIndex(columnName);
      let nextRow = Number(rowNumber);
      if (!absCol) nextColumn += colDelta;
      if (!absRow) nextRow += rowDelta;
      nextColumn = clamp(nextColumn, 0, maxCol);
      nextRow = clamp(nextRow, 1, maxRow);
      return (absCol ? '$' : '') + columnIndexToName(nextColumn) + (absRow ? '$' : '') + nextRow;
    });
  }

  function applyUndo(currentCells, undoStack, redoStack) {
    if (!undoStack.length) {
      return { cells: currentCells, undoStack: undoStack, redoStack: redoStack };
    }

    const nextUndo = undoStack.slice(0, -1);
    const entry = undoStack[undoStack.length - 1];
    return {
      cells: cloneCells(entry.before),
      undoStack: nextUndo,
      redoStack: redoStack.concat([{ before: cloneCells(entry.before), after: cloneCells(entry.after) }]),
    };
  }

  function applyRedo(currentCells, undoStack, redoStack) {
    if (!redoStack.length) {
      return { cells: currentCells, undoStack: undoStack, redoStack: redoStack };
    }

    const nextRedo = redoStack.slice(0, -1);
    const entry = redoStack[redoStack.length - 1];
    return {
      cells: cloneCells(entry.after),
      undoStack: undoStack.concat([{ before: cloneCells(entry.before), after: cloneCells(entry.after) }]),
      redoStack: nextRedo,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function columnNameToIndex(name) {
    let value = 0;
    for (let index = 0; index < name.length; index += 1) {
      value = value * 26 + (name.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function columnIndexToName(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  return {
    cloneCells: cloneCells,
    shiftFormulaForPaste: shiftFormulaForPaste,
    applyUndo: applyUndo,
    applyRedo: applyRedo,
  };
});
