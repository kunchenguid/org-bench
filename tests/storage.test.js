const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStorageApi,
  normalizeStorageNamespace,
} = require('../src/storage.js');

test('normalizeStorageNamespace appends trailing separator once', () => {
  assert.equal(normalizeStorageNamespace('apple-run-1'), 'apple-run-1:');
  assert.equal(normalizeStorageNamespace('apple-run-1:'), 'apple-run-1:');
});

test('createStorageApi prefixes persisted keys with the run namespace', () => {
  const writes = new Map();
  const storage = {
    getItem(key) {
      return writes.has(key) ? writes.get(key) : null;
    },
    setItem(key, value) {
      writes.set(key, value);
    },
    removeItem(key) {
      writes.delete(key);
    },
  };

  const api = createStorageApi({
    namespace: 'apple-run-1',
    storage,
  });

  api.set('save', { turn: 3, playerHealth: 18 });

  assert.deepEqual(JSON.parse(writes.get('apple-run-1:save')), {
    turn: 3,
    playerHealth: 18,
  });
  assert.deepEqual(api.get('save'), { turn: 3, playerHealth: 18 });
});

test('createStorageApi falls back cleanly for missing and invalid JSON values', () => {
  const writes = new Map([
    ['apple-run-1:broken', '{bad json'],
  ]);
  const storage = {
    getItem(key) {
      return writes.has(key) ? writes.get(key) : null;
    },
    setItem(key, value) {
      writes.set(key, value);
    },
    removeItem(key) {
      writes.delete(key);
    },
  };

  const api = createStorageApi({
    namespace: 'apple-run-1',
    storage,
  });

  assert.equal(api.get('missing', 'fallback'), 'fallback');
  assert.equal(api.get('broken', 'fallback'), 'fallback');
});
