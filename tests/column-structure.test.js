const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetEngine } = require('../src/spreadsheet-engine.js');

test('inserting a column updates formulas to keep pointing at moved data', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '10');
  engine.setCell('B1', '20');
  engine.setCell('C1', '=SUM(A1:B1)');

  engine.insertColumn(0);

  assert.equal(engine.getRawValue('B1'), '10');
  assert.equal(engine.getRawValue('C1'), '20');
  assert.equal(engine.getRawValue('D1'), '=SUM(B1:C1)');
  assert.equal(engine.getDisplayValue('D1'), '30');
});

test('deleting a referenced column produces #REF! for removed cells', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '10');
  engine.setCell('B1', '=A1');

  engine.deleteColumn(0);

  assert.equal(engine.getRawValue('A1'), '=#REF!');
  assert.equal(engine.getDisplayValue('A1'), '#REF!');
});
