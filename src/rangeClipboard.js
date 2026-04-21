(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.RangeClipboard = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function keyForCell(cell) {
    return `${cell.col},${cell.row}`;
  }

  function clampCell(cell, gridSize) {
    return {
      col: Math.max(0, Math.min(gridSize.cols - 1, cell.col)),
      row: Math.max(0, Math.min(gridSize.rows - 1, cell.row)),
    };
  }

  function cloneCell(cell) {
    return { col: cell.col, row: cell.row };
  }

  function createSelection(cell) {
    return {
      anchor: cloneCell(cell),
      focus: cloneCell(cell),
      active: cloneCell(cell),
    };
  }

  function selectToCell(selection, cell) {
    return {
      anchor: cloneCell(selection.anchor),
      focus: cloneCell(cell),
      active: cloneCell(cell),
    };
  }

  function selectionBounds(selection) {
    const left = Math.min(selection.anchor.col, selection.focus.col);
    const right = Math.max(selection.anchor.col, selection.focus.col);
    const top = Math.min(selection.anchor.row, selection.focus.row);
    const bottom = Math.max(selection.anchor.row, selection.focus.row);

    return {
      left,
      right,
      top,
      bottom,
      width: right - left + 1,
      height: bottom - top + 1,
    };
  }

  function describeSelectionCell(selection, cell) {
    const bounds = selectionBounds(selection);
    const selected = cell.col >= bounds.left && cell.col <= bounds.right && cell.row >= bounds.top && cell.row <= bounds.bottom;

    return {
      selected,
      active: selection.active.col === cell.col && selection.active.row === cell.row,
    };
  }

  function moveSelection(selection, delta, gridSize, options) {
    const next = clampCell(
      {
        col: selection.active.col + delta.dCol,
        row: selection.active.row + delta.dRow,
      },
      gridSize
    );

    if (options && options.extend) {
      return {
        anchor: cloneCell(selection.anchor),
        focus: next,
        active: next,
      };
    }

    return createSelection(next);
  }

  function forEachSelectedCell(selection, visitor) {
    const bounds = selectionBounds(selection);

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        visitor({ col, row });
      }
    }
  }

  function clearSelectedCells(cells, selection) {
    const nextCells = { ...cells };
    const cleared = [];

    forEachSelectedCell(selection, function (cell) {
      const key = keyForCell(cell);
      delete nextCells[key];
      cleared.push(key);
    });

    return { cells: nextCells, cleared };
  }

  function selectionToClipboard(cells, selection) {
    const bounds = selectionBounds(selection);
    const rows = [];

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      const current = [];
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        current.push(cells[keyForCell({ col, row })] || '');
      }
      rows.push(current);
    }

    return {
      text: rows.map(function (row) { return row.join('\t'); }).join('\n'),
      data: {
        width: bounds.width,
        height: bounds.height,
        source: { col: bounds.left, row: bounds.top },
        rows,
      },
    };
  }

  function resolvePasteTarget(selection, clipboard) {
    const bounds = selectionBounds(selection);

    if (bounds.width === clipboard.width && bounds.height === clipboard.height) {
      return { col: bounds.left, row: bounds.top };
    }

    return cloneCell(selection.active);
  }

  function pasteClipboard(cells, clipboard, destination, options) {
    const nextCells = { ...cells };
    const written = [];
    const cleared = [];
    const config = options || {};
    const adjustFormula = typeof config.adjustFormula === 'function' ? config.adjustFormula : null;
    const context = {
      source: cloneCell(clipboard.source),
      destination: cloneCell(destination),
      colOffset: destination.col - clipboard.source.col,
      rowOffset: destination.row - clipboard.source.row,
    };

    if (config.cut) {
      for (let rowIndex = 0; rowIndex < clipboard.height; rowIndex += 1) {
        for (let colIndex = 0; colIndex < clipboard.width; colIndex += 1) {
          const sourceKey = keyForCell({ col: clipboard.source.col + colIndex, row: clipboard.source.row + rowIndex });
          delete nextCells[sourceKey];
          cleared.push(sourceKey);
        }
      }
    }

    for (let rowIndex = 0; rowIndex < clipboard.height; rowIndex += 1) {
      for (let colIndex = 0; colIndex < clipboard.width; colIndex += 1) {
        const raw = clipboard.rows[rowIndex][colIndex] || '';
        const value = raw.startsWith('=') && adjustFormula ? adjustFormula(raw, context) : raw;
        const key = keyForCell({ col: destination.col + colIndex, row: destination.row + rowIndex });
        nextCells[key] = value;
        written.push(key);
      }
    }

    const result = { cells: nextCells, written };
    if (config.cut) {
      result.cleared = cleared;
    }

    return result;
  }

  return {
    clampCell,
    createSelection,
    describeSelectionCell,
    selectionBounds,
    resolvePasteTarget,
    selectToCell,
    moveSelection,
    clearSelectedCells,
    selectionToClipboard,
    pasteClipboard,
  };
});
