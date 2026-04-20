const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEmptyState,
  beginEditingState,
  commitEditingState,
  cancelEditingState,
} = require('../app.js');

test('beginEditingState preserves the current raw value for F2, Enter, double click, and formula edits', () => {
  const state = createEmptyState();
  state.selection = 'B2';
  state.cells.B2 = '=SUM(A1:A3)';

  const next = beginEditingState(state, 'cell');

  assert.equal(next.editing, 'cell');
  assert.equal(next.draft, '=SUM(A1:A3)');
  assert.equal(state.cells.B2, '=SUM(A1:A3)');
});

test('beginEditingState replaces existing contents when typing starts from selection mode', () => {
  const state = createEmptyState();
  state.selection = 'C3';
  state.cells.C3 = 'existing';

  const next = beginEditingState(state, 'cell', '9');

  assert.equal(next.editing, 'cell');
  assert.equal(next.draft, '9');
});

test('commitEditingState stores the draft and moves selection for Enter and Tab semantics', () => {
  const state = createEmptyState();
  state.selection = 'A1';
  state.editing = 'formula';
  state.draft = '=A2+5';

  const down = commitEditingState(state, 0, 1);
  assert.equal(down.cells.A1, '=A2+5');
  assert.equal(down.selection, 'A2');
  assert.equal(down.editing, null);

  down.editing = 'cell';
  down.draft = '42';
  const right = commitEditingState(down, 1, 0);
  assert.equal(right.cells.A2, '42');
  assert.equal(right.selection, 'B2');
  assert.equal(right.editing, null);
});

test('cancelEditingState exits edit mode without mutating committed cell contents', () => {
  const state = createEmptyState();
  state.selection = 'D4';
  state.cells.D4 = 'stable';
  state.editing = 'cell';
  state.draft = 'temporary';

  const next = cancelEditingState(state);

  assert.equal(next.editing, null);
  assert.equal(next.cells.D4, 'stable');
  assert.equal(next.draft, 'stable');
  assert.equal(next.selection, 'D4');
});
