const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSheetState,
  setCellRaw,
  evaluateCell,
  moveSelection,
  serializeState,
  hydrateState,
} = require('../emma-sheet-core.js');

test('stores raw cell values without changing selection', () => {
  const state = createSheetState();
  const next = setCellRaw(state, 'A1', '42');

  assert.equal(next.cells.A1, '42');
  assert.deepEqual(next.selection, { row: 1, col: 1 });
});

test('evaluates arithmetic formulas with cell references', () => {
  let state = createSheetState();
  state = setCellRaw(state, 'A1', '2');
  state = setCellRaw(state, 'A2', '3');
  state = setCellRaw(state, 'B1', '=A1+A2*4');

  assert.equal(evaluateCell(state, 'B1').display, '14');
});

test('evaluates SUM over a row range', () => {
  let state = createSheetState();
  state = setCellRaw(state, 'A1', '5');
  state = setCellRaw(state, 'B1', '7');
  state = setCellRaw(state, 'C1', '=SUM(A1:B1)');

  assert.equal(evaluateCell(state, 'C1').display, '12');
});

test('marks circular references clearly', () => {
  let state = createSheetState();
  state = setCellRaw(state, 'A1', '=B1');
  state = setCellRaw(state, 'B1', '=A1');

  assert.equal(evaluateCell(state, 'A1').display, '#CIRC!');
});

test('clamps selection moves at sheet edges', () => {
  const state = createSheetState({ selection: { row: 1, col: 1 } });
  const next = moveSelection(state, -1, -1);

  assert.deepEqual(next.selection, { row: 1, col: 1 });
});

test('round-trips persisted sheet state', () => {
  let state = createSheetState();
  state = setCellRaw(state, 'C3', '=SUM(A1:B1)');
  const serialized = serializeState(state);
  const hydrated = hydrateState(serialized);

  assert.equal(hydrated.cells.C3, '=SUM(A1:B1)');
  assert.deepEqual(hydrated.selection, { row: 1, col: 1 });
});
