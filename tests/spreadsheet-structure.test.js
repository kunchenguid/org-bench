const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEmptyState,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  createHistory,
} = require('../src/spreadsheet-structure');

test('insertRow shifts referenced rows and moved cell addresses', () => {
  const state = createEmptyState({
    cells: {
      A1: '1',
      B2: '=A1+A3',
      C3: '=SUM($A1:B$3)',
    },
  });

  const next = insertRow(state, 2);

  assert.deepEqual(next.cells, {
    A1: '1',
    B3: '=A1+A4',
    C4: '=SUM($A1:B$4)',
  });
});

test('deleteRow shrinks ranges and marks deleted single-cell references', () => {
  const state = createEmptyState({
    cells: {
      A1: '1',
      B1: '=A2',
      C1: '=SUM(A1:A3)',
      D3: '=A4',
    },
  });

  const next = deleteRow(state, 2);

  assert.deepEqual(next.cells, {
    A1: '1',
    B1: '=#REF!',
    C1: '=SUM(A1:A2)',
    D2: '=A3',
  });
});

test('insertColumn and deleteColumn rewrite column references', () => {
  const state = createEmptyState({
    cells: {
      A1: '=B1+C1',
      B2: '=SUM(B1:C3)',
      C3: '=A$1+$B3',
    },
  });

  const inserted = insertColumn(state, 2);
  assert.deepEqual(inserted.cells, {
    A1: '=C1+D1',
    C2: '=SUM(C1:D3)',
    D3: '=A$1+$C3',
  });

  const deleted = deleteColumn(inserted, 3);
  assert.deepEqual(deleted.cells, {
    A1: '=#REF!+C1',
    C3: '=A$1+#REF!',
  });
});

test('history undo and redo restore whole-user-action snapshots', () => {
  const history = createHistory(3);
  const initial = createEmptyState({ cells: { A1: '1' } });
  const afterInsert = insertRow(initial, 1);
  const afterDelete = deleteColumn(afterInsert, 1);

  history.record(initial, afterInsert, 'insert-row');
  history.record(afterInsert, afterDelete, 'delete-column');

  const undoStep = history.undo(afterDelete);
  assert.equal(undoStep.label, 'delete-column');
  assert.deepEqual(undoStep.state, afterInsert);

  const secondUndo = history.undo(undoStep.state);
  assert.equal(secondUndo.label, 'insert-row');
  assert.deepEqual(secondUndo.state, initial);

  const redoStep = history.redo(secondUndo.state);
  assert.equal(redoStep.label, 'insert-row');
  assert.deepEqual(redoStep.state, afterInsert);
});

test('history drops redo stack after a new action and enforces limit', () => {
  const history = createHistory(2);
  const s0 = createEmptyState();
  const s1 = createEmptyState({ cells: { A1: '1' } });
  const s2 = createEmptyState({ cells: { A1: '2' } });
  const s3 = createEmptyState({ cells: { A1: '3' } });

  history.record(s0, s1, 'edit-1');
  history.record(s1, s2, 'edit-2');
  history.record(s2, s3, 'edit-3');

  const undo = history.undo(s3);
  assert.equal(undo.label, 'edit-3');
  assert.deepEqual(undo.state, s2);

  history.record(s2, s1, 'edit-4');

  assert.equal(history.canRedo(), false);
  const nextUndo = history.undo(s1);
  assert.equal(nextUndo.label, 'edit-4');

  const finalUndo = history.undo(nextUndo.state);
  assert.equal(finalUndo.label, 'edit-2');

  assert.equal(history.canUndo(), false);
});
