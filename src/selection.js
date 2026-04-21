(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetSelection = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parseAddress(address) {
    const match = address.match(/^([A-Z]+)(\d+)$/);
    return {
      column: labelToColumn(match[1]),
      row: Number(match[2]),
    };
  }

  function labelToColumn(label) {
    let total = 0;
    for (let index = 0; index < label.length; index += 1) {
      total = total * 26 + (label.charCodeAt(index) - 64);
    }
    return total;
  }

  function columnToLabel(column) {
    let result = '';
    let current = column;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      current = Math.floor((current - 1) / 26);
    }
    return result;
  }

  function normalizeRange(anchor, focus) {
    const start = parseAddress(anchor);
    const end = parseAddress(focus);
    return {
      start: columnToLabel(Math.min(start.column, end.column)) + Math.min(start.row, end.row),
      end: columnToLabel(Math.max(start.column, end.column)) + Math.max(start.row, end.row),
    };
  }

  function listAddressesInRange(anchor, focus) {
    const range = normalizeRange(anchor, focus);
    const start = parseAddress(range.start);
    const end = parseAddress(range.end);
    const addresses = [];
    for (let row = start.row; row <= end.row; row += 1) {
      for (let column = start.column; column <= end.column; column += 1) {
        addresses.push(columnToLabel(column) + row);
      }
    }
    return addresses;
  }

  return {
    normalizeRange: normalizeRange,
    listAddressesInRange: listAddressesInRange,
    parseAddress: parseAddress,
  };
});
