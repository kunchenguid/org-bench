const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetStore,
  createMemoryStorage,
} = require('../src/spreadsheet-actions.js');

test('persists raw cell contents and active selection under a namespace', () => {
  const storage = createMemoryStorage();
  const store = createSpreadsheetStore({ namespace: 'oracle-run', storage });

  store.commit({
    cells: {
      A1: '=SUM(B1:B2)',
      B1: '2',
      B2: '3',
    },
    selection: { start: 'B2', end: 'B2', active: 'B2' },
  });

  const restored = createSpreadsheetStore({ namespace: 'oracle-run', storage });
  assert.equal(restored.getState().cells.A1, '=SUM(B1:B2)');
  assert.deepEqual(restored.getState().selection, {
    start: 'B2',
    end: 'B2',
    active: 'B2',
  });
});

test('retains only the last 50 user actions in undo history', () => {
  const store = createSpreadsheetStore({ namespace: 'history', storage: createMemoryStorage() });

  for (let index = 1; index <= 55; index += 1) {
    store.setCell(`A${index}`, String(index));
  }

  for (let index = 0; index < 50; index += 1) {
    store.undo();
  }

  const cells = store.getState().cells;
  assert.equal(cells.A1, '1');
  assert.equal(cells.A5, '5');
  assert.equal(cells.A6, undefined);

  store.redo();
  assert.equal(store.getState().cells.A6, '6');
});

test('copy/paste shifts relative references by the destination offset', () => {
  const store = createSpreadsheetStore({ namespace: 'clipboard', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '1',
      B1: '=A1',
    },
  });

  const clipboard = store.copyRange({ start: 'B1', end: 'B1' });
  store.pasteRange('C2', clipboard);

  assert.equal(store.getState().cells.C2, '=B2');
  assert.equal(store.getState().cells.B1, '=A1');
});

test('cut clears the source range after paste', () => {
  const store = createSpreadsheetStore({ namespace: 'cut', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '10',
      B1: '=A1',
    },
  });

  const clipboard = store.cutRange({ start: 'A1', end: 'B1' });
  store.pasteRange('C3', clipboard);

  assert.equal(store.getState().cells.A1, undefined);
  assert.equal(store.getState().cells.B1, undefined);
  assert.equal(store.getState().cells.C3, '10');
  assert.equal(store.getState().cells.D3, '=C3');
});

test('delete clears every cell in the selected rectangle as one undoable action', () => {
  const store = createSpreadsheetStore({ namespace: 'clear', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '1',
      A2: '2',
      B1: '3',
      B2: '4',
    },
  });

  store.clearRange({ start: 'A1', end: 'B2' });
  assert.deepEqual(store.getState().cells, {});

  store.undo();
  assert.deepEqual(store.getState().cells, {
    A1: '1',
    A2: '2',
    B1: '3',
    B2: '4',
  });
});

test('inserting a row rewrites formulas so references keep pointing at the same data', () => {
  const store = createSpreadsheetStore({ namespace: 'rows', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '7',
      A2: '8',
      B1: '=SUM(A1:A2)',
    },
  });

  store.insertRows(1, 1);

  const cells = store.getState().cells;
  assert.equal(cells.A1, undefined);
  assert.equal(cells.A2, '7');
  assert.equal(cells.A3, '8');
  assert.equal(cells.B2, '=SUM(A2:A3)');
});

test('deleting a referenced row collapses a deleted single-cell formula to raw #REF!', () => {
  const store = createSpreadsheetStore({ namespace: 'delete-row', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '7',
      A2: '8',
      B1: '=A2',
    },
  });

  store.deleteRows(2, 1);

  const cells = store.getState().cells;
  assert.equal(cells.A1, '7');
  assert.equal(cells.B1, '#REF!');
});

test('column insertion and deletion rewrite formulas with absolute markers preserved', () => {
  const store = createSpreadsheetStore({ namespace: 'columns', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '1',
      B1: '2',
      C1: '=SUM($A1:B$1)',
    },
  });

  store.insertColumns(2, 1);
  assert.equal(store.getState().cells.D1, '=SUM($A1:C$1)');

  store.deleteColumns(2, 1);
  assert.equal(store.getState().cells.C1, '=SUM($A1:B$1)');
});

test('deleting a referenced range endpoint collapses the formula to raw #REF!', () => {
  const store = createSpreadsheetStore({ namespace: 'delete-range-endpoint', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '1',
      A2: '2',
      B3: '=SUM(A1:A2)',
    },
  });

  store.deleteRows(2, 1);

  assert.equal(store.getState().cells.B2, '#REF!');
});

test('deleting a referenced column also collapses the formula to raw #REF!', () => {
  const store = createSpreadsheetStore({ namespace: 'delete-column', storage: createMemoryStorage() });

  store.commit({
    cells: {
      A1: '1',
      B1: '2',
      C1: '=B1',
    },
  });

  store.deleteColumns(2, 1);

  assert.equal(store.getState().cells.B1, '#REF!');
});
