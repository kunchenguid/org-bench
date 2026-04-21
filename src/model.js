const engine = require('./engine.js');

const CELL_REF_IN_FORMULA_RE = /(\$?)([A-Z]+)(\$?)(\d+)/g;

function createSheet() {
  return {
    cells: {},
  };
}

function setCell(sheet, cellId, raw) {
  if (raw) {
    sheet.cells[cellId] = raw;
    return;
  }

  delete sheet.cells[cellId];
}

function getCellRaw(sheet, cellId) {
  return sheet.cells[cellId] || '';
}

function getCellDisplay(sheet, cellId) {
  const evaluated = engine.evaluateCellMap(sheet.cells);
  return evaluated[cellId] ? evaluated[cellId].display : '';
}

function copyRange(sheet, range, preserveFormulas) {
  const startRow = Math.min(range.startRow, range.endRow);
  const endRow = Math.max(range.startRow, range.endRow);
  const startCol = Math.min(range.startCol, range.endCol);
  const endCol = Math.max(range.startCol, range.endCol);
  const cells = {};

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const raw = getCellRaw(sheet, engine.toCellId(row, col));
      if (raw) {
        cells[(row - startRow) + ',' + (col - startCol)] = preserveFormulas ? raw : getCellDisplay(sheet, engine.toCellId(row, col));
      }
    }
  }

  return {
    sourceRow: startRow,
    sourceCol: startCol,
    height: endRow - startRow + 1,
    width: endCol - startCol + 1,
    cells: cells,
  };
}

function pasteRange(sheet, targetRange, clip) {
  const startRow = Math.min(targetRange.startRow, targetRange.endRow);
  const startCol = Math.min(targetRange.startCol, targetRange.endCol);
  const rowDelta = startRow - (clip.sourceRow || 0);
  const colDelta = startCol - (clip.sourceCol || 0);

  for (const key of Object.keys(clip.cells)) {
    const parts = key.split(',');
    const rowOffset = Number(parts[0]);
    const colOffset = Number(parts[1]);
    const raw = clip.cells[key];
    const destinationRow = startRow + rowOffset;
    const destinationCol = startCol + colOffset;
    const shifted = raw && raw[0] === '=' ? shiftFormula(raw, rowDelta, colDelta) : raw;
    setCell(sheet, engine.toCellId(destinationRow, destinationCol), shifted);
  }
}

function insertRow(sheet, rowIndex) {
  const nextCells = {};
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = engine.parseCellId(cellId);
    const nextRow = ref.row >= rowIndex ? ref.row + 1 : ref.row;
    nextCells[engine.toCellId(nextRow, ref.col)] = sheet.cells[cellId];
  }

  for (const cellId of Object.keys(nextCells)) {
    nextCells[cellId] = shiftFormulaForInsertedRow(nextCells[cellId], rowIndex);
  }

  sheet.cells = nextCells;
}

function shiftFormula(raw, rowDelta, colDelta) {
  return raw.replace(CELL_REF_IN_FORMULA_RE, function (_, absoluteCol, colLabel, absoluteRow, rowNumber) {
    const ref = engine.parseCellId(colLabel + rowNumber);
    const nextCol = absoluteCol ? ref.col : ref.col + colDelta;
    const nextRow = absoluteRow ? ref.row : ref.row + rowDelta;
    return (absoluteCol ? '$' : '') + engine.indexToColumnLabel(nextCol) + (absoluteRow ? '$' : '') + String(nextRow + 1);
  });
}

function shiftFormulaForInsertedRow(raw, rowIndex) {
  if (!raw || raw[0] !== '=') {
    return raw;
  }

  return raw.replace(CELL_REF_IN_FORMULA_RE, function (_, absoluteCol, colLabel, absoluteRow, rowNumber) {
    if (absoluteRow) {
      return _;
    }

    const ref = engine.parseCellId(colLabel + rowNumber);
    const nextRow = ref.row >= rowIndex ? ref.row + 1 : ref.row;
    return (absoluteCol ? '$' : '') + colLabel + String(nextRow + 1);
  });
}

module.exports = {
  createSheet,
  setCell,
  getCellDisplay,
  getCellRaw,
  copyRange,
  pasteRange,
  insertRow,
};
