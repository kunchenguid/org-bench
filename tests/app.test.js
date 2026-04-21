const assert = require('node:assert/strict');
const {
  createGridModel,
  createEmptyState,
  selectCell,
  commitCell,
  getCellRaw,
  moveSelection,
  getSelectionAfterCommit,
  copySelection,
  pasteSelection,
  evaluateCell,
  formatValue,
  createStorageAdapter,
  saveState,
  loadState,
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

test('creates a 26 by 100 grid model', () => {
  const grid = createGridModel();
  assert.equal(grid.columns.length, 26);
  assert.equal(grid.rows.length, 100);
  assert.equal(grid.columns[0], 'A');
  assert.equal(grid.columns[25], 'Z');
  assert.equal(grid.rows[0], 1);
  assert.equal(grid.rows[99], 100);
});

test('keeps exactly one active cell in state', () => {
  let state = createEmptyState();
  assert.deepEqual(state.selection, { row: 1, col: 1 });
  state = selectCell(state, 8, 4);
  assert.deepEqual(state.selection, { row: 8, col: 4 });
});

test('stores and returns raw cell contents', () => {
  let state = createEmptyState();
  state = commitCell(state, 2, 3, '=A1+7');
  assert.equal(getCellRaw(state, 2, 3), '=A1+7');
  assert.equal(getCellRaw(state, 1, 1), '');
});

test('moves selection with clamping at grid edges', () => {
  let state = createEmptyState();
  state = moveSelection(state, -1, -1);
  assert.deepEqual(state.selection, { row: 1, col: 1 });

  state = selectCell(state, 100, 26);
  state = moveSelection(state, 1, 1);
  assert.deepEqual(state.selection, { row: 100, col: 26 });
});

test('computes commit navigation for enter and tab', () => {
  assert.deepEqual(getSelectionAfterCommit({ row: 3, col: 4 }, 'Enter'), { row: 4, col: 4 });
  assert.deepEqual(getSelectionAfterCommit({ row: 3, col: 4 }, 'Tab'), { row: 3, col: 5 });
  assert.deepEqual(getSelectionAfterCommit({ row: 100, col: 26 }, 'Tab'), { row: 100, col: 26 });
});

test('evaluates arithmetic formulas with cell references', () => {
  let state = createEmptyState();
  state = commitCell(state, 1, 1, '12');
  state = commitCell(state, 2, 1, '5');
  state = commitCell(state, 3, 1, '=A1+A2*2');

  assert.equal(formatValue(evaluateCell(state, 3, 1).value), '22');
});

test('recomputes dependents after precedent changes', () => {
  let state = createEmptyState();
  state = commitCell(state, 1, 1, '2');
  state = commitCell(state, 1, 2, '=A1+3');
  assert.equal(formatValue(evaluateCell(state, 1, 2).value), '5');

  state = commitCell(state, 1, 1, '7');
  assert.equal(formatValue(evaluateCell(state, 1, 2).value), '10');
});

test('supports boolean comparison and if', () => {
  let state = createEmptyState();
  state = commitCell(state, 1, 1, '9');
  state = commitCell(state, 1, 2, '=IF(A1>=10,"big","small")');

  assert.equal(formatValue(evaluateCell(state, 1, 2).value), 'small');
});

test('supports range functions and boolean outputs reused by another formula', () => {
  let state = createEmptyState();
  state = commitCell(state, 1, 1, '1');
  state = commitCell(state, 1, 2, '2');
  state = commitCell(state, 2, 1, '3');
  state = commitCell(state, 2, 2, '4');
  state = commitCell(state, 1, 3, '=SUM(A1:B2)');
  state = commitCell(state, 1, 4, '=C1>9');
  state = commitCell(state, 1, 5, '=AND(D1,TRUE)');

  assert.equal(formatValue(evaluateCell(state, 1, 3).value), '10');
  assert.equal(formatValue(evaluateCell(state, 1, 4).value), 'TRUE');
  assert.equal(formatValue(evaluateCell(state, 1, 5).value), 'TRUE');
});

test('pasting a copied formula shifts relative refs and preserves absolute refs', () => {
  let state = createEmptyState();
  state = commitCell(state, 1, 1, '5');
  state = commitCell(state, 1, 2, '=A1+$A$1+A$1+$A1');

  const clipboard = copySelection(state, { row: 1, col: 2 }, { row: 1, col: 2 });
  state = pasteSelection(state, clipboard, { row: 2, col: 2 });

  assert.equal(getCellRaw(state, 2, 2), '=A2+$A$1+A$1+$A2');
  assert.equal(formatValue(evaluateCell(state, 2, 2).value), '10');
});

test('pasting a rectangular block writes cell-by-cell and shifts formulas from the source block', () => {
  let state = createEmptyState();
  state = commitCell(state, 1, 1, '1');
  state = commitCell(state, 1, 2, '2');
  state = commitCell(state, 2, 1, '3');
  state = commitCell(state, 2, 2, '=A1+B1');

  const clipboard = copySelection(state, { row: 1, col: 1 }, { row: 2, col: 2 });
  state = pasteSelection(state, clipboard, { row: 3, col: 3 });

  assert.equal(getCellRaw(state, 3, 3), '1');
  assert.equal(getCellRaw(state, 3, 4), '2');
  assert.equal(getCellRaw(state, 4, 3), '3');
  assert.equal(getCellRaw(state, 4, 4), '=C3+D3');
  assert.equal(formatValue(evaluateCell(state, 4, 4).value), '3');
});

test('detects circular references', () => {
  let state = createEmptyState();
  state = commitCell(state, 1, 1, '=B1');
  state = commitCell(state, 1, 2, '=A1');

  assert.equal(formatValue(evaluateCell(state, 1, 1).value), '#CIRC!');
});

test('persists namespaced raw contents and selection', () => {
  const backing = new Map();
  const storage = createStorageAdapter({
    getItem(key) {
      return backing.has(key) ? backing.get(key) : null;
    },
    setItem(key, value) {
      backing.set(key, value);
    },
  }, 'bench-2');

  let state = createEmptyState();
  state = commitCell(state, 4, 2, '=1+1');
  state = selectCell(state, 4, 2);
  saveState(storage, state);

  const restored = loadState(storage);
  assert.equal(getCellRaw(restored, 4, 2), '=1+1');
  assert.deepEqual(restored.selection, { row: 4, col: 2 });
  assert.ok(backing.has('bench-2:spreadsheet-state'));
});
