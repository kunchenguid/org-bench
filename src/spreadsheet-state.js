(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetState = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function createStorageKey(namespace, suffix) {
    return (namespace ? String(namespace) : 'spreadsheet') + ':' + suffix;
  }

  function moveSelection(cellId, colDelta, rowDelta, colCount, rowCount) {
    const position = cellIdToPosition(cellId);
    const nextCol = clamp(position.col + colDelta, 0, colCount - 1);
    const nextRow = clamp(position.row + rowDelta, 0, rowCount - 1);
    return positionToCellId(nextCol, nextRow);
  }

  function cellIdToPosition(cellId) {
    const match = String(cellId).match(/^([A-Z]+)([1-9][0-9]*)$/);
    if (!match) {
      return { col: 0, row: 0 };
    }
    return {
      col: columnNameToIndex(match[1]) - 1,
      row: Number(match[2]) - 1,
    };
  }

  function positionToCellId(col, row) {
    return columnIndexToName(col + 1) + String(row + 1);
  }

  function columnIndexToName(index) {
    let current = index;
    let name = '';
    while (current > 0) {
      const remainder = (current - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      current = Math.floor((current - 1) / 26);
    }
    return name;
  }

  function columnNameToIndex(name) {
    let value = 0;
    for (let i = 0; i < name.length; i += 1) {
      value = value * 26 + (name.charCodeAt(i) - 64);
    }
    return value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    createStorageKey: createStorageKey,
    moveSelection: moveSelection,
    cellIdToPosition: cellIdToPosition,
    positionToCellId: positionToCellId,
  };
});
