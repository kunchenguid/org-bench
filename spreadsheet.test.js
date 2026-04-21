const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetState,
  commitCell,
  moveSelection,
  serializeState,
  deserializeState,
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
