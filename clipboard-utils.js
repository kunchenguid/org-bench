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

  function resolvePasteOrigin(options, rows) {
    const selection = options.selection;
    const height = rows.length;
    const width = rows[0] ? rows[0].length : 1;

    if (!selection) {
      return { row: options.targetRow, col: options.targetCol };
    }

    const selectionHeight = selection.maxRow - selection.minRow + 1;
    const selectionWidth = selection.maxCol - selection.minCol + 1;
    if (selectionHeight === height && selectionWidth === width) {
      return { row: selection.minRow, col: selection.minCol };
    }

    return { row: options.targetRow, col: options.targetCol };
  }

  function translatePaste(options) {
    const rows = parseClipboardText(options.text);
    const writes = [];
    const sourcePayload = options.sourcePayload && options.sourcePayload.text === options.text ? options.sourcePayload : null;
    const isCutPaste = options.pendingCut && options.pendingCut.text === options.text;
    const pasteOrigin = resolvePasteOrigin(options, rows);

    for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
      for (let colOffset = 0; colOffset < rows[rowOffset].length; colOffset += 1) {
        const row = pasteOrigin.row + rowOffset;
        const col = pasteOrigin.col + colOffset;
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
      const destinationRow = pasteOrigin.row + (cell.row - options.pendingCut.originRow);
      const destinationCol = pasteOrigin.col + (cell.col - options.pendingCut.originCol);
      return destinationRow !== cell.row || destinationCol !== cell.col;
    }).map(function (cell) {
      return { row: cell.row, col: cell.col };
    }) : [];

    return {
      writes: writes,
      clears: clears,
      selection: {
        minRow: pasteOrigin.row,
        maxRow: pasteOrigin.row + rows.length - 1,
        minCol: pasteOrigin.col,
        maxCol: pasteOrigin.col + (rows[0] ? rows[0].length : 1) - 1,
      },
    };
  }

  return {
    buildClipboardPayload: buildClipboardPayload,
    parseClipboardText: parseClipboardText,
    translatePaste: translatePaste,
  };
});
