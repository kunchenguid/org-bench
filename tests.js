const assert = require('assert');
const { createSheet, setCellRaw, getCellDisplay, copyRange, pasteRange, insertRow, deleteColumn } = require('./spreadsheet-core.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('evaluates arithmetic formulas from referenced cells', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '2');
  setCellRaw(sheet, 1, 0, '3');
  setCellRaw(sheet, 0, 1, '=A1+A2*2');
  assert.strictEqual(getCellDisplay(sheet, 0, 1), '8');
});

test('supports range functions and text concatenation', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '4');
  setCellRaw(sheet, 1, 0, '6');
  setCellRaw(sheet, 2, 0, '10');
  setCellRaw(sheet, 0, 1, '="Total: "&SUM(A1:A3)');
  assert.strictEqual(getCellDisplay(sheet, 0, 1), 'Total: 20');
});

test('detects circular references', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '=B1');
  setCellRaw(sheet, 0, 1, '=A1');
  assert.strictEqual(getCellDisplay(sheet, 0, 0), '#CIRC!');
});

test('shifts relative references on paste', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '1');
  setCellRaw(sheet, 1, 0, '2');
  setCellRaw(sheet, 0, 1, '=A1+A2');
  const copied = copyRange(sheet, { startRow: 0, endRow: 0, startCol: 1, endCol: 1 });
  pasteRange(sheet, copied, 0, 2);
  assert.strictEqual(getCellDisplay(sheet, 0, 2), '3');
  assert.strictEqual(sheet.cells['0,2'], '=B1+B2');
});

test('updates references when inserting rows', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '7');
  setCellRaw(sheet, 1, 0, '11');
  setCellRaw(sheet, 2, 0, '=SUM(A1:A2)');
  insertRow(sheet, 1);
  assert.strictEqual(sheet.cells['3,0'], '=SUM(A1:A3)');
  assert.strictEqual(getCellDisplay(sheet, 3, 0), '18');
});

test('marks deleted column references as ref errors', () => {
  const sheet = createSheet();
  setCellRaw(sheet, 0, 0, '5');
  setCellRaw(sheet, 0, 1, '=A1');
  deleteColumn(sheet, 0);
  assert.strictEqual(getCellDisplay(sheet, 0, 0), '#REF!');
});
