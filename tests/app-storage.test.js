const test = require('node:test');
const assert = require('node:assert/strict');

const { getStorageNamespace } = require('../app.js');

test('prefers benchmark storage namespace when provided', () => {
  const documentStub = {
    documentElement: {
      getAttribute() {
        return null;
      },
    },
    body: {
      getAttribute() {
        return null;
      },
    },
  };

  assert.equal(
    getStorageNamespace(documentStub, {
      __BENCHMARK_STORAGE_NAMESPACE__: 'bench-42:',
    }),
    'bench-42:'
  );
});
