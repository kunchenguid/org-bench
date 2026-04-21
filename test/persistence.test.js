const test = require('node:test');
const assert = require('node:assert/strict');

const { createPersistence } = require('../src/persistence.js');

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test('save prefixes keys with the injected namespace and preserves raw cell contents', () => {
  const storage = createMemoryStorage();
  const persistence = createPersistence({
    storage,
    namespace: 'run-123',
  });

  persistence.save({
    cells: { A1: '=SUM(B1:B2)', B1: '4', B2: '5' },
    selection: { row: 1, col: 1 },
  });

  const raw = storage.getItem('run-123:spreadsheet-state');
  assert.notEqual(raw, null);

  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed.cells, { A1: '=SUM(B1:B2)', B1: '4', B2: '5' });
  assert.deepEqual(parsed.selection, { row: 1, col: 1 });
});

test('load restores saved state and falls back to defaults for missing or invalid data', () => {
  const validStorage = createMemoryStorage();
  validStorage.setItem(
    'run-456:spreadsheet-state',
    JSON.stringify({ cells: { C3: 'hello' }, selection: { row: 3, col: 3 } })
  );

  const persistence = createPersistence({
    storage: validStorage,
    namespace: 'run-456',
  });

  assert.deepEqual(persistence.load(), {
    cells: { C3: 'hello' },
    selection: { row: 3, col: 3 },
  });

  const invalidStorage = createMemoryStorage();
  invalidStorage.setItem('run-bad:spreadsheet-state', '{bad json');

  const fallback = createPersistence({
    storage: invalidStorage,
    namespace: 'run-bad',
    defaultState: { cells: {}, selection: { row: 1, col: 1 } },
  });

  assert.deepEqual(fallback.load(), {
    cells: {},
    selection: { row: 1, col: 1 },
  });
});
