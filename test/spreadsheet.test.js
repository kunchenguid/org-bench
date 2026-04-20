const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSheet,
  setCellRaw,
  getCellComputed,
  shiftFormula,
} = require('../spreadsheet.js');

test('evaluates arithmetic, ranges, and dependent formulas', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '2');
  setCellRaw(sheet, 1, 0, '3');
  setCellRaw(sheet, 2, 0, '=A1+A2');
  setCellRaw(sheet, 3, 0, '=SUM(A1:A3)');

  assert.equal(getCellComputed(sheet, 2, 0).display, '5');
  assert.equal(getCellComputed(sheet, 3, 0).display, '10');

  setCellRaw(sheet, 1, 0, '5');

  assert.equal(getCellComputed(sheet, 2, 0).display, '7');
  assert.equal(getCellComputed(sheet, 3, 0).display, '14');
});

test('supports text concatenation, booleans, and IF', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '4');
  setCellRaw(sheet, 0, 1, '=IF(A1>3, "big", "small")');
  setCellRaw(sheet, 0, 2, '="value: "&B1');

  assert.equal(getCellComputed(sheet, 0, 1).display, 'big');
  assert.equal(getCellComputed(sheet, 0, 2).display, 'value: big');
});

test('detects circular references', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '=B1');
  setCellRaw(sheet, 0, 1, '=A1');

  assert.equal(getCellComputed(sheet, 0, 0).display, '#CIRC!');
  assert.equal(getCellComputed(sheet, 0, 1).display, '#CIRC!');
});

test('shifts relative references while preserving absolute components', () => {
  assert.equal(shiftFormula('=A1+$B2+C$3+$D$4', 2, 1), '=B3+$B4+D$3+$D$4');
  assert.equal(shiftFormula('=SUM(A1:B2)', 1, 2), '=SUM(C2:D3)');
});
