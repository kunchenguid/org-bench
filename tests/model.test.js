const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSheet,
  setCell,
  getCellDisplay,
  getCellRaw,
  clearRange,
  copyRange,
  pasteRange,
  insertRow,
  insertCol,
  deleteRow,
  deleteCol,
} = require('../src/model.js');

test('supports ranges and built-in aggregate functions', () => {
  const sheet = createSheet();

  setCell(sheet, 'A1', '2');
  setCell(sheet, 'A2', '3');
  setCell(sheet, 'A3', '5');
  setCell(sheet, 'B1', '=SUM(A1:A3)');
  setCell(sheet, 'B2', '=AVERAGE(A1:A3)');
  setCell(sheet, 'B3', '=COUNT(A1:A3)');

  assert.equal(getCellDisplay(sheet, 'B1'), '10');
  assert.equal(getCellDisplay(sheet, 'B2'), '3.3333333333333335');
  assert.equal(getCellDisplay(sheet, 'B3'), '3');
});

test('copy paste shifts relative references and preserves raw formulas', () => {
  const sheet = createSheet();

  setCell(sheet, 'A1', '2');
  setCell(sheet, 'A2', '3');
  setCell(sheet, 'B1', '=A1+A2');

  const clip = copyRange(sheet, { startRow: 0, startCol: 1, endRow: 0, endCol: 1 }, true);
  pasteRange(sheet, { startRow: 1, startCol: 1, endRow: 1, endCol: 1 }, clip);

  assert.equal(getCellRaw(sheet, 'B2'), '=A2+A3');
});

test('inserting a row updates dependent formulas to keep pointing at the same data', () => {
  const sheet = createSheet();

  setCell(sheet, 'A1', '4');
  setCell(sheet, 'A2', '6');
  setCell(sheet, 'B1', '=SUM(A1:A2)');

  insertRow(sheet, 0);

  assert.equal(getCellRaw(sheet, 'B2'), '=SUM(A2:A3)');
  assert.equal(getCellDisplay(sheet, 'B2'), '10');
});

test('clears every populated cell inside a selected rectangle', () => {
  const sheet = createSheet();

  setCell(sheet, 'A1', '1');
  setCell(sheet, 'A2', '2');
  setCell(sheet, 'B1', '3');
  setCell(sheet, 'B2', '4');
  setCell(sheet, 'C1', '5');

  clearRange(sheet, { startRow: 0, startCol: 0, endRow: 1, endCol: 1 });

  assert.equal(getCellRaw(sheet, 'A1'), '');
  assert.equal(getCellRaw(sheet, 'A2'), '');
  assert.equal(getCellRaw(sheet, 'B1'), '');
  assert.equal(getCellRaw(sheet, 'B2'), '');
  assert.equal(getCellRaw(sheet, 'C1'), '5');
});

test('inserting a column shifts formulas to keep pointing at the same cells', () => {
  const sheet = createSheet();

  setCell(sheet, 'A1', '4');
  setCell(sheet, 'B1', '6');
  setCell(sheet, 'C1', '=SUM(A1:B1)');

  insertCol(sheet, 1);

  assert.equal(getCellRaw(sheet, 'D1'), '=SUM(A1:C1)');
  assert.equal(getCellDisplay(sheet, 'D1'), '10');
});

test('deleting a row turns references to removed cells into #REF!', () => {
  const sheet = createSheet();

  setCell(sheet, 'A1', '4');
  setCell(sheet, 'A2', '6');
  setCell(sheet, 'B1', '=A2');

  deleteRow(sheet, 1);

  assert.equal(getCellRaw(sheet, 'B1'), '=#REF!');
  assert.equal(getCellDisplay(sheet, 'B1'), '#REF!');
});

test('deleting a column turns references to removed cells into #REF!', () => {
  const sheet = createSheet();

  setCell(sheet, 'A1', '4');
  setCell(sheet, 'B1', '6');
  setCell(sheet, 'C1', '=B1');

  deleteCol(sheet, 1);

  assert.equal(getCellRaw(sheet, 'B1'), '=#REF!');
  assert.equal(getCellDisplay(sheet, 'B1'), '#REF!');
});
