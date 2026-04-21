const assert = require('node:assert/strict');

const { createSessionStore } = require('../src/session.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('saves and restores namespaced spreadsheet session state', () => {
  const storage = createMemoryStorage();
  const store = createSessionStore({ storage, namespace: 'run-apple-123' });
  const snapshot = {
    cells: { A1: '=1+2', B2: 'hello' },
    selection: { active: 'B2', anchor: 'A1', focus: 'B2' },
  };

  store.saveState(snapshot);

  assert.equal(store.storageKey, 'run-apple-123:spreadsheet:session');
  assert.deepEqual(store.loadState(), snapshot);
});

test('normalizes invalid data before persisting and loading', () => {
  const storage = createMemoryStorage();
  const store = createSessionStore({ storage, namespace: 'run-apple-123' });

  store.saveState({
    cells: { A1: '=1+2', bad: 42, B2: null, C3: 'ok' },
    selection: { active: 'oops', anchor: 'A1', focus: null },
  });

  assert.deepEqual(store.loadState(), {
    cells: { A1: '=1+2', C3: 'ok' },
    selection: { active: 'A1', anchor: 'A1', focus: 'A1' },
  });
});

test('falls back to defaults on corrupt or unknown schema payloads', () => {
  const storage = createMemoryStorage();
  const store = createSessionStore({ storage, namespace: 'run-apple-123' });

  storage.setItem(store.storageKey, '{bad json');
  assert.deepEqual(store.loadState(), {
    cells: {},
    selection: { active: 'A1', anchor: 'A1', focus: 'A1' },
  });

  storage.setItem(store.storageKey, JSON.stringify({ version: 999, cells: { A1: '1' } }));
  assert.deepEqual(store.loadState(), {
    cells: {},
    selection: { active: 'A1', anchor: 'A1', focus: 'A1' },
  });
});

test('reports storage failures without throwing into the UI layer', () => {
  const errors = [];
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  const store = createSessionStore({
    storage,
    namespace: 'run-apple-123',
    onError(error, phase) {
      errors.push(`${phase}:${error.message}`);
    },
  });

  assert.doesNotThrow(() => {
    store.saveState({ cells: { A1: '1' }, selection: { active: 'A1', anchor: 'A1', focus: 'A1' } });
  });
  assert.deepEqual(store.loadState(), {
    cells: {},
    selection: { active: 'A1', anchor: 'A1', focus: 'A1' },
  });
  assert.doesNotThrow(() => {
    store.clearState();
  });
  assert.deepEqual(errors, ['save:blocked', 'load:blocked', 'clear:blocked']);
});
