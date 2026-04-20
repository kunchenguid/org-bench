const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveStoragePrefix } = require('../storage.js');

test('prefers injected benchmark storage namespace when present', () => {
  assert.equal(resolveStoragePrefix({ __BENCHMARK_STORAGE_NAMESPACE__: 'run-a:' }), 'run-a:');
});

test('falls back across supported run namespace globals', () => {
  assert.equal(resolveStoragePrefix({ __RUN_STORAGE_NAMESPACE__: 'run-b:' }), 'run-b:');
  assert.equal(resolveStoragePrefix({ __BENCHMARK_RUN_NAMESPACE__: 'run-c:' }), 'run-c:');
  assert.equal(resolveStoragePrefix({ __storageNamespace: 'run-d:' }), 'run-d:');
});

test('uses default prefix when no namespace is injected', () => {
  assert.equal(resolveStoragePrefix({}), 'spreadsheet:');
});
