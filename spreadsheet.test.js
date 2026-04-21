const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetState,
  commitCell,
  moveSelection,
  serializeState,
  deserializeState,
  applyCellEdit,
  undo,
  redo,
  setSelection,
  extendSelection,
  clearRange,
  normalizeRange,
} = require('./spreadsheet-core.js');

test('starts with A1 selected and an empty sheet', () => {
  const state = createSpreadsheetState();

  assert.deepEqual(state.selection, { row: 0, col: 0 });
  assert.equal(state.cells.size, 0);
});

test('committing cell content stores raw text and display value', () => {
  const state = createSpreadsheetState();

  commitCell(state, 0, 0, '42');
  const cell = state.cells.get('A1');

  assert.deepEqual(cell, {
    raw: '42',
    value: 42,
    display: '42',
    kind: 'number',
  });
});

test('moving selection clamps to sheet bounds', () => {
  const state = createSpreadsheetState();

  moveSelection(state, -1, -1);
  assert.deepEqual(state.selection, { row: 0, col: 0 });

  moveSelection(state, 150, 30);
  assert.deepEqual(state.selection, { row: 99, col: 25 });
});

test('serializes and restores only namespaced spreadsheet state', () => {
  const state = createSpreadsheetState();
  state.selection = { row: 3, col: 4 };
  commitCell(state, 3, 4, 'hello');

  const entries = serializeState(state, 'bench:');

  assert.deepEqual(entries, {
    'bench:spreadsheet': JSON.stringify({
      selection: { row: 3, col: 4 },
      cells: {
        E4: 'hello',
      },
    }),
  });

  const restored = deserializeState(entries, 'bench:');
  assert.deepEqual(restored.selection, { row: 3, col: 4 });
  assert.deepEqual(restored.cells.get('E4'), {
    raw: 'hello',
    value: 'hello',
    display: 'hello',
    kind: 'text',
  });
});

test('undo reverts the latest cell edit and redo reapplies it', () => {
  const state = createSpreadsheetState();

  applyCellEdit(state, 0, 0, '12');
  applyCellEdit(state, 0, 0, '34');

  assert.equal(state.cells.get('A1').raw, '34');

  undo(state);
  assert.equal(state.cells.get('A1').raw, '12');

  redo(state);
  assert.equal(state.cells.get('A1').raw, '34');
});

test('undo restores a cleared cell and keeps history bounded', () => {
  const state = createSpreadsheetState();

  applyCellEdit(state, 1, 1, 'kept');
  applyCellEdit(state, 1, 1, '');

  assert.equal(state.cells.has('B2'), false);

  undo(state);
  assert.equal(state.cells.get('B2').raw, 'kept');

  for (let index = 0; index < 60; index += 1) {
    applyCellEdit(state, 0, 0, String(index));
  }

  assert.equal(state.history.past.length, 50);
});

test('shift-style range extension keeps the anchor and updates the active cell', () => {
  const state = createSpreadsheetState();

  setSelection(state, 1, 1);
  extendSelection(state, 3, 4);

  assert.deepEqual(state.selection, { row: 3, col: 4 });
  assert.deepEqual(normalizeRange(state.range), {
    top: 1,
    left: 1,
    bottom: 3,
    right: 4,
  });
});

test('clearing a selected range removes all covered cells in one undoable action', () => {
  const state = createSpreadsheetState();

  applyCellEdit(state, 0, 0, 'A');
  applyCellEdit(state, 0, 1, 'B');
  applyCellEdit(state, 1, 0, 'C');
  applyCellEdit(state, 1, 1, 'D');
  setSelection(state, 0, 0);
  extendSelection(state, 1, 1);

  clearRange(state);

  assert.equal(state.cells.size, 0);

  undo(state);
  assert.equal(state.cells.get('A1').raw, 'A');
  assert.equal(state.cells.get('B1').raw, 'B');
  assert.equal(state.cells.get('A2').raw, 'C');
  assert.equal(state.cells.get('B2').raw, 'D');
});
