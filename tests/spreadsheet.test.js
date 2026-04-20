const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEmptyState,
  evaluateAllCells,
  moveSelection,
  createStorage,
  defaultNamespace,
} = require('../app.js');

test('evaluates arithmetic formulas and cell references', () => {
  const state = createEmptyState();
  state.cells.A1 = '4';
  state.cells.A2 = '6';
  state.cells.B1 = '=A1+A2*2';

  const evaluated = evaluateAllCells(state.cells);

  assert.equal(evaluated.B1.display, '16');
});

test('evaluates ranges through aggregate functions', () => {
  const state = createEmptyState();
  state.cells.A1 = '1';
  state.cells.A2 = '2';
  state.cells.A3 = '3';
  state.cells.B1 = '=SUM(A1:A3)';
  state.cells.B2 = '=AVERAGE(A1:A3)';
  state.cells.B3 = '=COUNT(A1:A3)';

  const evaluated = evaluateAllCells(state.cells);

  assert.equal(evaluated.B1.display, '6');
  assert.equal(evaluated.B2.display, '2');
  assert.equal(evaluated.B3.display, '3');
});

test('returns explicit spreadsheet errors', () => {
  const state = createEmptyState();
  state.cells.A1 = '=1/0';
  state.cells.A2 = '=BOGUS(1)';
  state.cells.A3 = '=A3';

  const evaluated = evaluateAllCells(state.cells);

  assert.equal(evaluated.A1.display, '#DIV/0!');
  assert.equal(evaluated.A2.display, '#ERR!');
  assert.equal(evaluated.A3.display, '#CIRC!');
});

test('moves selection within grid bounds', () => {
  assert.equal(moveSelection('A1', 'left'), 'A1');
  assert.equal(moveSelection('A1', 'up'), 'A1');
  assert.equal(moveSelection('A1', 'right'), 'B1');
  assert.equal(moveSelection('Z100', 'down'), 'Z100');
});

test('persists with namespaced keys', () => {
  const backingStore = new Map();
  const localStorage = {
    getItem(key) {
      return backingStore.has(key) ? backingStore.get(key) : null;
    },
    setItem(key, value) {
      backingStore.set(key, value);
    },
  };

  const storage = createStorage(localStorage, 'bench-1');
  const state = createEmptyState();
  state.selection = 'C7';
  state.cells.C7 = '=SUM(A1:A3)';
  storage.save(state);

  assert.equal(backingStore.has('bench-1:spreadsheet-state'), true);
  assert.deepEqual(storage.load(), state);
  assert.equal(defaultNamespace(''), 'spreadsheet');
});
