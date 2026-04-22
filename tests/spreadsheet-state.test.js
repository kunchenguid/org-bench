const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createInitialState,
  moveActiveCell,
  beginRangeSelection,
  extendSelectionTo,
  beginEditing,
  applyEditDraft,
  commitEdit,
  cancelEdit,
  getCellKey,
} = require('../spreadsheet-state.js');

test('createInitialState selects A1 with a 26x100 grid', () => {
  const state = createInitialState();

  assert.equal(state.grid.columns, 26);
  assert.equal(state.grid.rows, 100);
  assert.deepEqual(state.activeCell, { col: 0, row: 0 });
  assert.deepEqual(state.selection, {
    anchor: { col: 0, row: 0 },
    focus: { col: 0, row: 0 },
  });
  assert.equal(state.mode, 'navigation');
});

test('moveActiveCell clamps to grid bounds and collapses range selection', () => {
  let state = createInitialState();
  state = beginRangeSelection(state, { col: 2, row: 2 });
  state = extendSelectionTo(state, { col: 4, row: 5 });

  state = moveActiveCell(state, { colDelta: -9, rowDelta: -9 });
  assert.deepEqual(state.activeCell, { col: 0, row: 0 });
  assert.deepEqual(state.selection, {
    anchor: { col: 0, row: 0 },
    focus: { col: 0, row: 0 },
  });

  state = moveActiveCell(state, { colDelta: 40, rowDelta: 120 });
  assert.deepEqual(state.activeCell, { col: 25, row: 99 });
});

test('extendSelectionTo keeps the original anchor and updates the focus cell', () => {
  let state = createInitialState();

  state = beginRangeSelection(state, { col: 1, row: 1 });
  state = extendSelectionTo(state, { col: 3, row: 4 });

  assert.deepEqual(state.activeCell, { col: 3, row: 4 });
  assert.deepEqual(state.selection, {
    anchor: { col: 1, row: 1 },
    focus: { col: 3, row: 4 },
  });
});

test('beginEditing preserves the current raw content and commitEdit updates the store and moves selection', () => {
  let state = createInitialState({
    cells: {
      [getCellKey({ col: 0, row: 0 })]: { raw: '12' },
    },
  });

  state = beginEditing(state);
  assert.equal(state.mode, 'editing');
  assert.equal(state.editing.originalValue, '12');
  assert.equal(state.editing.draft, '12');

  state = applyEditDraft(state, '=A1+1');
  state = commitEdit(state, { colDelta: 0, rowDelta: 1 });

  assert.equal(state.mode, 'navigation');
  assert.equal(state.cells.A1.raw, '=A1+1');
  assert.deepEqual(state.activeCell, { col: 0, row: 1 });
  assert.deepEqual(state.selection, {
    anchor: { col: 0, row: 1 },
    focus: { col: 0, row: 1 },
  });
});

test('cancelEdit restores the original value and leaves cell contents unchanged', () => {
  let state = createInitialState({
    activeCell: { col: 1, row: 2 },
    cells: {
      [getCellKey({ col: 1, row: 2 })]: { raw: 'keep me' },
    },
  });

  state = beginEditing(state);
  state = applyEditDraft(state, 'throw this away');
  state = cancelEdit(state);

  assert.equal(state.mode, 'navigation');
  assert.equal(state.cells.B3.raw, 'keep me');
  assert.equal(state.editing, null);
});
