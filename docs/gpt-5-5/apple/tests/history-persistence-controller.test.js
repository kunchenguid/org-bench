const assert = require('assert');
const historyPersistence = require('../history-persistence');
const { installHistoryPersistenceController } = require('../src/historyPersistenceController');

function createTarget() {
  const handlers = {};
  return {
    addEventListener(type, handler) {
      handlers[type] = handlers[type] || new Set();
      handlers[type].add(handler);
    },
    removeEventListener(type, handler) {
      handlers[type].delete(handler);
    },
    dispatch(type, event) {
      (handlers[type] || []).forEach((handler) => handler(event));
    },
  };
}

function createStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function createStore() {
  let state = {
    dimensions: { rows: 100, columns: 26 },
    cells: {},
    selection: { active: { row: 0, col: 0 }, anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 }, range: { top: 0, left: 0, bottom: 0, right: 0 } },
  };
  const handlers = {};

  function emit(type) {
    (handlers[type] || []).forEach((handler) => handler({ detail: { state: store.snapshot() } }));
  }

  const store = {
    on(type, handler) {
      handlers[type] = handlers[type] || new Set();
      handlers[type].add(handler);
      return function () { handlers[type].delete(handler); };
    },
    snapshot() {
      return JSON.parse(JSON.stringify(state));
    },
    hydrate(nextState) {
      state = JSON.parse(JSON.stringify(nextState));
      emit('statechange');
    },
    setCellRaw(cell, raw) {
      state.cells.A1 = raw;
      emit('statechange');
    },
  };
  return store;
}

function run() {
  const target = createTarget();
  const storage = createStorage();
  storage.setItem('run:test:cells', JSON.stringify({ B2: '=A1+1' }));
  storage.setItem('run:test:selection', JSON.stringify({ active: { row: 1, col: 1 }, anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 }, range: { top: 1, left: 1, bottom: 1, right: 1 } }));
  const store = createStore();

  const controller = installHistoryPersistenceController({
    target,
    store,
    historyPersistence,
    storage,
    namespace: 'run:test:',
  });

  assert.strictEqual(store.snapshot().cells.B2, '=A1+1');
  assert.strictEqual(store.snapshot().selection.active.row, 1);

  controller.recordAction('cell-edit', function () {
    store.setCellRaw({ row: 0, col: 0 }, '42');
  });

  assert.strictEqual(JSON.parse(storage.getItem('run:test:cells')).A1, '42');

  target.dispatch('keydown', { key: 'z', metaKey: true, preventDefault() {} });
  assert.strictEqual(store.snapshot().cells.A1, undefined);
  assert.strictEqual(store.snapshot().cells.B2, '=A1+1');

  target.dispatch('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, preventDefault() {} });
  assert.strictEqual(store.snapshot().cells.A1, '42');

  const beforeFormula = store.snapshot();
  store.setCellRaw({ row: 0, col: 0 }, '=B2+1');
  controller.recordSnapshots('formula-bar', beforeFormula, store.snapshot());
  target.dispatch('keydown', { key: 'z', metaKey: true, preventDefault() {} });
  assert.strictEqual(store.snapshot().cells.A1, '42');

  controller.remove();
}

run();
console.log('history persistence controller tests passed');
