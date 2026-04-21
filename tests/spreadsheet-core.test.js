const test = require('node:test');
const assert = require('node:assert/strict');

const {
  columnIndexToLabel,
  cellIdToPoint,
  pointToCellId,
  createSheet,
  setCellRaw,
  evaluateCell,
} = require('../spreadsheet-core.js');

test('converts between cell ids and points', () => {
  assert.equal(columnIndexToLabel(0), 'A');
  assert.equal(columnIndexToLabel(25), 'Z');
  assert.deepEqual(cellIdToPoint('C12'), { col: 2, row: 11 });
  assert.equal(pointToCellId(25, 99), 'Z100');
});

test('evaluates numbers, text, arithmetic formulas, and cell references', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 'A1', '7');
  setCellRaw(sheet, 'A2', '5');
  setCellRaw(sheet, 'B1', '=A1+A2*2');
  setCellRaw(sheet, 'B2', '=A1/A2');
  setCellRaw(sheet, 'C1', 'hello');

  assert.equal(evaluateCell(sheet, 'A1').display, '7');
  assert.equal(evaluateCell(sheet, 'B1').display, '17');
  assert.equal(evaluateCell(sheet, 'B2').display, '1.4');
  assert.equal(evaluateCell(sheet, 'C1').display, 'hello');
});

test('supports SUM and AVERAGE over a range', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 'A1', '1');
  setCellRaw(sheet, 'A2', '2');
  setCellRaw(sheet, 'A3', '3');
  setCellRaw(sheet, 'B1', '=SUM(A1:A3)');
  setCellRaw(sheet, 'B2', '=AVERAGE(A1:A3)');

  assert.equal(evaluateCell(sheet, 'B1').display, '6');
  assert.equal(evaluateCell(sheet, 'B2').display, '2');
});

test('supports comparison, boolean, and text-oriented formulas', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 'A1', '9');
  setCellRaw(sheet, 'A2', '3');
  setCellRaw(sheet, 'B1', '=A1>A2');
  setCellRaw(sheet, 'B2', '=IF(A1>A2,"high","low")');
  setCellRaw(sheet, 'B3', '=AND(TRUE, A2<5)');
  setCellRaw(sheet, 'B4', '=NOT(FALSE)');
  setCellRaw(sheet, 'B5', '=CONCAT("Total: ", A1)');
  setCellRaw(sheet, 'B6', '=ROUND(A1/A2, 2)');
  setCellRaw(sheet, 'B7', '=MIN(A1:A2)');
  setCellRaw(sheet, 'B8', '=MAX(A1:A2)');
  setCellRaw(sheet, 'B9', '=COUNT(A1:A2)');

  assert.equal(evaluateCell(sheet, 'B1').display, 'TRUE');
  assert.equal(evaluateCell(sheet, 'B2').display, 'high');
  assert.equal(evaluateCell(sheet, 'B3').display, 'TRUE');
  assert.equal(evaluateCell(sheet, 'B4').display, 'TRUE');
  assert.equal(evaluateCell(sheet, 'B5').display, 'Total: 9');
  assert.equal(evaluateCell(sheet, 'B6').display, '3');
  assert.equal(evaluateCell(sheet, 'B7').display, '3');
  assert.equal(evaluateCell(sheet, 'B8').display, '9');
  assert.equal(evaluateCell(sheet, 'B9').display, '2');
});

test('surfaces divide-by-zero as a spreadsheet-style error', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 'A1', '10');
  setCellRaw(sheet, 'A2', '0');
  setCellRaw(sheet, 'B1', '=A1/A2');

  assert.equal(evaluateCell(sheet, 'B1').display, '#DIV/0!');
});

test('marks circular references clearly', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 'A1', '=B1');
  setCellRaw(sheet, 'B1', '=A1');

  assert.equal(evaluateCell(sheet, 'A1').display, '#CIRC!');
});
