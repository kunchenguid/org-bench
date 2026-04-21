const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStorageKey,
  loadPersistedSheet,
  savePersistedSheet,
} = require('../emma-storage.js');

test('prefixes the sheet key with the injected namespace', () => {
  assert.equal(buildStorageKey('run-42'), 'run-42:sheet');
});

test('falls back to a default namespace when the injected value is empty', () => {
  assert.equal(buildStorageKey(''), 'spreadsheet:sheet');
});

test('loads a persisted sheet payload from storage', () => {
  const storage = createStorage({ 'run-42:sheet': '{"cells":{"A1":"7"},"active":"B3"}' });
  const state = loadPersistedSheet(storage, 'run-42');

  assert.equal(state.cells.A1, '7');
  assert.equal(state.active, 'B3');
});

test('saves the current sheet payload back to storage', () => {
  const storage = createStorage();
  savePersistedSheet(storage, 'run-42', {
    cells: { B2: '=A1+1' },
    active: 'B2',
  });

  assert.equal(storage.getItem('run-42:sheet'), '{"cells":{"B2":"=A1+1"},"active":"B2"}');
});

function createStorage(initialValues) {
  const values = Object.assign({}, initialValues);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = value;
    },
  };
}
