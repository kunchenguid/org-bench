const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GRID_COLUMNS,
  GRID_ROWS,
  clampPosition,
  movePosition,
  cellKey,
  columnLabel,
  createWorkbook,
  setCell,
  getCellDisplay,
  evaluateFormula,
  storageKey,
} = require('../core.js');

test('grid constants match brief minimums', () => {
  assert.equal(GRID_COLUMNS, 26);
  assert.equal(GRID_ROWS, 100);
});

test('clampPosition keeps selection inside the grid', () => {
  assert.deepEqual(clampPosition({ col: -4, row: 999 }), { col: 0, row: 99 });
  assert.deepEqual(clampPosition({ col: 12, row: 7 }), { col: 12, row: 7 });
});

test('movePosition applies deltas then clamps to edges', () => {
  assert.deepEqual(movePosition({ col: 0, row: 0 }, -1, -1), { col: 0, row: 0 });
  assert.deepEqual(movePosition({ col: 25, row: 99 }, 1, 1), { col: 25, row: 99 });
  assert.deepEqual(movePosition({ col: 3, row: 4 }, 2, 3), { col: 5, row: 7 });
});

test('cellKey uses spreadsheet-style addresses', () => {
  assert.equal(cellKey({ col: 0, row: 0 }), 'A1');
  assert.equal(cellKey({ col: 25, row: 99 }), 'Z100');
});

test('columnLabel supports the visible brief range', () => {
  assert.equal(columnLabel(0), 'A');
  assert.equal(columnLabel(25), 'Z');
});

test('storageKey prefixes persisted data with the run namespace', () => {
  assert.equal(storageKey('google-run:', 'sheet-state'), 'google-run:sheet-state');
  assert.equal(storageKey('', 'sheet-state'), 'sheet-state');
});

test('evaluateFormula handles arithmetic precedence and parentheses', () => {
  const workbook = createWorkbook();

  assert.equal(evaluateFormula(workbook, '=1+2*3'), 7);
  assert.equal(evaluateFormula(workbook, '=(1+2)*3'), 9);
  assert.equal(evaluateFormula(workbook, '=-5+2'), -3);
});

test('evaluateFormula resolves booleans and comparison operators', () => {
  const workbook = createWorkbook();

  assert.equal(evaluateFormula(workbook, '=TRUE'), true);
  assert.equal(evaluateFormula(workbook, '=FALSE'), false);
  assert.equal(evaluateFormula(workbook, '=3>2'), true);
  assert.equal(evaluateFormula(workbook, '=3<=2'), false);
  assert.equal(evaluateFormula(workbook, '=3<>2'), true);
});

test('evaluateFormula resolves direct cell references and empty cells as zero', () => {
  const workbook = createWorkbook();

  setCell(workbook, { col: 0, row: 0 }, '7');
  setCell(workbook, { col: 0, row: 1 }, '5');

  assert.equal(evaluateFormula(workbook, '=A1+A2'), 12);
  assert.equal(evaluateFormula(workbook, '=B1+2'), 2);
});

test('setCell keeps formulas raw and stores evaluated display values', () => {
  const workbook = createWorkbook();

  setCell(workbook, { col: 0, row: 0 }, '10');
  setCell(workbook, { col: 0, row: 1 }, '2');
  setCell(workbook, { col: 1, row: 0 }, '=A1+A2');

  assert.equal(workbook.cells.B1.raw, '=A1+A2');
  assert.equal(getCellDisplay(workbook, { col: 1, row: 0 }), '12');
});
