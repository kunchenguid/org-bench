const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEmptySheet,
  setCell,
  getCellValue,
  getDisplayValue,
  shiftFormulaReferences,
  stepAddress,
} = require('../src/engine.js');

test('evaluates arithmetic formulas using cell references', () => {
  const sheet = createEmptySheet();

  setCell(sheet, 'A1', '2');
  setCell(sheet, 'A2', '3');
  setCell(sheet, 'A3', '=A1+A2*4');

  assert.equal(getCellValue(sheet, 'A3'), 14);
  assert.equal(getDisplayValue(sheet, 'A3'), '14');
});

test('recalculates dependents after a precedent cell changes', () => {
  const sheet = createEmptySheet();

  setCell(sheet, 'B1', '5');
  setCell(sheet, 'B2', '=B1+1');
  assert.equal(getCellValue(sheet, 'B2'), 6);

  setCell(sheet, 'B1', '9');
  assert.equal(getCellValue(sheet, 'B2'), 10);
});

test('supports SUM over a rectangular range', () => {
  const sheet = createEmptySheet();

  setCell(sheet, 'A1', '1');
  setCell(sheet, 'A2', '2');
  setCell(sheet, 'A3', '3');
  setCell(sheet, 'B1', '=SUM(A1:A3)');

  assert.equal(getCellValue(sheet, 'B1'), 6);
});

test('detects simple circular references', () => {
  const sheet = createEmptySheet();

  setCell(sheet, 'C1', '=C2');
  setCell(sheet, 'C2', '=C1');

  assert.equal(getDisplayValue(sheet, 'C1'), '#CIRC!');
  assert.equal(getDisplayValue(sheet, 'C2'), '#CIRC!');
});

test('preserves literal text for non-numeric input', () => {
  const sheet = createEmptySheet();

  setCell(sheet, 'D1', 'hello');

  assert.equal(getCellValue(sheet, 'D1'), 'hello');
  assert.equal(getDisplayValue(sheet, 'D1'), 'hello');
});

test('shifts relative references when a formula is pasted', () => {
  assert.equal(
    shiftFormulaReferences('=A1+B$2+$C3+$D$4', 2, 1),
    '=B3+C$2+$C5+$D$4'
  );
});

test('shifts both ends of a range when a formula is pasted', () => {
  assert.equal(
    shiftFormulaReferences('=SUM(A1:B2)', 1, 2),
    '=SUM(C2:D3)'
  );
});

test('steps addresses within the sheet bounds', () => {
  assert.equal(stepAddress('A1', 'left', 26, 100), 'A1');
  assert.equal(stepAddress('A1', 'up', 26, 100), 'A1');
  assert.equal(stepAddress('A1', 'right', 26, 100), 'B1');
  assert.equal(stepAddress('A1', 'down', 26, 100), 'A2');
  assert.equal(stepAddress('Z100', 'right', 26, 100), 'Z100');
  assert.equal(stepAddress('Z100', 'down', 26, 100), 'Z100');
  assert.equal(stepAddress('C3', 'left', 26, 100), 'B3');
});
