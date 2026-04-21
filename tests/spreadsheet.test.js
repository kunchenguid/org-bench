const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SpreadsheetModel,
  coordsToRef,
} = require('../spreadsheet.js');

test('evaluates formulas with references and functions', () => {
  const model = new SpreadsheetModel();
  model.setCellRaw('A1', '10');
  model.setCellRaw('A2', '5');
  model.setCellRaw('B1', '=A1+A2');
  model.setCellRaw('B2', '=SUM(A1:A2)');
  model.setCellRaw('B3', '=IF(B1>B2, "big", "small")');

  assert.equal(model.getDisplayValue('B1'), '15');
  assert.equal(model.getDisplayValue('B2'), '15');
  assert.equal(model.getDisplayValue('B3'), 'small');
});

test('propagates formula errors through boolean functions', () => {
  const model = new SpreadsheetModel();
  model.setCellRaw('A1', '=1/0');
  model.setCellRaw('A2', '=IF(A1, "x", "y")');
  model.setCellRaw('A3', '=AND(A1, TRUE)');
  model.setCellRaw('A4', '=OR(FALSE, A1)');
  model.setCellRaw('A5', '=NOT(A1)');

  assert.equal(model.getDisplayValue('A2'), '#DIV/0!');
  assert.equal(model.getDisplayValue('A3'), '#DIV/0!');
  assert.equal(model.getDisplayValue('A4'), '#DIV/0!');
  assert.equal(model.getDisplayValue('A5'), '#DIV/0!');
});

test('detects circular references', () => {
  const model = new SpreadsheetModel();
  model.setCellRaw('A1', '=B1');
  model.setCellRaw('B1', '=A1');

  assert.equal(model.getDisplayValue('A1'), '#CIRC!');
  assert.equal(model.getDisplayValue('B1'), '#CIRC!');
});

test('copy-paste shifts relative references', () => {
  const model = new SpreadsheetModel();
  model.setCellRaw('A1', '2');
  model.setCellRaw('A2', '3');
  model.setCellRaw('B1', '=A1+A2');

  model.copyRange({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, false);
  model.pasteRange({ startRow: 0, endRow: 0, startCol: 2, endCol: 2 });

  assert.equal(model.getCellRaw('C1'), '=B1+B2');
});

test('inserting a row keeps references pointing at the same data', () => {
  const model = new SpreadsheetModel();
  model.setCellRaw('A1', '10');
  model.setCellRaw('A2', '20');
  model.setCellRaw('B1', '=SUM(A1:A2)');

  model.insertRow(0);

  assert.equal(model.getCellRaw('B2'), '=SUM(A2:A3)');
  assert.equal(model.getDisplayValue('B2'), '30');
});

test('undo and redo restore prior cell state', () => {
  const model = new SpreadsheetModel();
  model.applyEdit({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, [[{ raw: '7' }]]);
  model.applyEdit({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, [[{ raw: '9' }]]);

  model.undo();
  assert.equal(model.getCellRaw('A1'), '7');

  model.redo();
  assert.equal(model.getCellRaw('A1'), '9');
});

test('coordsToRef produces spreadsheet references', () => {
  assert.equal(coordsToRef(0, 0), 'A1');
  assert.equal(coordsToRef(4, 27), 'AB5');
});
