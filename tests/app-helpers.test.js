const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shiftFormulaForPaste,
  applyUndo,
  applyRedo,
} = require('../app-helpers.js');

test('shiftFormulaForPaste applies source-to-destination offset for relative references', () => {
  const shifted = shiftFormulaForPaste('=A1', { row: 1, col: 1 }, { row: 2, col: 1 });

  assert.equal(shifted, '=A2');
});

test('shiftFormulaForPaste preserves absolute row and column markers', () => {
  const shifted = shiftFormulaForPaste('=$A1&A$1&$B$2', { row: 1, col: 1 }, { row: 3, col: 2 });

  assert.equal(shifted, '=$A3&B$1&$B$2');
});

test('applyUndo restores the previous snapshot and primes redo with the undone state', () => {
  const result = applyUndo({ A1: '2' }, [{ before: { A1: '1' }, after: { A1: '2' } }], []);

  assert.deepEqual(result.cells, { A1: '1' });
  assert.deepEqual(result.redoStack, [{ before: { A1: '1' }, after: { A1: '2' } }]);
  assert.equal(result.undoStack.length, 0);
});

test('applyRedo restores the undone snapshot', () => {
  const result = applyRedo({ A1: '1' }, [], [{ before: { A1: '1' }, after: { A1: '2' } }]);

  assert.deepEqual(result.cells, { A1: '2' });
  assert.deepEqual(result.undoStack, [{ before: { A1: '1' }, after: { A1: '2' } }]);
  assert.equal(result.redoStack.length, 0);
});
