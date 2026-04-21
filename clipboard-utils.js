(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./formula-engine.js'));
    return;
  }

  root.SpreadsheetClipboardUtils = factory(root.SpreadsheetFormulaEngine);
})(typeof globalThis !== 'undefined' ? globalThis : window, function (engine) {
  function buildClipboardPayload(bounds, getRaw) {
    const rows = [];
    const rawCells = [];

    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      const values = [];
      for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
        const raw = getRaw(row, col);
        values.push(raw);
        rawCells.push({ row: row, col: col, raw: raw });
      }
      rows.push(values.join('\t'));
    }

    return {
      originRow: bounds.minRow,
      originCol: bounds.minCol,
      width: bounds.maxCol - bounds.minCol + 1,
      height: bounds.maxRow - bounds.minRow + 1,
      rawCells: rawCells,
      text: rows.join('\n'),
    };
  }

  function parseClipboardText(text) {
    return text.replace(/\r/g, '').split('\n').map(function (line) {
      return line.split('\t');
    });
  }

  function translatePaste(options) {
    const rows = parseClipboardText(options.text);
    const writes = [];
    const sourcePayload = options.sourcePayload && options.sourcePayload.text === options.text ? options.sourcePayload : null;
    const isCutPaste = options.pendingCut && options.pendingCut.text === options.text;

    for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
      for (let colOffset = 0; colOffset < rows[rowOffset].length; colOffset += 1) {
        const row = options.targetRow + rowOffset;
        const col = options.targetCol + colOffset;
        const raw = rows[rowOffset][colOffset];
        const sourceRow = sourcePayload ? sourcePayload.originRow + rowOffset : row;
        const sourceCol = sourcePayload ? sourcePayload.originCol + colOffset : col;

        writes.push({
          row: row,
          col: col,
          raw: isCutPaste ? raw : engine.shiftFormula(raw, row - sourceRow, col - sourceCol),
        });
      }
    }

    const clears = isCutPaste ? options.pendingCut.rawCells.filter(function (cell) {
      const destinationRow = options.targetRow + (cell.row - options.pendingCut.originRow);
      const destinationCol = options.targetCol + (cell.col - options.pendingCut.originCol);
      return destinationRow !== cell.row || destinationCol !== cell.col;
    }).map(function (cell) {
      return { row: cell.row, col: cell.col };
    }) : [];

    return {
      writes: writes,
      clears: clears,
      selection: {
        minRow: options.targetRow,
        maxRow: options.targetRow + rows.length - 1,
        minCol: options.targetCol,
        maxCol: options.targetCol + (rows[0] ? rows[0].length : 1) - 1,
      },
    };
  }

  return {
    buildClipboardPayload: buildClipboardPayload,
    parseClipboardText: parseClipboardText,
    translatePaste: translatePaste,
  };
});
