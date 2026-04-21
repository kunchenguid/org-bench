(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetSelection = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function decodeAddress(address) {
    const match = /^([A-Z]+)(\d+)$/.exec(address.toUpperCase());
    if (!match) {
      throw new Error('Invalid address: ' + address);
    }

    return {
      col: decodeColumn(match[1]),
      row: Number(match[2]) - 1,
    };
  }

  function decodeColumn(column) {
    let value = 0;
    for (let index = 0; index < column.length; index += 1) {
      value = value * 26 + (column.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function createSelection(anchorAddress, focusAddress) {
    const anchor = decodeAddress(anchorAddress);
    const focus = decodeAddress(focusAddress);

    return {
      startCol: Math.min(anchor.col, focus.col),
      endCol: Math.max(anchor.col, focus.col),
      startRow: Math.min(anchor.row, focus.row),
      endRow: Math.max(anchor.row, focus.row),
    };
  }

  function isInRange(selection, address) {
    const point = decodeAddress(address);
    return point.col >= selection.startCol && point.col <= selection.endCol && point.row >= selection.startRow && point.row <= selection.endRow;
  }

  return {
    createSelection: createSelection,
    isInRange: isInRange,
  };
});
