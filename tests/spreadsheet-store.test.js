const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetStore,
} = require('../src/spreadsheet-store.js');

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
    dump() {
      return Object.fromEntries(data.entries());
    },
  };
}

test('save writes raw cells and selection under the run-scoped key', () => {
  const storage = createMemoryStorage();
  const store = createSpreadsheetStore({
    storage,
    storageNamespace: 'oracle-run-1',
  });

  store.setCellRaw('A1', '41');
  store.setCellRaw('B2', '=A1+1');
  store.selectCell('B2');
  store.save();

  assert.deepEqual(storage.dump(), {
    'oracle-run-1:spreadsheet-state': JSON.stringify({
      cells: {
        A1: { raw: '41' },
        B2: { raw: '=A1+1' },
      },
      selection: {
        active: 'B2',
        anchor: 'B2',
        focus: 'B2',
      },
    }),
  });
});

test('load restores raw formulas and selected cell but not session history', () => {
  const storage = createMemoryStorage();
  const first = createSpreadsheetStore({
    storage,
    storageNamespace: 'oracle-run-2',
  });

  first.setCellRaw('C3', '=SUM(A1:A2)');
  first.selectCell('C3');
  first.recordAction({ type: 'commit', cells: ['C3'] });
  first.save();

  const restored = createSpreadsheetStore({
    storage,
    storageNamespace: 'oracle-run-2',
  });
  restored.load();

  assert.equal(restored.getState().cells.C3.raw, '=SUM(A1:A2)');
  assert.deepEqual(restored.getState().selection, {
    active: 'C3',
    anchor: 'C3',
    focus: 'C3',
  });
  assert.equal(restored.getHistory().undo.length, 0);
  assert.equal(restored.getHistory().redo.length, 0);
});

test('insertRows shifts formulas so references keep following moved data', () => {
  const store = createSpreadsheetStore({
    storage: createMemoryStorage(),
    storageNamespace: 'oracle-run-3',
  });

  store.setCellRaw('D4', '=SUM(B2:$C$3)&A$1');
  store.insertRows(2, 1);

  assert.equal(store.getState().cells.D5.raw, '=SUM(B3:$C$4)&A$1');
});

test('deleteRows marks deleted references as #REF! and shifts cells upward', () => {
  const store = createSpreadsheetStore({
    storage: createMemoryStorage(),
    storageNamespace: 'oracle-run-4',
  });

  store.setCellRaw('D4', '=B2+C5');
  store.deleteRows(2, 1);

  assert.equal(store.getState().cells.D3.raw, '=#REF!+C4');
});

test('insertColumns and deleteColumns rewrite column references in formulas', () => {
  const store = createSpreadsheetStore({
    storage: createMemoryStorage(),
    storageNamespace: 'oracle-run-5',
  });

  store.setCellRaw('D4', '=SUM(B2:C3)+$A1');
  store.insertColumns(2, 1);
  assert.equal(store.getState().cells.E4.raw, '=SUM(C2:D3)+$A1');

  store.deleteColumns(3, 1);
  assert.equal(store.getState().cells.D4.raw, '=SUM(#REF!:C3)+$A1');
});
