const assert = require('node:assert/strict');
const {
  createInitialState,
  beginCellEdit,
  applyEditDraft,
  commitActiveEdit,
  cancelActiveEdit,
  moveActiveCell,
  selectCell,
} = require('../app.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('typing replaces the selected cell draft and enter commits downward', () => {
  let state = createInitialState();
  state = beginCellEdit(state, '7', false);
  assert.equal(state.editing.draft, '7');

  state = commitActiveEdit(state, 'down');
  assert.equal(state.cells.A1, '7');
  assert.deepEqual(state.selection.active, { row: 1, column: 0 });
});

test('f2 style editing preserves current cell contents and escape cancels it', () => {
  let state = createInitialState({ cells: { A1: '=A2' } });
  state = beginCellEdit(state, null, true);
  assert.equal(state.editing.draft, '=A2');

  state = applyEditDraft(state, '=A3');
  state = cancelActiveEdit(state);
  assert.equal(state.cells.A1, '=A2');
  assert.equal(state.editing, null);
});

test('formula bar edits the active cell raw contents and tab commits right', () => {
  let state = createInitialState({
    cells: { B2: '=A1+A2' },
    selection: selectCell(createInitialState().selection, { row: 1, column: 1 }),
  });

  state = beginCellEdit(state, null, true, 'formula');
  state = applyEditDraft(state, '=A1+A3');
  state = commitActiveEdit(state, 'right');

  assert.equal(state.cells.B2, '=A1+A3');
  assert.deepEqual(state.selection.active, { row: 1, column: 2 });
});

test('arrow navigation clamps at the sheet edges when not editing', () => {
  let state = createInitialState();
  state = moveActiveCell(state, { row: -1, column: -1 });
  assert.deepEqual(state.selection.active, { row: 0, column: 0 });

  state = createInitialState({
    selection: selectCell(createInitialState().selection, { row: 99, column: 25 }),
  });
  state = moveActiveCell(state, { row: 1, column: 1 });
  assert.deepEqual(state.selection.active, { row: 99, column: 25 });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
