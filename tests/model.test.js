const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetModel, expandRange, shiftFormulaReferences } = require('../src/model.js');

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

test('clears a batch of cells without disturbing unrelated values', () => {
  const model = createSpreadsheetModel();

  model.setCell('A1', 'keep');
  model.setCell('A2', 'remove');
  model.setCell('B2', '=1+1');
  model.setCell('C3', 'stay');

  model.clearCells(['A2', 'B2']);

  assert.equal(model.getRawValue('A1'), 'keep');
  assert.equal(model.getRawValue('A2'), '');
  assert.equal(model.getRawValue('B2'), '');
  assert.equal(model.getRawValue('C3'), 'stay');
});

test('expands rectangular ranges from any corner order', () => {
  assert.deepEqual(expandRange('B2', 'C3'), ['B2', 'C2', 'B3', 'C3']);
  assert.deepEqual(expandRange('C3', 'B2'), ['B2', 'C2', 'B3', 'C3']);
});

test('shows reference errors instead of silently clamping invalid addresses', () => {
  const model = createSpreadsheetModel();

  model.setCell('A1', '=AA1');
  model.setCell('A2', '=A101');

  assert.equal(model.getDisplayValue('A1'), '#REF!');
  assert.equal(model.getDisplayValue('A2'), '#REF!');
});

test('shifts only relative formula references during copy-paste', () => {
  assert.equal(shiftFormulaReferences('=A1+$B1+C$1+$D$1', 2, 1), '=B3+$B3+D$1+$D$1');
  assert.equal(shiftFormulaReferences('=SUM(A1:B2)', 1, 2), '=SUM(C2:D3)');
});

test('copies, pastes, and cuts rectangular cell blocks', () => {
  const model = createSpreadsheetModel();

  model.setCell('A1', '2');
  model.setCell('B1', '=A1+3');
  model.setCell('A2', 'note');

  const copied = model.copyRange('A1', 'B2');
  model.pasteRange('C3', copied);

  assert.equal(model.getRawValue('C3'), '2');
  assert.equal(model.getRawValue('D3'), '=C3+3');
  assert.equal(model.getDisplayValue('D3'), '5');
  assert.equal(model.getRawValue('C4'), 'note');

  const cut = model.cutRange('A1', 'B2');
  assert.equal(model.getRawValue('A1'), '');
  assert.equal(model.getRawValue('B1'), '');
  assert.equal(model.getRawValue('A2'), '');

  model.pasteRange('A5', cut);
  assert.equal(model.getRawValue('A5'), '2');
  assert.equal(model.getRawValue('B5'), '=A5+3');
  assert.equal(model.getDisplayValue('B5'), '5');
});
