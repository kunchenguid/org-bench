const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetStore } = require('../src/state.js');

function activeCell(store) {
  return store.getState().active;
}

test('initializes with A1 active and formula bar mirroring raw cell contents', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26 });

  assert.deepEqual(activeCell(store), { row: 0, col: 0 });
  assert.equal(store.getState().formulaBarValue, '');
});

test('typing outside edit mode starts replacement editing and commits to the active cell', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26 });

  store.beginTyping('4');
  assert.equal(store.getState().mode, 'editing');
  assert.equal(store.getState().draft, '4');

  store.commitEdit({ move: 'down' });

  assert.equal(store.getCellRaw(0, 0), '4');
  assert.deepEqual(activeCell(store), { row: 1, col: 0 });
  assert.equal(store.getState().formulaBarValue, '');
});

test('entering edit mode preserves prior contents and escape restores them', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26, initialCells: { A1: 'hello' } });

  store.startEdit();
  assert.equal(store.getState().draft, 'hello');

  store.updateDraft('changed');
  store.cancelEdit();

  assert.equal(store.getCellRaw(0, 0), 'hello');
  assert.equal(store.getState().mode, 'selected');
  assert.equal(store.getState().formulaBarValue, 'hello');
});

test('arrow navigation clamps at the grid bounds', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26 });

  store.moveActive('left');
  store.moveActive('up');
  assert.deepEqual(activeCell(store), { row: 0, col: 0 });

  store.selectCell(99, 25);
  store.moveActive('right');
  store.moveActive('down');
  assert.deepEqual(activeCell(store), { row: 99, col: 25 });
});

test('shift-extended movement grows a rectangular range anchored at the original cell', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26 });

  store.moveActive('right', { extend: true });
  store.moveActive('down', { extend: true });

  assert.deepEqual(store.getState().range, {
    start: { row: 0, col: 0 },
    end: { row: 1, col: 1 },
  });
  assert.deepEqual(activeCell(store), { row: 1, col: 1 });
});

test('clearing a selected range empties every covered cell as one undoable action', () => {
  const store = createSpreadsheetStore({
    rows: 100,
    cols: 26,
    initialCells: { A1: '1', A2: '2', B1: '3', B2: '4' },
  });

  store.setRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
  store.clearSelection();

  assert.equal(store.getCellRaw(0, 0), '');
  assert.equal(store.getCellRaw(1, 0), '');
  assert.equal(store.getCellRaw(0, 1), '');
  assert.equal(store.getCellRaw(1, 1), '');

  store.undo();
  assert.equal(store.getCellRaw(0, 0), '1');
  assert.equal(store.getCellRaw(1, 1), '4');
});

test('formula bar edits commit into the active cell and move right on tab', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26 });

  store.startFormulaBarEdit();
  store.updateDraft('=A1+1');
  store.commitEdit({ move: 'right' });

  assert.equal(store.getCellRaw(0, 0), '=A1+1');
  assert.deepEqual(activeCell(store), { row: 0, col: 1 });
});

test('undo and redo restore committed cell changes in order', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26 });

  store.beginTyping('1');
  store.commitEdit({ move: 'down' });
  store.beginTyping('2');
  store.commitEdit({ move: 'down' });

  store.undo();
  assert.equal(store.getCellRaw(1, 0), '');
  assert.deepEqual(activeCell(store), { row: 1, col: 0 });

  store.redo();
  assert.equal(store.getCellRaw(1, 0), '2');
  assert.deepEqual(activeCell(store), { row: 2, col: 0 });
});

test('selection matrix returns raw cell contents for rectangular copy operations', () => {
  const store = createSpreadsheetStore({
    rows: 100,
    cols: 26,
    initialCells: { A1: '1', B1: '=A1+1', A2: 'hello', B2: '' },
  });

  store.setRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });

  assert.deepEqual(store.getSelectionMatrix(), [
    ['1', '=A1+1'],
    ['hello', ''],
  ]);
});

test('replacing a range pastes a matrix as one undoable action', () => {
  const store = createSpreadsheetStore({ rows: 100, cols: 26 });

  store.replaceRange({ row: 0, col: 0 }, [
    ['1', '2'],
    ['3', '=A1+B1'],
  ]);

  assert.equal(store.getCellRaw(0, 0), '1');
  assert.equal(store.getCellRaw(0, 1), '2');
  assert.equal(store.getCellRaw(1, 0), '3');
  assert.equal(store.getCellRaw(1, 1), '=A1+B1');

  store.undo();

  assert.equal(store.getCellRaw(0, 0), '');
  assert.equal(store.getCellRaw(1, 1), '');
});
