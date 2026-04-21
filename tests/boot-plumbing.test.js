const test = require('node:test');
const assert = require('node:assert/strict');

const { createStorageNamespaceApi } = require('../storage-namespace.js');
const { boot } = require('../app.js');

test('storage namespace helper resolves injected namespace and prefixes keys', () => {
  const namespace = createStorageNamespaceApi({
    __BENCHMARK_RUN_NAMESPACE__: 'apple-run',
  });

  assert.equal(namespace.getNamespace(), 'apple-run');
  assert.equal(namespace.makeKey('selection'), 'apple-run:selection');
});

test('boot exposes the resolved storage namespace for the existing shell', () => {
  const namespaceApi = createStorageNamespaceApi({
    __BENCHMARK_RUN_NAMESPACE__: 'apple-run',
  });

  const result = boot({
    document: null,
    namespaceApi,
  });

  assert.equal(result.storageNamespace, 'apple-run');
});
