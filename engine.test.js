const assert = require('node:assert/strict');

const {
  createSheet,
  setCell,
  getCellRaw,
  getCellDisplay,
  copyRange,
  pasteBlock,
  shiftFormula,
} = require('./spreadsheet.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('stores raw values and evaluates simple formulas', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '2');
  setCell(sheet, 'A2', '3');
  setCell(sheet, 'A3', '=A1+A2');

  assert.equal(getCellRaw(sheet, 'A3'), '=A1+A2');
  assert.equal(getCellDisplay(sheet, 'A3'), '5');
});

test('recomputes dependent formulas when precedent changes', () => {
  const sheet = createSheet();
  setCell(sheet, 'B1', '10');
  setCell(sheet, 'B2', '=B1*2');

  assert.equal(getCellDisplay(sheet, 'B2'), '20');
  setCell(sheet, 'B1', '7');
  assert.equal(getCellDisplay(sheet, 'B2'), '14');
});

test('supports SUM across a range', () => {
  const sheet = createSheet();
  setCell(sheet, 'C1', '1');
  setCell(sheet, 'C2', '2');
  setCell(sheet, 'C3', '3');
  setCell(sheet, 'C4', '=SUM(C1:C3)');

  assert.equal(getCellDisplay(sheet, 'C4'), '6');
});

test('detects circular references', () => {
  const sheet = createSheet();
  setCell(sheet, 'D1', '=D2');
  setCell(sheet, 'D2', '=D1');

  assert.equal(getCellDisplay(sheet, 'D1'), '#CIRC!');
  assert.equal(getCellDisplay(sheet, 'D2'), '#CIRC!');
});

test('shifts relative and absolute references when formulas move', () => {
  assert.equal(shiftFormula('=A1+$B1+C$2+$D$3', 2, 1), '=C2+$B2+E$2+$D$3');
  assert.equal(shiftFormula('=SUM(A1:B2)', 1, 3), '=SUM(B4:C5)');
});

test('copies a range as raw cell contents', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '1');
  setCell(sheet, 'B1', '=A1');
  setCell(sheet, 'A2', 'hello');

  const copied = copyRange(sheet, 'A1', 'B2');
  assert.deepEqual(copied.values, [
    ['1', '=A1'],
    ['hello', ''],
  ]);
});

test('pastes copied formulas with relative references shifted to destination', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '2');
  setCell(sheet, 'B1', '=A1');

  const copied = copyRange(sheet, 'B1', 'B1');
  pasteBlock(sheet, copied, 'C1');

  assert.equal(getCellRaw(sheet, 'C1'), '=B1');
  assert.equal(getCellDisplay(sheet, 'C1'), '2');
});
