const test = require('node:test');
const assert = require('node:assert/strict');

const { createHistory } = require('../src/history.js');
const { createPersistence } = require('../src/persistence.js');
const { createRuntime } = require('../src/runtime.js');

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

test('commit synchronizes runtime state through history and persistence', () => {
  const storage = createMemoryStorage();
  const persistence = createPersistence({
    storage,
    namespace: 'run-runtime',
    defaultState: {
      cells: {},
      selection: { row: 1, col: 1 },
    },
  });

  const history = createHistory({
    initialState: persistence.load(),
  });

  const runtime = createRuntime({ history, persistence });

  const next = runtime.commit(
    {
      cells: { A1: '42' },
      selection: { row: 2, col: 1 },
    },
    'cell-edit'
  );

  assert.deepEqual(next, {
    cells: { A1: '42' },
    selection: { row: 2, col: 1 },
  });
  assert.deepEqual(runtime.getState(), next);
  assert.deepEqual(JSON.parse(storage.getItem('run-runtime:spreadsheet-state')), next);
});

test('applyStructuralEdit rewrites cells and records the new state', () => {
  const runtime = createRuntime({
    history: createHistory({
      initialState: {
        cells: {
          A1: '7',
          B1: '=A1',
        },
        selection: { row: 1, col: 2 },
      },
    }),
    structure: {
      applyStructuralEdit(cells, operation) {
        assert.deepEqual(operation, { type: 'insert-column', index: 1 });
        return {
          B1: cells.A1,
          C1: '=B1',
        };
      },
    },
  });

  const next = runtime.applyStructuralEdit({ type: 'insert-column', index: 1 });

  assert.deepEqual(next, {
    cells: {
      B1: '7',
      C1: '=B1',
    },
    selection: { row: 1, col: 2 },
  });
});

test('updateSelection persists the active cell without consuming undo history', () => {
  const storage = createMemoryStorage();
  const persistence = createPersistence({
    storage,
    namespace: 'run-selection',
    defaultState: {
      cells: { A1: '42' },
      selection: { row: 1, col: 1 },
    },
  });
  persistence.save({
    cells: { A1: '42' },
    selection: { row: 1, col: 1 },
  });

  const history = createHistory({
    initialState: persistence.load(),
  });
  const runtime = createRuntime({ history, persistence });

  runtime.updateSelection({ row: 5, col: 3 }, 'shell:selection');

  assert.deepEqual(runtime.getState(), {
    cells: { A1: '42' },
    selection: { row: 5, col: 3 },
  });
  assert.deepEqual(runtime.undo(), null);
  assert.deepEqual(JSON.parse(storage.getItem('run-selection:spreadsheet-state')), {
    cells: { A1: '42' },
    selection: { row: 5, col: 3 },
  });
});

test('registerModule starts modules with a shared store and bus', () => {
  const runtime = createRuntime();
  const events = [];

  runtime.registerModule('listener', function init(context) {
    context.bus.on('runtime:ready', function (payload) {
      events.push(payload.state.selection.row);
    });
  });

  runtime.start();

  assert.deepEqual(events, [1]);
  assert.equal(typeof runtime.store.subscribe, 'function');
});
