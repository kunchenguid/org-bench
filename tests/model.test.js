const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetModel, expandRange, createHistoryManager, shiftFormulaReferences } = require('../src/model.js');

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

test('shifts relative references when a formula is copied', () => {
  assert.equal(shiftFormulaReferences('=A1+$B2+C$3+$D$4', 1, 2), '=C2+$B3+E$3+$D$4');
});

test('pastes a copied block and rewrites relative formulas from the source offset', () => {
  const model = createSpreadsheetModel();

  model.setCell('A1', '5');
  model.setCell('B1', '=A1+1');
  const block = model.copyBlock('A1', 'B1');
  model.pasteBlock('A2', block);

  assert.equal(model.getRawValue('A2'), '5');
  assert.equal(model.getRawValue('B2'), '=A2+1');
  assert.equal(model.getDisplayValue('B2'), '6');
});

test('out of bounds shifts surface as reference errors after paste', () => {
  const model = createSpreadsheetModel();

  model.setCell('A2', '=A1');
  const block = model.copyBlock('A2', 'A2');
  model.pasteBlock('A1', block);

  assert.equal(model.getRawValue('A1'), '=#REF!');
  assert.equal(model.getDisplayValue('A1'), '#REF!');
});

test('undo and redo restore whole-sheet snapshots in order', () => {
  const history = createHistoryManager(3);

  history.record({ cells: { A1: '1' } }, { cells: { A1: '2' } });
  history.record({ cells: { A1: '2' } }, { cells: { A1: '3' } });

  assert.deepEqual(history.undo(), { cells: { A1: '2' } });
  assert.deepEqual(history.undo(), { cells: { A1: '1' } });
  assert.deepEqual(history.redo(), { cells: { A1: '2' } });
});

test('redo is dropped after recording a new action from an undone state', () => {
  const history = createHistoryManager(5);

  history.record({ cells: { A1: '1' } }, { cells: { A1: '2' } });
  history.record({ cells: { A1: '2' } }, { cells: { A1: '3' } });
  history.undo();
  history.record({ cells: { A1: '2' } }, { cells: { A1: '9' } });

  assert.equal(history.redo(), null);
});
