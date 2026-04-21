const test = require('node:test');
const assert = require('node:assert/strict');

const { getStorageKey } = require('../src/storage.js');

test('getStorageKey prefixes persisted state with the injected benchmark namespace', () => {
  assert.equal(getStorageKey({ __BENCHMARK_STORAGE_NAMESPACE__: 'bench-42' }), 'bench-42:grid');
});

test('getStorageKey falls back to the older run namespace and then to a default', () => {
  assert.equal(getStorageKey({ __RUN_STORAGE_NAMESPACE__: 'legacy-run' }), 'legacy-run:grid');
  assert.equal(getStorageKey({}), 'spreadsheet:run:grid');
});
