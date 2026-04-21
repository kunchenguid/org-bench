const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetStore,
  createMemoryStorage,
} = require('../src/spreadsheet-store.js');
const FormulaEngine = require('../formula-engine.js');
const MutationEngine = require('../src/mutations.js');

test('stores raw cell contents and active selection state', () => {
  const storage = createMemoryStorage();
  const store = createSpreadsheetStore({
    namespace: 'run-123',
    storage,
  });

  store.setCell('A1', '=1+2');
  store.setActiveCell({ row: 2, col: 1 });
  store.setSelection({
    anchor: { row: 2, col: 1 },
    focus: { row: 4, col: 3 },
  });

  assert.equal(store.getRawCell('A1'), '=1+2');
  assert.deepEqual(store.getSnapshot().activeCell, { row: 2, col: 1 });
  assert.deepEqual(store.getSnapshot().selection, {
    anchor: { row: 2, col: 1 },
    focus: { row: 4, col: 3 },
  });
});

test('undo and redo restore a grouped multi-cell action', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-undo',
    storage: createMemoryStorage(),
  });

  store.applyCells(
    {
      A1: '10',
      A2: '20',
      B1: '=A1+A2',
    },
    { label: 'paste' }
  );

  assert.equal(store.getRawCell('B1'), '=A1+A2');
  assert.equal(store.canUndo(), true);

  store.undo();

  assert.equal(store.getRawCell('A1'), '');
  assert.equal(store.getRawCell('A2'), '');
  assert.equal(store.getRawCell('B1'), '');
  assert.equal(store.canRedo(), true);

  store.redo();

  assert.equal(store.getRawCell('A1'), '10');
  assert.equal(store.getRawCell('A2'), '20');
  assert.equal(store.getRawCell('B1'), '=A1+A2');
});

test('computed cache updates do not create history entries', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-computed',
    storage: createMemoryStorage(),
  });

  store.setCell('A1', '4');
  const undoDepthBefore = store.getSnapshot().history.undo.length;

  store.replaceComputed({
    A1: { kind: 'number', value: 4 },
    B1: { kind: 'number', value: 8 },
  });

  assert.deepEqual(store.getComputedCell('B1'), { kind: 'number', value: 8 });
  assert.equal(store.getSnapshot().history.undo.length, undoDepthBefore);
});

test('restores persisted state from namespace-prefixed storage key', () => {
  const storage = createMemoryStorage();
  const first = createSpreadsheetStore({
    namespace: 'run-persist',
    storage,
  });

  first.setCell('C3', 'hello');
  first.setActiveCell({ row: 3, col: 2 });
  first.setSelection({
    anchor: { row: 3, col: 2 },
    focus: { row: 3, col: 2 },
  });

  const second = createSpreadsheetStore({
    namespace: 'run-persist',
    storage,
  });

  assert.equal(storage.dump()['run-persist:spreadsheet-state'] !== undefined, true);
  assert.equal(second.getRawCell('C3'), 'hello');
  assert.deepEqual(second.getSnapshot().activeCell, { row: 3, col: 2 });
  assert.deepEqual(second.getSnapshot().selection, {
    anchor: { row: 3, col: 2 },
    focus: { row: 3, col: 2 },
  });
});

test('clearing cells removes raw contents and keeps empty reads stable', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-clear',
    storage: createMemoryStorage(),
  });

  store.applyCells({ A1: '1', A2: '2' }, { label: 'seed' });
  store.clearCells(['A1', 'A2']);

  assert.equal(store.getRawCell('A1'), '');
  assert.equal(store.getRawCell('A2'), '');
  assert.deepEqual([...store.getSnapshot().cells.keys()], []);
});

test('structural row insertion rewrites raw cells, recomputes formulas, and undoes as one action', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-structural-insert',
    storage: createMemoryStorage(),
    formulaEngine: FormulaEngine,
    mutationEngine: MutationEngine,
  });

  store.applyCells(
    {
      A1: '10',
      A2: '20',
      B2: '=SUM(A1:A2)',
    },
    { label: 'seed' }
  );

  const changed = store.applyStructuralChange(
    { kind: 'insert-rows', index: 2, count: 1 },
    { label: 'insert row' }
  );

  assert.equal(changed, true);
  assert.equal(store.getRawCell('A2'), '');
  assert.equal(store.getRawCell('A3'), '20');
  assert.equal(store.getRawCell('B3'), '=SUM(A1:A3)');
  assert.equal(store.getComputedCell('B3').display, '30');

  store.undo();

  assert.equal(store.getRawCell('A2'), '20');
  assert.equal(store.getRawCell('A3'), '');
  assert.equal(store.getRawCell('B2'), '=SUM(A1:A2)');
  assert.equal(store.getComputedCell('B2').display, '30');
});

test('structural column deletion propagates #REF! through the computed layer', () => {
  const store = createSpreadsheetStore({
    namespace: 'run-structural-delete',
    storage: createMemoryStorage(),
    formulaEngine: FormulaEngine,
    mutationEngine: MutationEngine,
  });

  store.applyCells(
    {
      A1: '1',
      B1: '2',
      C1: '=A1+B1',
    },
    { label: 'seed' }
  );

  store.applyStructuralChange(
    { kind: 'delete-columns', index: 2, count: 1 },
    { label: 'delete column' }
  );

  assert.equal(store.getRawCell('B1'), '=A1+#REF!');
  assert.equal(store.getComputedCell('B1').display, '#REF!');
});
