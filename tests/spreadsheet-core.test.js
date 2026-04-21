const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COL_COUNT,
  ROW_COUNT,
  columnLabel,
  createState,
  moveSelection,
  setCellRaw,
  getCellRaw,
  serializeState,
  deserializeState,
  getStorageNamespace,
  getStorageKey,
} = require('../spreadsheet-core.js');

test('creates the expected 26 by 100 spreadsheet state', () => {
  const state = createState();

  assert.equal(COL_COUNT, 26);
  assert.equal(ROW_COUNT, 100);
  assert.deepEqual(state.active, { row: 0, col: 0 });
  assert.deepEqual(state.cells, {});
});

test('column labels map zero-based indexes to spreadsheet letters', () => {
  assert.equal(columnLabel(0), 'A');
  assert.equal(columnLabel(25), 'Z');
});

test('selection movement clamps to the sheet edges', () => {
  const state = createState();

  let next = moveSelection(state, { row: -1, col: -1 });
  assert.deepEqual(next.active, { row: 0, col: 0 });

  next = moveSelection(state, { row: 150, col: 50 });
  assert.deepEqual(next.active, { row: 99, col: 25 });
});

test('raw cell contents round-trip through serialization', () => {
  const state = createState();
  const withCell = setCellRaw(state, 1, 2, '=A1+3');
  const restored = deserializeState(serializeState(withCell));

  assert.equal(getCellRaw(restored, 1, 2), '=A1+3');
  assert.deepEqual(restored.active, { row: 0, col: 0 });
});

test('namespace resolution prefers injected benchmark namespace', () => {
  assert.equal(
    getStorageNamespace({ __BENCHMARK_STORAGE_NAMESPACE__: 'run-123' }),
    'run-123'
  );
  assert.equal(getStorageNamespace({ BENCHMARK_STORAGE_NAMESPACE: 'fallback' }), 'fallback');
  assert.equal(getStorageNamespace({}), 'spreadsheet');
  assert.equal(getStorageKey('run-123'), 'run-123:spreadsheet-state');
});
