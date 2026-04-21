(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./formula.js'));
    return;
  }
  root.SpreadsheetClipboard = factory(root.SpreadsheetFormula);
})(typeof globalThis !== 'undefined' ? globalThis : window, function (formulaModule) {
  const encodeColumn = formulaModule.encodeColumn;

  function selectionToMatrix(cells, selection) {
    const rows = [];
    for (let row = selection.startRow; row <= selection.endRow; row += 1) {
      const currentRow = [];
      for (let col = selection.startCol; col <= selection.endCol; col += 1) {
        currentRow.push(cells[addressFor(col, row)] || '');
      }
      rows.push(currentRow);
    }
    return rows;
  }

  function matrixToTsv(matrix) {
    return matrix.map(function (row) {
      return row.join('\t');
    }).join('\n');
  }

  function tsvToMatrix(text) {
    return text.replace(/\r/g, '').split('\n').map(function (row) {
      return row.split('\t');
    });
  }

  function buildPasteChanges(options) {
    const destination = normalizeDestination(options.destination, options.source);
    const changes = {};
    const engine = formulaModule.createEngine({
      getCellRaw() {
        return '';
      },
    });

    for (let rowOffset = 0; rowOffset < destination.height; rowOffset += 1) {
      for (let colOffset = 0; colOffset < destination.width; colOffset += 1) {
        const sourceValue = options.source[rowOffset % options.source.length][colOffset % options.source[0].length];
        const targetCol = destination.startCol + colOffset;
        const targetRow = destination.startRow + rowOffset;
        const sourceCol = destination.sourceStartCol + (colOffset % options.source[0].length);
        const sourceRow = destination.sourceStartRow + (rowOffset % options.source.length);
        changes[addressFor(targetCol, targetRow)] = shiftValue(engine, sourceValue, {
          rows: targetRow - sourceRow,
          cols: targetCol - sourceCol,
        });
      }
    }

    return changes;
  }

  function clearSelection(cells, selection) {
    const next = Object.assign({}, cells);
    for (let row = selection.startRow; row <= selection.endRow; row += 1) {
      for (let col = selection.startCol; col <= selection.endCol; col += 1) {
        delete next[addressFor(col, row)];
      }
    }
    return next;
  }

  function addressFor(col, row) {
    return encodeColumn(col) + String(row + 1);
  }

  function normalizeDestination(destination, source) {
    const sourceHeight = source.length;
    const sourceWidth = source[0].length;
    const destinationHeight = destination.endRow - destination.startRow + 1;
    const destinationWidth = destination.endCol - destination.startCol + 1;
    const useSourceShape = destinationHeight === 1 && destinationWidth === 1;

    return {
      startRow: destination.startRow,
      startCol: destination.startCol,
      height: useSourceShape ? sourceHeight : destinationHeight,
      width: useSourceShape ? sourceWidth : destinationWidth,
      sourceStartRow: 0,
      sourceStartCol: 0,
    };
  }

  function shiftValue(engine, value, offset) {
    if (!value || value[0] !== '=') return value;
    return engine.shiftFormula(value, offset);
  }

  return {
    selectionToMatrix: selectionToMatrix,
    matrixToTsv: matrixToTsv,
    tsvToMatrix: tsvToMatrix,
    buildPasteChanges: buildPasteChanges,
    clearSelection: clearSelection,
  };
});
