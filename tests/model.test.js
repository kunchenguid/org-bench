const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheet,
  indexToColumnLabel,
  columnLabelToIndex,
} = require('../spreadsheet.js');

test('column labels round-trip across the visible grid', () => {
  assert.equal(indexToColumnLabel(0), 'A');
  assert.equal(indexToColumnLabel(25), 'Z');
  assert.equal(indexToColumnLabel(26), 'AA');
  assert.equal(columnLabelToIndex('A'), 0);
  assert.equal(columnLabelToIndex('Z'), 25);
  assert.equal(columnLabelToIndex('AA'), 26);
});

test('stores raw values and evaluates formulas through dependencies', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '3');
  sheet.setCell('A2', '4');
  sheet.setCell('A3', '=A1+A2');
  sheet.setCell('B1', '=SUM(A1:A3)');

  assert.equal(sheet.getDisplayValue('A3'), '7');
  assert.equal(sheet.getDisplayValue('B1'), '14');

  sheet.setCell('A2', '10');

  assert.equal(sheet.getDisplayValue('A3'), '13');
  assert.equal(sheet.getDisplayValue('B1'), '26');
});

test('supports boolean comparisons and branching', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '6');
  sheet.setCell('A2', '=IF(A1>=5, "high", "low")');
  sheet.setCell('A3', '=AND(A1>0, A1<10)');

  assert.equal(sheet.getDisplayValue('A2'), 'high');
  assert.equal(sheet.getDisplayValue('A3'), 'TRUE');
});

test('detects circular references', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');

  assert.equal(sheet.getDisplayValue('A1'), '#CIRC!');
  assert.equal(sheet.getDisplayValue('B1'), '#CIRC!');
});

test('copies formulas with relative references shifted by destination offset', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '1');
  sheet.setCell('A2', '2');
  sheet.setCell('B1', '=A1+A2');

  sheet.copyRange({ startRow: 0, startCol: 1, endRow: 0, endCol: 1 });
  sheet.pasteRange({ startRow: 1, startCol: 2, endRow: 1, endCol: 2 });

  assert.equal(sheet.getRawValue('C2'), '=B2+B3');

  sheet.setCell('B2', '5');
  sheet.setCell('B3', '8');
  assert.equal(sheet.getDisplayValue('C2'), '13');
});

test('inserting a row updates formulas to keep pointing at the same data', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('B1', '=SUM(A1:A2)');

  sheet.insertRow(0);

  assert.equal(sheet.getRawValue('B2'), '=SUM(A2:A3)');
  assert.equal(sheet.getDisplayValue('B2'), '5');
});

test('deleting a referenced row yields a ref error', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('B1', '=A2');

  sheet.deleteRow(1);

  assert.equal(sheet.getDisplayValue('B1'), '#REF!');
});

test('undo and redo restore prior user actions', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '10');
  sheet.setCell('A1', '20');
  sheet.undo();
  assert.equal(sheet.getDisplayValue('A1'), '10');

  sheet.redo();
  assert.equal(sheet.getDisplayValue('A1'), '20');
});

test('inserting and deleting columns rewrites references', () => {
  const sheet = createSpreadsheet();

  sheet.setCell('A1', '2');
  sheet.setCell('B1', '3');
  sheet.setCell('C1', '=A1+B1');

  sheet.insertColumn(0);

  assert.equal(sheet.getRawValue('D1'), '=B1+C1');
  assert.equal(sheet.getDisplayValue('D1'), '5');

  sheet.deleteColumn(1);

  assert.equal(sheet.getDisplayValue('C1'), '#REF!');
});
