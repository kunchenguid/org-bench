const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWorkbookPersistence,
  resolveRunNamespace,
} = require('./src/persistence.js');

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('saveWorkbook stores cells, active cell, and range under a namespaced key', () => {
  const storage = createMemoryStorage();
  const persistence = createWorkbookPersistence({
    storage,
    namespace: 'oracle-run-42',
  });

  persistence.saveWorkbook({
    cells: {
      A1: '12',
      B2: '=A1*2',
    },
    selection: {
      active: 'B2',
      range: {
        start: 'A1',
        end: 'B2',
      },
    },
  });

  assert.equal(
    storage.getItem('oracle-run-42:spreadsheet:session'),
    JSON.stringify({
      cells: {
        A1: '12',
        B2: '=A1*2',
      },
      selection: {
        active: 'B2',
        range: {
          start: 'A1',
          end: 'B2',
        },
      },
    })
  );
});

test('loadWorkbook returns normalized defaults when storage is empty', () => {
  const persistence = createWorkbookPersistence({
    storage: createMemoryStorage(),
    namespace: 'oracle-run-42',
  });

  assert.deepEqual(persistence.loadWorkbook(), {
    cells: {},
    selection: {
      active: 'A1',
      range: null,
    },
  });
});

test('loadWorkbook ignores malformed payloads and falls back to defaults', () => {
  const storage = createMemoryStorage();
  storage.setItem('oracle-run-42:spreadsheet:session', '{not json');

  const persistence = createWorkbookPersistence({
    storage,
    namespace: 'oracle-run-42',
  });

  assert.deepEqual(persistence.loadWorkbook(), {
    cells: {},
    selection: {
      active: 'A1',
      range: null,
    },
  });
});

test('clearWorkbook removes persisted session data', () => {
  const storage = createMemoryStorage();
  const persistence = createWorkbookPersistence({
    storage,
    namespace: 'oracle-run-42',
  });

  persistence.saveWorkbook({
    cells: { A1: '1' },
    selection: { active: 'A1', range: null },
  });
  persistence.clearWorkbook();

  assert.equal(storage.getItem('oracle-run-42:spreadsheet:session'), null);
});

test('resolveRunNamespace prefers explicit namespace then injected globals and dataset', () => {
  assert.equal(resolveRunNamespace({ explicitNamespace: 'passed-in' }), 'passed-in');
  assert.equal(
    resolveRunNamespace({
      globalObject: { __BENCHMARK_RUN_NAMESPACE__: 'bench-global' },
    }),
    'bench-global'
  );
  assert.equal(
    resolveRunNamespace({
      documentObject: {
        documentElement: {
          dataset: {
            runNamespace: 'dataset-value',
          },
        },
      },
    }),
    'dataset-value'
  );
});

test('createWorkbookPersistence rejects missing namespaces', () => {
  assert.throws(
    () => createWorkbookPersistence({ storage: createMemoryStorage() }),
    /namespace/
  );
});
