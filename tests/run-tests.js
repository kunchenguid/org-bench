const assert = require('node:assert/strict');

const {
  createSheetState,
  cellKey,
  moveSelection,
  commitCellInput,
  getCellDisplay,
} = require('../src/core.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack);
    process.exitCode = 1;
  }
}

test('createSheetState initializes 26 by 100 grid metadata and A1 selection', () => {
  const state = createSheetState();
  assert.equal(state.rowCount, 100);
  assert.equal(state.columnCount, 26);
  assert.deepEqual(state.selection, { row: 0, column: 0 });
  assert.equal(cellKey(0, 0), 'A1');
  assert.equal(cellKey(99, 25), 'Z100');
});

test('moveSelection clamps at the sheet edges', () => {
  const state = createSheetState();
  state.selection = { row: 0, column: 0 };

  moveSelection(state, -1, -1);
  assert.deepEqual(state.selection, { row: 0, column: 0 });

  moveSelection(state, 300, 300);
  assert.deepEqual(state.selection, { row: 99, column: 25 });
});

test('commitCellInput stores raw values and treats numeric text as numbers for display', () => {
  const state = createSheetState();

  commitCellInput(state, 0, 0, '42');
  commitCellInput(state, 1, 0, 'hello');

  assert.equal(state.cells.A1.raw, '42');
  assert.equal(getCellDisplay(state, 0, 0), '42');
  assert.equal(state.cells.A2.raw, 'hello');
  assert.equal(getCellDisplay(state, 1, 0), 'hello');
});

test('commitCellInput keeps formulas raw and shows an unevaluated placeholder for now', () => {
  const state = createSheetState();

  commitCellInput(state, 0, 1, '=A1+A2');

  assert.equal(state.cells.B1.raw, '=A1+A2');
  assert.equal(getCellDisplay(state, 0, 1), '=A1+A2');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
