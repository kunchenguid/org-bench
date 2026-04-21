const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpreadsheetPersistence } = require('./persistence.js');

function createStorage() {
  const map = new Map();

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

test('saves and restores cell contents and selection under namespaced key', () => {
  const storage = createStorage();
  const persistence = createSpreadsheetPersistence({
    namespace: 'run-42',
    storage,
  });

  persistence.save({
    cells: {
      A1: '=SUM(B1:B2)',
      B1: '3',
    },
    selection: { col: 1, row: 2 },
  });

  assert.deepEqual(storage.dump(), {
    'run-42:spreadsheet-state': JSON.stringify({
      cells: {
        A1: '=SUM(B1:B2)',
        B1: '3',
      },
      selection: { col: 1, row: 2 },
    }),
  });

  assert.deepEqual(persistence.load(), {
    cells: {
      A1: '=SUM(B1:B2)',
      B1: '3',
    },
    selection: { col: 1, row: 2 },
  });
});

test('falls back to a default key when namespace is missing', () => {
  const storage = createStorage();
  const persistence = createSpreadsheetPersistence({ storage });

  persistence.save({
    cells: { C3: 'hello' },
    selection: { col: 3, row: 3 },
  });

  assert.deepEqual(storage.dump(), {
    'spreadsheet:spreadsheet-state': JSON.stringify({
      cells: { C3: 'hello' },
      selection: { col: 3, row: 3 },
    }),
  });
});

test('returns a safe empty state when stored data is malformed', () => {
  const storage = createStorage();
  storage.setItem('run-42:spreadsheet-state', '{bad json');

  const persistence = createSpreadsheetPersistence({
    namespace: 'run-42',
    storage,
  });

  assert.deepEqual(persistence.load(), {
    cells: {},
    selection: null,
  });
});

test('does not write again when the state has not changed', () => {
  const writes = [];
  const storage = {
    getItem() {
      return null;
    },
    setItem(key, value) {
      writes.push([key, value]);
    },
    removeItem() {},
  };

  const persistence = createSpreadsheetPersistence({
    namespace: 'run-42',
    storage,
  });
  const state = {
    cells: { A1: '1' },
    selection: { col: 1, row: 1 },
  };

  persistence.save(state);
  persistence.save(state);

  assert.equal(writes.length, 1);
});

test('clear removes the persisted state', () => {
  const storage = createStorage();
  const persistence = createSpreadsheetPersistence({
    namespace: 'run-42',
    storage,
  });

  persistence.save({
    cells: { A1: '1' },
    selection: { col: 1, row: 1 },
  });
  persistence.clear();

  assert.deepEqual(storage.dump(), {});
  assert.deepEqual(persistence.load(), {
    cells: {},
    selection: null,
  });
});
