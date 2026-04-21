const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSelectionController,
  normalizeSelectionRange,
} = require('../src/grid-selection.js');

function createStoreStub() {
  const state = {
    activeCell: { row: 0, col: 0 },
    selection: {
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    },
  };

  return {
    getSnapshot() {
      return {
        activeCell: { ...state.activeCell },
        selection: {
          anchor: { ...state.selection.anchor },
          focus: { ...state.selection.focus },
        },
      };
    },
    setActiveCell(point) {
      state.activeCell = { ...point };
    },
    setSelection(selection) {
      state.selection = {
        anchor: { ...selection.anchor },
        focus: { ...selection.focus },
      };
    },
  };
}

test('selectCell collapses selection to the clicked cell by default', () => {
  const store = createStoreStub();
  const controller = createSelectionController(store, { rowCount: 100, colCount: 26 });

  controller.selectCell({ row: 8, col: 3 });

  assert.deepEqual(store.getSnapshot(), {
    activeCell: { row: 8, col: 3 },
    selection: {
      anchor: { row: 8, col: 3 },
      focus: { row: 8, col: 3 },
    },
  });
});

test('moveActiveCell clamps at the grid edge', () => {
  const store = createStoreStub();
  const controller = createSelectionController(store, { rowCount: 100, colCount: 26 });

  controller.moveActiveCell(-2, -2);

  assert.deepEqual(store.getSnapshot().activeCell, { row: 0, col: 0 });
  assert.deepEqual(store.getSnapshot().selection, {
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  });
});

test('shift+arrow extends from the original anchor', () => {
  const store = createStoreStub();
  const controller = createSelectionController(store, { rowCount: 100, colCount: 26 });

  controller.selectCell({ row: 4, col: 4 });
  controller.moveActiveCell(0, 3, { extend: true });
  controller.moveActiveCell(2, 0, { extend: true });

  assert.deepEqual(store.getSnapshot(), {
    activeCell: { row: 6, col: 7 },
    selection: {
      anchor: { row: 4, col: 4 },
      focus: { row: 6, col: 7 },
    },
  });

  assert.deepEqual(normalizeSelectionRange(store.getSnapshot().selection), {
    startRow: 4,
    endRow: 6,
    startCol: 4,
    endCol: 7,
  });
});

test('shift+click extends the range from the current anchor', () => {
  const store = createStoreStub();
  const controller = createSelectionController(store, { rowCount: 100, colCount: 26 });

  controller.selectCell({ row: 1, col: 1 });
  controller.selectCell({ row: 3, col: 5 }, { extend: true });

  assert.deepEqual(store.getSnapshot(), {
    activeCell: { row: 3, col: 5 },
    selection: {
      anchor: { row: 1, col: 1 },
      focus: { row: 3, col: 5 },
    },
  });
});
