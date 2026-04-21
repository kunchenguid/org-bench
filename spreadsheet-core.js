function cellKey(row, col) {
  return row + ',' + col;
}

function columnLabel(index) {
  let value = index;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function columnNumber(label) {
  let value = 0;
  for (let index = 0; index < label.length; index += 1) {
    value = (value * 26) + (label.charCodeAt(index) - 64);
  }
  return value;
}

function normalizeRange(anchor, focus, active) {
  return {
    start: {
      row: Math.min(anchor.row, focus.row),
      col: Math.min(anchor.col, focus.col),
    },
    end: {
      row: Math.max(anchor.row, focus.row),
      col: Math.max(anchor.col, focus.col),
    },
    active: {
      row: (active || anchor).row,
      col: (active || anchor).col,
    },
  };
}

function rangeAnchor(range) {
  const { active, start, end } = range;
  return {
    row: active.row === start.row ? end.row : start.row,
    col: active.col === start.col ? end.col : start.col,
  };
}

function extendRange(range, nextActive) {
  return normalizeRange(rangeAnchor(range), nextActive, nextActive);
}

function forEachCell(range, visitor) {
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let col = range.start.col; col <= range.end.col; col += 1) {
      visitor(row, col);
    }
  }
}

function clearRange(cells, range) {
  const nextCells = { ...cells };
  forEachCell(range, (row, col) => {
    delete nextCells[cellKey(row, col)];
  });
  return nextCells;
}

function copyRange(cells, range) {
  const rows = [];
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    const values = [];
    for (let col = range.start.col; col <= range.end.col; col += 1) {
      values.push(cells[cellKey(row, col)] || '');
    }
    rows.push(values.join('\t'));
  }
  return rows.join('\n');
}

function parseClipboard(text) {
  return String(text)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.split('\t'));
}

function shiftReference(reference, rowDelta, colDelta) {
  return reference.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, colFixed, colLabel, rowFixed, rowNumber) => {
    const nextCol = colFixed ? columnNumber(colLabel) : columnNumber(colLabel) + colDelta;
    const nextRow = rowFixed ? Number(rowNumber) : Number(rowNumber) + rowDelta;
    return (
      (colFixed || '') +
      columnLabel(Math.max(1, nextCol)) +
      (rowFixed || '') +
      String(Math.max(1, nextRow))
    );
  });
}

function pasteBlock(cells, destinationRange, text, options) {
  const settings = options || {};
  const nextCells = settings.cutRange ? clearRange(cells, settings.cutRange) : { ...cells };
  const block = parseClipboard(text);
  const target = destinationRange.start;

  for (let rowOffset = 0; rowOffset < block.length; rowOffset += 1) {
    for (let colOffset = 0; colOffset < block[rowOffset].length; colOffset += 1) {
      const sourceRow = settings.sourceRange ? settings.sourceRange.start.row + rowOffset : target.row + rowOffset;
      const sourceCol = settings.sourceRange ? settings.sourceRange.start.col + colOffset : target.col + colOffset;
      const value = block[rowOffset][colOffset].charAt(0) === '='
        ? shiftReference(
            block[rowOffset][colOffset],
            (target.row + rowOffset) - sourceRow,
            (target.col + colOffset) - sourceCol
          )
        : block[rowOffset][colOffset];
      const key = cellKey(target.row + rowOffset, target.col + colOffset);
      if (value) {
        nextCells[key] = value;
      } else {
        delete nextCells[key];
      }
    }
  }

  return {
    cells: nextCells,
    range: normalizeRange(
      target,
      {
        row: target.row + block.length - 1,
        col: target.col + block[0].length - 1,
      },
      target
    ),
  };
}

const api = {
  cellKey,
  normalizeRange,
  extendRange,
  clearRange,
  copyRange,
  parseClipboard,
  shiftReference,
  pasteBlock,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetCore = api;
}
