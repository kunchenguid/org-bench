(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function indexToColumnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function columnLabelToIndex(label) {
    return label.toUpperCase().charCodeAt(0) - 65;
  }

  function clampSelection(selection, rowCount, columnCount) {
    return {
      row: Math.max(0, Math.min(rowCount - 1, selection.row)),
      col: Math.max(0, Math.min(columnCount - 1, selection.col)),
    };
  }

  return {
    indexToColumnLabel,
    columnLabelToIndex,
    clampSelection,
  };
});
