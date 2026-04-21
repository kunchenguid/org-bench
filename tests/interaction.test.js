const assert = require('node:assert/strict');

const {
  createInitialState,
  getCellContent,
  commitEdit,
  cancelEdit,
  moveSelection,
  beginEdit,
  inputText,
} = require('../app.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('typing on a selected cell replaces its contents and enters edit mode', () => {
  let state = createInitialState();
  state = inputText(state, '7');

  assert.equal(state.editing.source, 'cell');
  assert.equal(state.editing.draft, '7');
  assert.equal(getCellContent(state, 0, 0), '');
});

test('enter commits and moves selection down', () => {
  let state = createInitialState();
  state = inputText(state, '42');
  state = commitEdit(state, 'down');

  assert.equal(getCellContent(state, 0, 0), '42');
  assert.deepEqual(state.selection.active, { row: 1, column: 0 });
  assert.equal(state.editing, null);
});

test('tab commits and moves selection right', () => {
  let state = createInitialState();
  state = inputText(state, 'hello');
  state = commitEdit(state, 'right');

  assert.equal(getCellContent(state, 0, 0), 'hello');
  assert.deepEqual(state.selection.active, { row: 0, column: 1 });
});

test('escape restores the original content', () => {
  let state = createInitialState({ cells: { A1: 'seed' } });
  state = beginEdit(state, 'cell');
  state = inputText(state, 'changed');
  state = cancelEdit(state);

  assert.equal(getCellContent(state, 0, 0), 'seed');
  assert.equal(state.editing, null);
});

test('f2 style edit preserves current contents in the draft', () => {
  let state = createInitialState({ cells: { A1: '=A1+A2' } });
  state = beginEdit(state, 'cell');

  assert.equal(state.editing.source, 'cell');
  assert.equal(state.editing.draft, '=A1+A2');
});

test('formula bar editing uses the raw selected-cell contents', () => {
  let state = createInitialState({
    cells: { B2: '=A1+A2' },
    selection: {
      anchor: { row: 1, column: 1 },
      focus: { row: 1, column: 1 },
      minRow: 1,
      maxRow: 1,
      minColumn: 1,
      maxColumn: 1,
      active: { row: 1, column: 1 },
    },
  });
  state = beginEdit(state, 'formula');

  assert.equal(state.editing.source, 'formula');
  assert.equal(state.editing.draft, '=A1+A2');

  state = inputText(state, '=A1+A3');
  state = commitEdit(state, 'stay');
  assert.equal(getCellContent(state, 1, 1), '=A1+A3');
});

test('arrow navigation clamps at the sheet edges', () => {
  let state = createInitialState();
  state = moveSelection(state, 'left');
  state = moveSelection(state, 'up');

  assert.deepEqual(state.selection.active, { row: 0, column: 0 });

  state = createInitialState({
    selection: {
      anchor: { row: 99, column: 25 },
      focus: { row: 99, column: 25 },
      minRow: 99,
      maxRow: 99,
      minColumn: 25,
      maxColumn: 25,
      active: { row: 99, column: 25 },
    },
  });
  state = moveSelection(state, 'right');
  state = moveSelection(state, 'down');

  assert.deepEqual(state.selection.active, { row: 99, column: 25 });
});
