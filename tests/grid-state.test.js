const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  createInitialState,
  moveSelection,
  extendSelection,
  beginEdit,
  updateDraft,
  commitEdit,
  cancelEdit,
} = require('../src/grid-state.js');

test('creates a 26x100 grid state with A1 selected', () => {
  const state = createInitialState();

  assert.equal(state.grid.rows, 100);
  assert.equal(state.grid.cols, 26);
  assert.deepEqual(state.selection.anchor, { row: 0, col: 0 });
  assert.deepEqual(state.selection.focus, { row: 0, col: 0 });
  assert.equal(state.mode, 'nav');
});

test('moves selection within bounds and clamps at edges', () => {
  const state = createInitialState();

  moveSelection(state, 3, 4);
  assert.deepEqual(state.selection.focus, { row: 3, col: 4 });
  assert.deepEqual(state.selection.anchor, { row: 3, col: 4 });

  moveSelection(state, 999, 999);
  assert.deepEqual(state.selection.focus, { row: 99, col: 25 });

  moveSelection(state, -999, -999);
  assert.deepEqual(state.selection.focus, { row: 0, col: 0 });
});

test('extends a range selection without losing the active anchor', () => {
  const state = createInitialState();

  moveSelection(state, 2, 2);
  extendSelection(state, 5, 7);

  assert.deepEqual(state.selection.anchor, { row: 2, col: 2 });
  assert.deepEqual(state.selection.focus, { row: 5, col: 7 });
});

test('edit lifecycle preserves and commits raw contents', () => {
  const state = createInitialState();

  beginEdit(state, 'cell');
  assert.equal(state.mode, 'edit');
  assert.equal(state.editor.source, 'cell');
  assert.equal(state.editor.draft, '');

  updateDraft(state, '=A1+A2');
  commitEdit(state);

  assert.equal(state.mode, 'nav');
  assert.equal(state.cells['0:0'], '=A1+A2');
});

test('canceling an edit restores the previous draft and cell contents', () => {
  const state = createInitialState({ cells: { '0:0': '123' } });

  beginEdit(state, 'formula');
  updateDraft(state, '456');
  cancelEdit(state);

  assert.equal(state.mode, 'nav');
  assert.equal(state.cells['0:0'], '123');
  assert.equal(state.editor, null);
});

test('publishes grid state helpers for a plain browser script tag', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/grid-state.js'), 'utf8');
  const sandbox = { window: {} };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.equal(typeof sandbox.window.oracleSheetState.createInitialState, 'function');
  assert.equal(typeof sandbox.window.oracleSheetState.moveSelection, 'function');
});
