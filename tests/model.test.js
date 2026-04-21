const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetModel } = require('../src/model.js');

test('stores raw values and evaluates formulas through references', () => {
  const model = createSpreadsheetModel();

  model.setCell('A1', '7');
  model.setCell('A2', '5');
  model.setCell('A3', '=A1+A2');

  assert.equal(model.getDisplayValue('A3'), '12');
  assert.equal(model.getRawValue('A3'), '=A1+A2');
});

test('supports ranges and builtin functions', () => {
  const model = createSpreadsheetModel();

  model.setCell('A1', '2');
  model.setCell('A2', '4');
  model.setCell('A3', '6');
  model.setCell('B1', '=SUM(A1:A3)');
  model.setCell('B2', '=AVERAGE(A1:A3)');
  model.setCell('B3', '=CONCAT("Total: ", B1)');

  assert.equal(model.getDisplayValue('B1'), '12');
  assert.equal(model.getDisplayValue('B2'), '4');
  assert.equal(model.getDisplayValue('B3'), 'Total: 12');
});

test('recomputes dependents and detects circular references', () => {
  const model = createSpreadsheetModel();

  model.setCell('A1', '1');
  model.setCell('A2', '=A1+1');
  assert.equal(model.getDisplayValue('A2'), '2');

  model.setCell('A1', '10');
  assert.equal(model.getDisplayValue('A2'), '11');

  model.setCell('B1', '=B2');
  model.setCell('B2', '=B1');
  assert.equal(model.getDisplayValue('B1'), '#CIRC!');
  assert.equal(model.getDisplayValue('B2'), '#CIRC!');
});

test('tracks the active selection for persistence', () => {
  const model = createSpreadsheetModel();

  model.selectCell('C7');

  assert.equal(model.getSelectedCell(), 'C7');
  assert.deepEqual(model.serialize(), {
    cells: {},
    selectedCell: 'C7'
  });
});
