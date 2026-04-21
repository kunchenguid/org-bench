const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GRID_COLUMNS,
  GRID_ROWS,
  clampPosition,
  movePosition,
  cellKey,
  columnLabel,
  commitMove,
  initialEditValue,
  isPrintableKey,
  storageKey,
} = require('../core.js');

test('grid constants match brief minimums', () => {
  assert.equal(GRID_COLUMNS, 26);
  assert.equal(GRID_ROWS, 100);
});

test('clampPosition keeps selection inside the grid', () => {
  assert.deepEqual(clampPosition({ col: -4, row: 999 }), { col: 0, row: 99 });
  assert.deepEqual(clampPosition({ col: 12, row: 7 }), { col: 12, row: 7 });
});

test('movePosition applies deltas then clamps to edges', () => {
  assert.deepEqual(movePosition({ col: 0, row: 0 }, -1, -1), { col: 0, row: 0 });
  assert.deepEqual(movePosition({ col: 25, row: 99 }, 1, 1), { col: 25, row: 99 });
  assert.deepEqual(movePosition({ col: 3, row: 4 }, 2, 3), { col: 5, row: 7 });
});

test('cellKey uses spreadsheet-style addresses', () => {
  assert.equal(cellKey({ col: 0, row: 0 }), 'A1');
  assert.equal(cellKey({ col: 25, row: 99 }), 'Z100');
});

test('columnLabel supports the visible brief range', () => {
  assert.equal(columnLabel(0), 'A');
  assert.equal(columnLabel(25), 'Z');
});

test('storageKey prefixes persisted data with the run namespace', () => {
  assert.equal(storageKey('google-run:', 'sheet-state'), 'google-run:sheet-state');
  assert.equal(storageKey('', 'sheet-state'), 'sheet-state');
});

test('isPrintableKey accepts text entry keys and rejects control keys', () => {
  assert.equal(isPrintableKey('a'), true);
  assert.equal(isPrintableKey('='), true);
  assert.equal(isPrintableKey('Enter'), false);
  assert.equal(isPrintableKey('ArrowRight'), false);
});

test('initialEditValue preserves existing content or replaces it', () => {
  assert.equal(initialEditValue('hello', true, ''), 'hello');
  assert.equal(initialEditValue('hello', false, 'x'), 'x');
});

test('commitMove follows spreadsheet enter and tab behavior', () => {
  assert.deepEqual(commitMove({ col: 2, row: 2 }, 'Enter'), { col: 2, row: 3 });
  assert.deepEqual(commitMove({ col: 2, row: 2 }, 'Tab'), { col: 3, row: 2 });
  assert.deepEqual(commitMove({ col: 25, row: 99 }, 'Tab'), { col: 25, row: 99 });
});
