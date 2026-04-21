const test = require('node:test');
const assert = require('node:assert/strict');

const { SpreadsheetModel } = require('../spreadsheet.js');

test('stores raw values and evaluates references and arithmetic', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCell('A1', '7');
  sheet.setCell('A2', '5');
  sheet.setCell('B1', '=A1+A2*2');

  assert.equal(sheet.getRaw('B1'), '=A1+A2*2');
  assert.equal(sheet.getDisplay('B1'), '17');
});

test('recalculates dependents when precedent cells change', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('B1', '=SUM(A1:A2)');

  assert.equal(sheet.getDisplay('B1'), '5');

  sheet.setCell('A2', '8');

  assert.equal(sheet.getDisplay('B1'), '10');
});

test('supports booleans, concatenation, and conditional functions', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCell('A1', '12');
  sheet.setCell('B1', '=IF(A1>10, "big", "small")&" value"');

  assert.equal(sheet.getDisplay('B1'), 'big value');
});

test('surfaces circular references as #CIRC!', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCell('A1', '=B1');
  sheet.setCell('B1', '=A1');

  assert.equal(sheet.getDisplay('A1'), '#CIRC!');
  assert.equal(sheet.getDisplay('B1'), '#CIRC!');
});

test('surfaces division by zero as #DIV/0!', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCell('A1', '=4/0');

  assert.equal(sheet.getDisplay('A1'), '#DIV/0!');
});
