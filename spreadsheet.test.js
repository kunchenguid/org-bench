const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SpreadsheetModel,
  moveFormula,
} = require('./spreadsheet.js');

test('evaluates arithmetic formulas with references and functions', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '10');
  sheet.setCellRaw('A2', '5');
  sheet.setCellRaw('A3', '=A1+A2*2');
  sheet.setCellRaw('B1', '=SUM(A1:A3)');

  assert.equal(sheet.getDisplayValue('A3'), '20');
  assert.equal(sheet.getDisplayValue('B1'), '35');
});

test('recomputes dependents when precedent cells change', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '3');
  sheet.setCellRaw('B1', '=A1*4');

  assert.equal(sheet.getDisplayValue('B1'), '12');

  sheet.setCellRaw('A1', '8');

  assert.equal(sheet.getDisplayValue('B1'), '32');
});

test('reports circular references clearly', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '=B1');
  sheet.setCellRaw('B1', '=A1');

  assert.equal(sheet.getDisplayValue('A1'), '#CIRC!');
  assert.equal(sheet.getDisplayValue('B1'), '#CIRC!');
});

test('shifts relative references during formula moves', () => {
  assert.equal(moveFormula('=A1+$B$2+C$3+$D4', 1, 2), '=C2+$B$2+E$3+$D5');
});

test('round-trips serializable sheet state', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('C7', '=ROUND(10/3, 2)');

  const copy = SpreadsheetModel.fromJSON(sheet.toJSON());

  assert.equal(copy.getRaw('C7'), '=ROUND(10/3, 2)');
  assert.equal(copy.getDisplayValue('C7'), '3.33');
});

test('evaluates comparison, boolean, and text formulas through the integrated engine', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '9');
  sheet.setCellRaw('A2', '3');
  sheet.setCellRaw('B1', '=A1>A2');
  sheet.setCellRaw('B2', '=IF(A1>A2, "high", "low")');
  sheet.setCellRaw('B3', '=AND(TRUE, A2<5)');
  sheet.setCellRaw('B4', '=NOT(FALSE)');
  sheet.setCellRaw('B5', '=CONCAT("Total: ", A1)');
  sheet.setCellRaw('B6', '=MIN(A1:A2)');
  sheet.setCellRaw('B7', '=MAX(A1:A2)');
  sheet.setCellRaw('B8', '=COUNT(A1:A2)');

  assert.equal(sheet.getDisplayValue('B1'), 'TRUE');
  assert.equal(sheet.getDisplayValue('B2'), 'high');
  assert.equal(sheet.getDisplayValue('B3'), 'TRUE');
  assert.equal(sheet.getDisplayValue('B4'), 'TRUE');
  assert.equal(sheet.getDisplayValue('B5'), 'Total: 9');
  assert.equal(sheet.getDisplayValue('B6'), '3');
  assert.equal(sheet.getDisplayValue('B7'), '9');
  assert.equal(sheet.getDisplayValue('B8'), '2');
});

test('surfaces spreadsheet-style divide-by-zero errors', () => {
  const sheet = new SpreadsheetModel();
  sheet.setCellRaw('A1', '10');
  sheet.setCellRaw('A2', '0');
  sheet.setCellRaw('B1', '=A1/A2');

  assert.equal(sheet.getDisplayValue('B1'), '#DIV/0!');
});
