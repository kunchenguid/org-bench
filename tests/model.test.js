const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SpreadsheetModel,
  shiftFormula,
} = require('../spreadsheet-model.js');

test('evaluates arithmetic formulas with cell references', () => {
  const model = new SpreadsheetModel();

  model.setCellRaw('A1', '2');
  model.setCellRaw('A2', '3');
  model.setCellRaw('B1', '=A1+A2*4');

  assert.equal(model.getCellDisplay('B1'), '14');
});

test('recomputes formulas when precedent cells change', () => {
  const model = new SpreadsheetModel();

  model.setCellRaw('A1', '10');
  model.setCellRaw('B1', '=A1*2');
  assert.equal(model.getCellDisplay('B1'), '20');

  model.setCellRaw('A1', '7');
  assert.equal(model.getCellDisplay('B1'), '14');
});

test('supports range functions', () => {
  const model = new SpreadsheetModel();

  model.setCellRaw('A1', '1');
  model.setCellRaw('A2', '2');
  model.setCellRaw('A3', '3');
  model.setCellRaw('B1', '=SUM(A1:A3)');
  model.setCellRaw('B2', '=AVERAGE(A1:A3)');

  assert.equal(model.getCellDisplay('B1'), '6');
  assert.equal(model.getCellDisplay('B2'), '2');
});

test('reports circular references clearly', () => {
  const model = new SpreadsheetModel();

  model.setCellRaw('A1', '=B1');
  model.setCellRaw('B1', '=A1');

  assert.equal(model.getCellDisplay('A1'), '#CIRC!');
  assert.equal(model.getCellDisplay('B1'), '#CIRC!');
});

test('shifts relative references while keeping absolute anchors', () => {
  assert.equal(shiftFormula('=A1+$B$2+C$3+$D4', 2, 1), '=B3+$B$2+D$3+$D6');
});
