(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SelectionClipboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createSelection(active) {
    return {
      active: { row: active.row, col: active.col },
      focus: { row: active.row, col: active.col },
    };
  }

  function extendSelection(selection, focus) {
    return {
      active: { row: selection.active.row, col: selection.active.col },
      focus: { row: focus.row, col: focus.col },
    };
  }

  function selectionBounds(selection) {
    const top = Math.min(selection.active.row, selection.focus.row);
    const left = Math.min(selection.active.col, selection.focus.col);
    const bottom = Math.max(selection.active.row, selection.focus.row);
    const right = Math.max(selection.active.col, selection.focus.col);
    return { top, left, bottom, right, rows: bottom - top + 1, cols: right - left + 1 };
  }

  function clearSelection(selection, setCell) {
    forEachCell(selection, function (row, col) {
      setCell(row, col, '');
    });
  }

  function copySelection(selection, getCell) {
    const bounds = selectionBounds(selection);
    const lines = [];
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      const values = [];
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        values.push(getCell(row, col));
      }
      lines.push(values.join('\t'));
    }
    return { text: lines.join('\n'), source: { row: bounds.top, col: bounds.left }, cut: false };
  }

  function cutSelection(selection, getCell, setCell) {
    const clipboard = copySelection(selection, getCell);
    clearSelection(selection, setCell);
    clipboard.cut = true;
    return clipboard;
  }

  function pasteClipboard(clipboard, selection, setCell, options) {
    const values = parseClipboardText(clipboard.text);
    const bounds = selectionBounds(selection);
    const targetRows = bounds.rows === values.length ? bounds.rows : values.length;
    const targetCols = bounds.cols === maxWidth(values) ? bounds.cols : maxWidth(values);
    const adjustFormula = options && options.adjustFormulaReferences;

    for (let rowOffset = 0; rowOffset < targetRows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < targetCols; colOffset += 1) {
        const raw = (values[rowOffset] && values[rowOffset][colOffset]) || '';
        const targetRow = bounds.top + rowOffset;
        const targetCol = bounds.left + colOffset;
        const sourceCell = clipboard.source
          ? { row: clipboard.source.row + rowOffset, col: clipboard.source.col + colOffset }
          : null;
        setCell(
          targetRow,
          targetCol,
          shiftFormula(raw, sourceCell, { row: targetRow, col: targetCol }, adjustFormula)
        );
      }
    }
  }

  function forEachCell(selection, visit) {
    const bounds = selectionBounds(selection);
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) visit(row, col);
    }
  }

  function parseClipboardText(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(function (line) {
        return line.split('\t');
      });
  }

  function maxWidth(values) {
    return values.reduce(function (width, row) {
      return Math.max(width, row.length);
    }, 0);
  }

  function shiftFormula(raw, source, target, adjustFormula) {
    if (!source || typeof raw !== 'string' || raw.charAt(0) !== '=') return raw;
    const rowDelta = target.row - source.row;
    const colDelta = target.col - source.col;
    if (adjustFormula) return adjustFormula(raw, rowDelta, colDelta);
    return shiftFormulaReferences(raw, rowDelta, colDelta);
  }

  function shiftFormulaReferences(formula, rowDelta, colDelta) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, absCol, colLetters, absRow, rowText) {
      const col = absCol ? colLetters : indexToColumn(Math.max(1, columnToIndex(colLetters) + colDelta));
      const row = absRow ? rowText : String(Math.max(1, Number(rowText) + rowDelta));
      return absCol + col + absRow + row;
    });
  }

  function columnToIndex(letters) {
    let index = 0;
    for (let i = 0; i < letters.length; i += 1) {
      index = index * 26 + letters.charCodeAt(i) - 64;
    }
    return index;
  }

  function indexToColumn(index) {
    let letters = '';
    while (index > 0) {
      const remainder = (index - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      index = Math.floor((index - 1) / 26);
    }
    return letters;
  }

  return {
    createSelection,
    extendSelection,
    selectionBounds,
    clearSelection,
    copySelection,
    cutSelection,
    pasteClipboard,
    shiftFormulaReferences,
  };
});
