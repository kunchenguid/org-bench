const assert = require('node:assert/strict');

const {
  createWorkbook,
  evaluateCellDisplay,
  shiftFormulaForPaste,
  getStorageKey,
} = require('../spreadsheet.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('evaluates arithmetic formulas across cell references', () => {
  const workbook = createWorkbook();
  workbook.setCell('A1', '2');
  workbook.setCell('A2', '3');
  workbook.setCell('A3', '=A1+A2*4');

  assert.equal(evaluateCellDisplay(workbook, 'A3'), '14');
});

test('recomputes dependent formulas after source changes', () => {
  const workbook = createWorkbook();
  workbook.setCell('A1', '5');
  workbook.setCell('B1', '=A1*2');

  assert.equal(evaluateCellDisplay(workbook, 'B1'), '10');

  workbook.setCell('A1', '7');
  assert.equal(evaluateCellDisplay(workbook, 'B1'), '14');
});

test('supports SUM over a vertical range', () => {
  const workbook = createWorkbook();
  workbook.setCell('A1', '1');
  workbook.setCell('A2', '2');
  workbook.setCell('A3', '3');
  workbook.setCell('B1', '=SUM(A1:A3)');

  assert.equal(evaluateCellDisplay(workbook, 'B1'), '6');
});

test('marks circular references clearly', () => {
  const workbook = createWorkbook();
  workbook.setCell('A1', '=B1');
  workbook.setCell('B1', '=A1');

  assert.equal(evaluateCellDisplay(workbook, 'A1'), '#CIRC!');
  assert.equal(evaluateCellDisplay(workbook, 'B1'), '#CIRC!');
});

test('shifts only relative references when pasting formulas', () => {
  assert.equal(shiftFormulaForPaste('=A1+$B$2+C$3+$D4', 1, 2), '=C2+$B$2+E$3+$D5');
});

test('builds namespaced storage keys', () => {
  assert.equal(getStorageKey('apple-run', 'workbook'), 'apple-run:workbook');
});

test('inserting a row rewrites moved formulas to keep pointing at the same data', () => {
  const workbook = createWorkbook();
  workbook.setCell('A2', '7');
  workbook.setCell('B3', '=A2');

  workbook.insertRow(2);

  assert.equal(workbook.getCell('B4'), '=A3');
  assert.equal(evaluateCellDisplay(workbook, 'B4'), '7');
});

test('deleting a referenced row turns the formula reference into #REF!', () => {
  const workbook = createWorkbook();
  workbook.setCell('A2', '7');
  workbook.setCell('B4', '=A2');

  workbook.deleteRow(2);

  assert.equal(workbook.getCell('B3'), '=#REF!');
  assert.equal(evaluateCellDisplay(workbook, 'B3'), '#REF!');
});

test('inserting a column rewrites formulas after the insertion point', () => {
  const workbook = createWorkbook();
  workbook.setCell('B1', '9');
  workbook.setCell('C2', '=B1');

  workbook.insertColumn(2);

  assert.equal(workbook.getCell('D2'), '=C1');
  assert.equal(evaluateCellDisplay(workbook, 'D2'), '9');
});

test('deleting a referenced column turns the formula reference into #REF!', () => {
  const workbook = createWorkbook();
  workbook.setCell('B1', '9');
  workbook.setCell('D2', '=B1');

  workbook.deleteColumn(2);

  assert.equal(workbook.getCell('C2'), '=#REF!');
  assert.equal(evaluateCellDisplay(workbook, 'C2'), '#REF!');
});
