const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWorkbookStore,
  coordsToCellId,
} = require('./workbook-store.js');

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test('commits cells, tracks selection, and persists raw contents', () => {
  const storage = createMemoryStorage();
  const store = createWorkbookStore({ namespace: 'apple-run', storage });

  store.selectCell(2, 3);
  store.commitCell(2, 3, '=A1+A2');

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.selection.activeCellId, 'C2');
  assert.equal(snapshot.cells.C2.raw, '=A1+A2');

  const restored = createWorkbookStore({ namespace: 'apple-run', storage });
  assert.equal(restored.getSnapshot().cells.C2.raw, '=A1+A2');
  assert.equal(restored.getSnapshot().selection.activeCellId, 'C2');
});

test('supports rectangular range selection and clear as one undoable action', () => {
  const store = createWorkbookStore({ namespace: 'apple-run', storage: createMemoryStorage() });

  store.commitCell(1, 1, '10');
  store.commitCell(1, 2, '20');
  store.commitCell(2, 1, '30');
  store.commitCell(2, 2, '40');
  store.selectRange({ row: 1, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 2 });
  store.clearSelection();

  const cleared = store.getSnapshot();
  assert.deepEqual(Object.keys(cleared.cells), []);

  store.undo();
  const restored = store.getSnapshot();
  assert.equal(restored.cells.A1.raw, '10');
  assert.equal(restored.cells.B1.raw, '20');
  assert.equal(restored.cells.A2.raw, '30');
  assert.equal(restored.cells.B2.raw, '40');
});

test('pastes a block and records the action for redo', () => {
  const store = createWorkbookStore({ namespace: 'apple-run', storage: createMemoryStorage() });

  store.pasteBlock(3, 2, [
    ['1', '2'],
    ['=B1', 'hello'],
  ]);

  assert.equal(store.getCell('B3').raw, '1');
  assert.equal(store.getCell('C3').raw, '2');
  assert.equal(store.getCell('B4').raw, '=B1');
  assert.equal(store.getCell('C4').raw, 'hello');

  store.undo();
  assert.equal(store.getCell('B3'), null);

  store.redo();
  assert.equal(store.getCell('C4').raw, 'hello');
});

test('cuts a rectangular range and restores both source and destination with undo', () => {
  const store = createWorkbookStore({ namespace: 'apple-run', storage: createMemoryStorage() });

  store.commitCell(1, 1, 'A');
  store.commitCell(1, 2, 'B');
  store.commitCell(2, 1, 'C');
  store.commitCell(2, 2, 'D');

  store.cutSelection({ start: { row: 1, col: 1 }, end: { row: 2, col: 2 } }, { row: 4, col: 3 });

  assert.equal(store.getCell('A1'), null);
  assert.equal(store.getCell('C4').raw, 'A');
  assert.equal(store.getCell('D5').raw, 'D');

  store.undo();
  assert.equal(store.getCell('A1').raw, 'A');
  assert.equal(store.getCell('B2').raw, 'D');
  assert.equal(store.getCell('C4'), null);
});

test('inserts and deletes rows while preserving undo history boundaries', () => {
  const store = createWorkbookStore({ namespace: 'apple-run', storage: createMemoryStorage() });

  store.commitCell(1, 1, 'top');
  store.commitCell(2, 1, 'middle');
  store.commitCell(3, 1, 'bottom');

  store.insertRows(2, 1);
  assert.equal(store.getCell(coordsToCellId(1, 1)).raw, 'top');
  assert.equal(store.getCell(coordsToCellId(3, 1)).raw, 'middle');
  assert.equal(store.getCell(coordsToCellId(4, 1)).raw, 'bottom');

  store.deleteRows(3, 1);
  assert.equal(store.getCell(coordsToCellId(3, 1)).raw, 'bottom');

  store.undo();
  assert.equal(store.getCell(coordsToCellId(3, 1)).raw, 'middle');
  store.undo();
  assert.equal(store.getCell(coordsToCellId(2, 1)).raw, 'middle');
});

test('rewrites formulas when rows and columns are structurally edited', () => {
  const store = createWorkbookStore({ namespace: 'apple-run', storage: createMemoryStorage() });

  store.commitCell(1, 1, '10');
  store.commitCell(2, 1, '20');
  store.commitCell(2, 2, '=SUM(A1:A2)');
  store.commitCell(1, 3, '=B2');

  store.insertRows(2, 1);
  assert.equal(store.getCell('B3').raw, '=SUM(A1:A3)');
  assert.equal(store.getCell('C1').raw, '=B3');

  store.deleteColumns(1, 1);
  assert.equal(store.getCell('A3').raw, '=SUM(#REF!:#REF!)');
  assert.equal(store.getCell('B1').raw, '=A3');
});

test('inserts and deletes columns and keeps cells shifted predictably', () => {
  const store = createWorkbookStore({ namespace: 'apple-run', storage: createMemoryStorage() });

  store.commitCell(1, 1, 'left');
  store.commitCell(1, 2, 'middle');
  store.commitCell(1, 3, 'right');

  store.insertColumns(2, 1);
  assert.equal(store.getCell('A1').raw, 'left');
  assert.equal(store.getCell('C1').raw, 'middle');
  assert.equal(store.getCell('D1').raw, 'right');

  store.deleteColumns(3, 1);
  assert.equal(store.getCell('C1').raw, 'right');

  store.undo();
  assert.equal(store.getCell('C1').raw, 'middle');
  store.undo();
  assert.equal(store.getCell('B1').raw, 'middle');
});

test('maintains an evaluated cache and clears it when cells mutate', () => {
  const store = createWorkbookStore({ namespace: 'apple-run', storage: createMemoryStorage() });

  store.setEvaluatedCell('A1', { value: 10, display: '10' });
  assert.deepEqual(store.getEvaluatedCell('A1'), { value: 10, display: '10' });

  store.commitCell(1, 1, '12');
  assert.equal(store.getEvaluatedCell('A1'), null);
});

test('caps undo history at the configured action limit', () => {
  const store = createWorkbookStore({
    namespace: 'apple-run',
    storage: createMemoryStorage(),
    maxHistory: 2,
  });

  store.commitCell(1, 1, 'one');
  store.commitCell(1, 1, 'two');
  store.commitCell(1, 1, 'three');

  assert.equal(store.undoStackSize(), 2);
  store.undo();
  assert.equal(store.getCell('A1').raw, 'two');
  store.undo();
  assert.equal(store.getCell('A1').raw, 'one');
  assert.equal(store.undo(), false);
});
