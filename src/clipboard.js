(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetClipboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function selectionFromEndpoints(anchor, focus) {
    return {
      anchor: { row: anchor.row, column: anchor.column },
      focus: { row: focus.row, column: focus.column },
      minRow: Math.min(anchor.row, focus.row),
      maxRow: Math.max(anchor.row, focus.row),
      minColumn: Math.min(anchor.column, focus.column),
      maxColumn: Math.max(anchor.column, focus.column),
      active: { row: focus.row, column: focus.column },
    };
  }

  function selectionToRuntimeSelection(selection) {
    return {
      row: selection.active.row + 1,
      col: selection.active.column + 1,
    };
  }

  function addressFromCell(cell) {
    return String.fromCharCode(65 + cell.column) + String(cell.row + 1);
  }

  function cellFromAddress(address) {
    var match = String(address || '').match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return null;
    }

    return {
      row: Number(match[2]) - 1,
      column: match[1].charCodeAt(0) - 65,
    };
  }

  function cloneCells(cells) {
    return Object.assign({}, cells || {});
  }

  function selectionSize(selection) {
    return {
      rows: selection.maxRow - selection.minRow + 1,
      columns: selection.maxColumn - selection.minColumn + 1,
    };
  }

  function getSelectionOrigin(selection) {
    var size = selectionSize(selection);
    if (size.rows === 1 && size.columns === 1) {
      return {
        row: selection.active.row,
        column: selection.active.column,
      };
    }

    return {
      row: selection.minRow,
      column: selection.minColumn,
    };
  }

  function forEachCellInSelection(selection, callback) {
    for (var row = selection.minRow; row <= selection.maxRow; row += 1) {
      for (var column = selection.minColumn; column <= selection.maxColumn; column += 1) {
        callback({ row: row, column: column }, row - selection.minRow, column - selection.minColumn);
      }
    }
  }

  function clearSelectedCells(cells, selection) {
    var nextCells = cloneCells(cells);
    forEachCellInSelection(selection, function (cell) {
      delete nextCells[addressFromCell(cell)];
    });
    return nextCells;
  }

  function matrixFromSelection(cells, selection) {
    var rows = [];
    for (var row = selection.minRow; row <= selection.maxRow; row += 1) {
      var columns = [];
      for (var column = selection.minColumn; column <= selection.maxColumn; column += 1) {
        columns.push((cells && cells[addressFromCell({ row: row, column: column })]) || '');
      }
      rows.push(columns);
    }
    return rows;
  }

  function matrixToClipboardText(matrix) {
    return matrix.map(function (row) {
      return row.join('\t');
    }).join('\n');
  }

  function parseClipboardText(text) {
    return String(text || '').replace(/\r/g, '').split('\n').map(function (line) {
      return line.split('\t');
    });
  }

  function parseReferenceToken(token) {
    var match = String(token).match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      return null;
    }

    return {
      columnAbsolute: match[1] === '$',
      column: match[2].charCodeAt(0) - 64,
      rowAbsolute: match[3] === '$',
      row: Number(match[4]),
    };
  }

  function formatReferenceToken(reference) {
    return [
      reference.columnAbsolute ? '$' : '',
      String.fromCharCode(64 + reference.column),
      reference.rowAbsolute ? '$' : '',
      String(reference.row),
    ].join('');
  }

  function translateFormulaFallback(rawValue, sourceAddress, targetAddress) {
    if (typeof rawValue !== 'string' || rawValue.charAt(0) !== '=') {
      return rawValue;
    }

    var source = cellFromAddress(sourceAddress);
    var target = cellFromAddress(targetAddress);
    if (!source || !target) {
      return rawValue;
    }

    var rowOffset = target.row - source.row;
    var columnOffset = target.column - source.column;

    return '=' + rawValue.slice(1).replace(/\$?[A-Z]+\$?\d+/g, function (token) {
      var reference = parseReferenceToken(token);
      if (!reference) {
        return token;
      }

      var next = {
        columnAbsolute: reference.columnAbsolute,
        rowAbsolute: reference.rowAbsolute,
        column: reference.columnAbsolute ? reference.column : Math.max(1, reference.column + columnOffset),
        row: reference.rowAbsolute ? reference.row : Math.max(1, reference.row + rowOffset),
      };

      return formatReferenceToken(next);
    });
  }

  function getFormulaTranslator(scope) {
    var targetScope = scope || {};
    if (targetScope.SpreadsheetFormulaEngine && typeof targetScope.SpreadsheetFormulaEngine.translateFormula === 'function') {
      return targetScope.SpreadsheetFormulaEngine.translateFormula;
    }
    return translateFormulaFallback;
  }

  function copySelection(cells, selection, mode) {
    var matrix = matrixFromSelection(cells, selection);
    return {
      text: matrixToClipboardText(matrix),
      payload: {
        mode: mode || 'copy',
        selection: {
          minRow: selection.minRow,
          maxRow: selection.maxRow,
          minColumn: selection.minColumn,
          maxColumn: selection.maxColumn,
        },
        matrix: matrix,
      },
    };
  }

  function normalizeClipboard(clipboard) {
    if (!clipboard) {
      return null;
    }

    if (clipboard.payload && clipboard.payload.matrix) {
      return clipboard.payload;
    }

    if (clipboard.matrix) {
      return clipboard;
    }

    return null;
  }

  function pasteSelection(options) {
    var clipboard = normalizeClipboard(options.clipboard);
    if (!clipboard || !clipboard.matrix || !clipboard.matrix.length) {
      return {
        cells: cloneCells(options.cells),
        selection: options.targetSelection,
        cutCleared: false,
      };
    }

    var nextCells = cloneCells(options.cells);
    var targetOrigin = getSelectionOrigin(options.targetSelection);
    var blockHeight = clipboard.matrix.length;
    var blockWidth = clipboard.matrix[0].length;
    var translateFormula = typeof options.translateFormula === 'function' ? options.translateFormula : getFormulaTranslator(options.scope);

    if (clipboard.mode === 'cut' && clipboard.selection) {
      for (var sourceRow = clipboard.selection.minRow; sourceRow <= clipboard.selection.maxRow; sourceRow += 1) {
        for (var sourceColumn = clipboard.selection.minColumn; sourceColumn <= clipboard.selection.maxColumn; sourceColumn += 1) {
          delete nextCells[addressFromCell({ row: sourceRow, column: sourceColumn })];
        }
      }
    }

    clipboard.matrix.forEach(function (rowValues, rowOffset) {
      rowValues.forEach(function (rawValue, columnOffset) {
        var targetCell = {
          row: targetOrigin.row + rowOffset,
          column: targetOrigin.column + columnOffset,
        };
        var targetAddress = addressFromCell(targetCell);
        var sourceAddress = clipboard.selection
          ? addressFromCell({
              row: clipboard.selection.minRow + rowOffset,
              column: clipboard.selection.minColumn + columnOffset,
            })
          : targetAddress;
        var nextValue = rawValue;

        if (typeof rawValue === 'string' && rawValue.charAt(0) === '=') {
          nextValue = translateFormula(rawValue, sourceAddress, targetAddress);
        }

        if (nextValue) {
          nextCells[targetAddress] = nextValue;
        } else {
          delete nextCells[targetAddress];
        }
      });
    });

    var nextSelection = selectionFromEndpoints(targetOrigin, {
      row: targetOrigin.row + blockHeight - 1,
      column: targetOrigin.column + blockWidth - 1,
    });
    nextSelection.active = {
      row: targetOrigin.row,
      column: targetOrigin.column,
    };

    return {
      cells: nextCells,
      selection: nextSelection,
      cutCleared: clipboard.mode === 'cut',
    };
  }

  function readClipboardPayload(clipboardData) {
    if (!clipboardData) {
      return null;
    }

    var rawPayload = clipboardData.getData('application/x-sheet-selection');
    if (rawPayload) {
      try {
        return JSON.parse(rawPayload);
      } catch (error) {
        return null;
      }
    }

    var text = clipboardData.getData('text/plain');
    if (!text) {
      return null;
    }

    return {
      mode: 'copy',
      matrix: parseClipboardText(text),
    };
  }

  function commitRangeClear(runtime, selection, source) {
    var current = runtime.getState();
    return runtime.commit(
      {
        cells: clearSelectedCells(current.cells, selection),
        selection: selectionToRuntimeSelection(selection),
      },
      source || 'clipboard:clear'
    );
  }

  function commitClipboardPaste(options) {
    var result = pasteSelection({
      cells: options.runtime.getState().cells,
      targetSelection: options.selection,
      clipboard: options.clipboard,
      translateFormula: options.translateFormula,
      scope: options.scope,
    });

    return {
      state: options.runtime.commit(
        {
          cells: result.cells,
          selection: selectionToRuntimeSelection(result.selection),
        },
        options.source || 'clipboard:paste'
      ),
      selection: result.selection,
      cutCleared: result.cutCleared,
    };
  }

  return {
    selectionFromEndpoints: selectionFromEndpoints,
    selectionToRuntimeSelection: selectionToRuntimeSelection,
    addressFromCell: addressFromCell,
    clearSelectedCells: clearSelectedCells,
    copySelection: copySelection,
    pasteSelection: pasteSelection,
    readClipboardPayload: readClipboardPayload,
    getFormulaTranslator: getFormulaTranslator,
    commitRangeClear: commitRangeClear,
    commitClipboardPaste: commitClipboardPaste,
    translateFormulaFallback: translateFormulaFallback,
  };
});
