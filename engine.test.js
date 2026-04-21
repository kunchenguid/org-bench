const assert = require('node:assert/strict');

const {
  createSheet,
  setCell,
  getCellRaw,
  getCellDisplay,
  copyBlock,
  pasteBlock,
  clearBlock,
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

test('copying and pasting a formula shifts relative references', () => {
  const sheet = createSheet();
  setCell(sheet, 'A2', '2');
  setCell(sheet, 'B2', '=A2');

  const block = copyBlock(sheet, 'B2', 'B2');
  pasteBlock(sheet, 'C3', block);

  assert.equal(getCellRaw(sheet, 'C3'), '=B3');
  assert.equal(getCellDisplay(sheet, 'C3'), '');
});

test('clearing a copied block removes the source cells', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '7');

  clearBlock(sheet, 'A1', 'A1');

  assert.equal(getCellRaw(sheet, 'A1'), '');
});
