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

  assert.equal(state.editing.mode, 'cell');
  assert.equal(state.editing.draft, '7');
  assert.equal(getCellContent(state, 0, 0), '');
});

test('enter commits and moves selection down', () => {
  let state = createInitialState();
  state = inputText(state, '42');
  state = commitEdit(state, 'down');

  assert.equal(getCellContent(state, 0, 0), '42');
  assert.deepEqual(state.active, { row: 1, col: 0 });
  assert.equal(state.editing, null);
});

test('tab commits and moves selection right', () => {
  let state = createInitialState();
  state = inputText(state, 'hello');
  state = commitEdit(state, 'right');

  assert.equal(getCellContent(state, 0, 0), 'hello');
  assert.deepEqual(state.active, { row: 0, col: 1 });
});

test('escape restores the original content', () => {
  let state = createInitialState({ cells: { '0,0': 'seed' } });
  state = beginEdit(state, 'cell');
  state = inputText(state, 'changed');
  state = cancelEdit(state);

  assert.equal(getCellContent(state, 0, 0), 'seed');
  assert.equal(state.editing, null);
});

test('f2 style edit preserves current contents in the draft', () => {
  let state = createInitialState({ cells: { '0,0': '=A1+A2' } });
  state = beginEdit(state, 'cell');

  assert.equal(state.editing.mode, 'cell');
  assert.equal(state.editing.draft, '=A1+A2');
});

test('formula bar editing uses the raw selected-cell contents', () => {
  let state = createInitialState({ cells: { '1,1': '=A1+A2' }, active: { row: 1, col: 1 } });
  state = beginEdit(state, 'formula');

  assert.equal(state.editing.mode, 'formula');
  assert.equal(state.editing.draft, '=A1+A2');

  state = inputText(state, '=A1+A3');
  state = commitEdit(state, 'stay');
  assert.equal(getCellContent(state, 1, 1), '=A1+A3');
});

test('arrow navigation clamps at the sheet edges', () => {
  let state = createInitialState();
  state = moveSelection(state, 'left');
  state = moveSelection(state, 'up');

  assert.deepEqual(state.active, { row: 0, col: 0 });

  state = createInitialState({ active: { row: 99, col: 25 } });
  state = moveSelection(state, 'right');
  state = moveSelection(state, 'down');

  assert.deepEqual(state.active, { row: 99, col: 25 });
});
