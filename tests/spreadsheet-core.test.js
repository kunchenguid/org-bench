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
  getCellDisplayValue,
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

test('display values parse numbers and preserve literal text', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '42');
  state = setCellRaw(state, 0, 1, 'hello');

  assert.equal(getCellDisplayValue(state, 0, 0), '42');
  assert.equal(getCellDisplayValue(state, 0, 1), 'hello');
});

test('formula display values evaluate arithmetic with precedence', () => {
  const state = setCellRaw(createState(), 0, 0, '=1+2*3');

  assert.equal(getCellDisplayValue(state, 0, 0), '7');
});

test('formula display values resolve cell references and recompute from precedents', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '10');
  state = setCellRaw(state, 1, 0, '5');
  state = setCellRaw(state, 2, 0, '=A1+A2');

  assert.equal(getCellDisplayValue(state, 2, 0), '15');

  state = setCellRaw(state, 1, 0, '9');
  assert.equal(getCellDisplayValue(state, 2, 0), '19');
});

test('formula display values aggregate rectangular ranges in core functions', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '2');
  state = setCellRaw(state, 1, 0, '4');
  state = setCellRaw(state, 2, 0, '6');
  state = setCellRaw(state, 3, 0, '=SUM(A1:A3)');
  state = setCellRaw(state, 4, 0, '=AVERAGE(A1:A3)');
  state = setCellRaw(state, 5, 0, '=MIN(A1:A3)');
  state = setCellRaw(state, 6, 0, '=MAX(A1:A3)');
  state = setCellRaw(state, 7, 0, '=COUNT(A1:A3)');

  assert.equal(getCellDisplayValue(state, 3, 0), '12');
  assert.equal(getCellDisplayValue(state, 4, 0), '4');
  assert.equal(getCellDisplayValue(state, 5, 0), '2');
  assert.equal(getCellDisplayValue(state, 6, 0), '6');
  assert.equal(getCellDisplayValue(state, 7, 0), '3');
});

test('circular references surface a clear error marker', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '=B1');
  state = setCellRaw(state, 0, 1, '=A1');

  assert.equal(getCellDisplayValue(state, 0, 0), '#CIRC!');
  assert.equal(getCellDisplayValue(state, 0, 1), '#CIRC!');
});

test('formula display values support comparisons and boolean literals', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '2');
  state = setCellRaw(state, 1, 0, '5');
  state = setCellRaw(state, 2, 0, '=A1<A2');
  state = setCellRaw(state, 3, 0, '=A2<>A1');
  state = setCellRaw(state, 4, 0, '=TRUE');
  state = setCellRaw(state, 5, 0, '=FALSE');

  assert.equal(getCellDisplayValue(state, 2, 0), 'TRUE');
  assert.equal(getCellDisplayValue(state, 3, 0), 'TRUE');
  assert.equal(getCellDisplayValue(state, 4, 0), 'TRUE');
  assert.equal(getCellDisplayValue(state, 5, 0), 'FALSE');
});

test('formula display values support concatenation and conditional functions', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '2');
  state = setCellRaw(state, 1, 0, '3');
  state = setCellRaw(state, 2, 0, 'done');
  state = setCellRaw(state, 3, 0, 'pending');
  state = setCellRaw(state, 4, 0, '="Total: "&SUM(A1:A2)');
  state = setCellRaw(state, 5, 0, '=IF(A1<A2,A3,A4)');
  state = setCellRaw(state, 6, 0, '=CONCAT(A3,"/",A4)');

  assert.equal(getCellDisplayValue(state, 4, 0), 'Total: 5');
  assert.equal(getCellDisplayValue(state, 5, 0), 'done');
  assert.equal(getCellDisplayValue(state, 6, 0), 'done/pending');
});

test('formula display values support boolean helper functions', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '3');
  state = setCellRaw(state, 1, 0, '=AND(TRUE,A1>0)');
  state = setCellRaw(state, 2, 0, '=OR(FALSE,A1<0,A1=3)');
  state = setCellRaw(state, 3, 0, '=NOT(A1<0)');

  assert.equal(getCellDisplayValue(state, 1, 0), 'TRUE');
  assert.equal(getCellDisplayValue(state, 2, 0), 'TRUE');
  assert.equal(getCellDisplayValue(state, 3, 0), 'TRUE');
});

test('formula display values support ABS and ROUND', () => {
  let state = createState();
  state = setCellRaw(state, 0, 0, '=ABS(-3)');
  state = setCellRaw(state, 1, 0, '=ROUND(3.6)');

  assert.equal(getCellDisplayValue(state, 0, 0), '3');
  assert.equal(getCellDisplayValue(state, 1, 0), '4');
});
