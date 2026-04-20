(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetClipboard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createClipboardPayload(cells, anchorId, endId, formulaApi, isCut) {
    const bounds = getBounds(anchorId, endId, formulaApi);
    const rows = [];
    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      const line = [];
      for (let column = bounds.minColumn; column <= bounds.maxColumn; column += 1) {
        const cellId = formulaApi.columnIndexToName(column) + row;
        line.push(Object.prototype.hasOwnProperty.call(cells, cellId) ? cells[cellId] : '');
      }
      rows.push(line);
    }

    return {
      rows: rows,
      width: bounds.maxColumn - bounds.minColumn + 1,
      height: bounds.maxRow - bounds.minRow + 1,
      sourceRow: bounds.minRow,
      sourceCol: bounds.minColumn,
      isCut: Boolean(isCut),
      text: rows.map(function (line) { return line.join('\t'); }).join('\n'),
    };
  }

  function createTextClipboardPayload(text) {
    const rows = text.split(/\r?\n/).map(function (line) { return line.split('\t'); });
    return {
      rows: rows,
      width: rows[0] ? rows[0].length : 0,
      height: rows.length,
      sourceRow: null,
      sourceCol: null,
      isCut: false,
      text: text,
    };
  }

  function applyClipboardPayload(cells, payload, anchorId, endId, formulaApi, maxCols, maxRows) {
    const nextCells = JSON.parse(JSON.stringify(cells));
    const bounds = getBounds(anchorId, endId, formulaApi);
    const selectionWidth = bounds.maxColumn - bounds.minColumn + 1;
    const selectionHeight = bounds.maxRow - bounds.minRow + 1;
    const useMatchingRange = selectionWidth === payload.width && selectionHeight === payload.height;
    const destination = useMatchingRange
      ? { row: bounds.minRow, columnIndex: bounds.minColumn }
      : formulaApi.parseCellId(endId);
    const rowDelta = payload.sourceRow == null ? 0 : destination.row - payload.sourceRow;
    const colDelta = payload.sourceCol == null ? 0 : destination.columnIndex - payload.sourceCol;

    if (payload.isCut && payload.sourceRow != null && payload.sourceCol != null) {
      for (let row = 0; row < payload.height; row += 1) {
        for (let column = 0; column < payload.width; column += 1) {
          const sourceId = formulaApi.columnIndexToName(payload.sourceCol + column) + (payload.sourceRow + row);
          delete nextCells[sourceId];
        }
      }
    }

    for (let row = 0; row < payload.rows.length; row += 1) {
      for (let column = 0; column < payload.rows[row].length; column += 1) {
        const targetCol = destination.columnIndex + column;
        const targetRow = destination.row + row;
        if (targetCol < 0 || targetCol >= maxCols || targetRow < 1 || targetRow > maxRows) {
          continue;
        }
        const cellId = formulaApi.columnIndexToName(targetCol) + targetRow;
        const raw = payload.rows[row][column] || '';
        if (!raw) {
          delete nextCells[cellId];
          continue;
        }
        nextCells[cellId] = shiftFormula(raw, formulaApi, colDelta, rowDelta, maxCols, maxRows);
      }
    }

    return nextCells;
  }

  function shiftFormula(raw, formulaApi, colDelta, rowDelta, maxCols, maxRows) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (_, absCol, columnName, absRow, rowNumber) {
      let columnIndex = formulaApi.columnNameToIndex(columnName);
      let rowIndex = Number(rowNumber);
      if (!absCol) {
        columnIndex += colDelta;
      }
      if (!absRow) {
        rowIndex += rowDelta;
      }
      columnIndex = Math.max(0, Math.min(maxCols - 1, columnIndex));
      rowIndex = Math.max(1, Math.min(maxRows, rowIndex));
      return (absCol ? '$' : '') + formulaApi.columnIndexToName(columnIndex) + (absRow ? '$' : '') + rowIndex;
    });
  }

  function getBounds(anchorId, endId, formulaApi) {
    const anchor = formulaApi.parseCellId(anchorId);
    const end = formulaApi.parseCellId(endId);
    return {
      minColumn: Math.min(anchor.columnIndex, end.columnIndex),
      maxColumn: Math.max(anchor.columnIndex, end.columnIndex),
      minRow: Math.min(anchor.row, end.row),
      maxRow: Math.max(anchor.row, end.row),
    };
  }

  return {
    createClipboardPayload: createClipboardPayload,
    createTextClipboardPayload: createTextClipboardPayload,
    applyClipboardPayload: applyClipboardPayload,
  };
});
