const test = require('node:test');
const assert = require('node:assert/strict');

const { SpreadsheetModel } = require('./spreadsheet-core.js');

test('formulas evaluate arithmetic and recompute dependencies', () => {
  const sheet = new SpreadsheetModel(100, 26);

  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('A3', '=A1+A2');

  assert.equal(sheet.getDisplay('A3'), '5');

  sheet.setCell('A1', '10');

  assert.equal(sheet.getDisplay('A3'), '13');
});

test('SUM evaluates rectangular ranges', () => {
  const sheet = new SpreadsheetModel(100, 26);

  sheet.setCell('A1', '1');
  sheet.setCell('A2', '2');
  sheet.setCell('B1', '3');
  sheet.setCell('B2', '4');
  sheet.setCell('C1', '=SUM(A1:B2)');

  assert.equal(sheet.getDisplay('C1'), '10');
});
