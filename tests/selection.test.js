const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSelectionStore,
  clampCell,
  normalizeRange,
} = require('../selection.js');

test('clampCell keeps coordinates inside grid bounds', () => {
  assert.deepEqual(clampCell({ row: -4, col: 28 }, 100, 26), { row: 0, col: 25 });
});

test('moveActiveCell updates the active cell and collapses range by default', () => {
  const store = createSelectionStore({ rowCount: 100, colCount: 26 });

  store.moveActiveCell(2, 3);

  assert.deepEqual(store.getSelection(), {
    anchor: { row: 2, col: 3 },
    focus: { row: 2, col: 3 },
    active: { row: 2, col: 3 },
  });
});

test('shift+arrow extends the range from the original anchor', () => {
  const store = createSelectionStore({ rowCount: 100, colCount: 26 });

  store.moveActiveCell(4, 4);
  store.moveActiveCell(0, 2, { extend: true });
  store.moveActiveCell(3, 0, { extend: true });

  assert.deepEqual(store.getSelection(), {
    anchor: { row: 4, col: 4 },
    focus: { row: 7, col: 6 },
    active: { row: 7, col: 6 },
  });

  assert.deepEqual(normalizeRange(store.getSelection()), {
    startRow: 4,
    endRow: 7,
    startCol: 4,
    endCol: 6,
  });
});

test('shift+click extends the range while plain click resets it', () => {
  const store = createSelectionStore({ rowCount: 100, colCount: 26 });

  store.setActiveCell(8, 8);
  store.setActiveCell(10, 9, { extend: true });

  assert.deepEqual(normalizeRange(store.getSelection()), {
    startRow: 8,
    endRow: 10,
    startCol: 8,
    endCol: 9,
  });

  store.setActiveCell(3, 1);

  assert.deepEqual(store.getSelection(), {
    anchor: { row: 3, col: 1 },
    focus: { row: 3, col: 1 },
    active: { row: 3, col: 1 },
  });
});
