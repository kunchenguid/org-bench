const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStorageKey,
  createInitialState,
  loadGameState,
  readStorageNamespace,
  saveGameState,
} = require('../src/state.js');

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

test('createStorageKey prefixes every key with the run namespace', () => {
  assert.equal(createStorageKey('fb-run-123', 'save'), 'fb-run-123:save');
});

test('loadGameState returns a new initial state when nothing is saved', () => {
  const storage = createMemoryStorage();
  const state = loadGameState({ storage, namespace: 'fb-run-123' });

  assert.deepEqual(state, createInitialState());
});

test('saveGameState persists data under the namespaced key and load restores it', () => {
  const storage = createMemoryStorage();
  const expected = {
    turn: 3,
    playerHealth: 18,
    opponentHealth: 14,
    playerMana: 2,
    opponentMana: 3,
    log: ['player-draw', 'opponent-draw'],
  };

  saveGameState({ storage, namespace: 'fb-run-123', state: expected });

  assert.equal(
    storage.getItem('fb-run-123:save'),
    JSON.stringify(expected),
  );
  assert.deepEqual(
    loadGameState({ storage, namespace: 'fb-run-123' }),
    expected,
  );
});

test('loadGameState falls back to a fresh state when stored JSON is invalid', () => {
  const storage = createMemoryStorage();
  storage.setItem('fb-run-123:save', '{bad json');

  assert.deepEqual(
    loadGameState({ storage, namespace: 'fb-run-123' }),
    createInitialState(),
  );
});

test('readStorageNamespace prefers the harness-injected prefix name', () => {
  globalThis.__FB_RUN_STORAGE_PREFIX__ = 'fb-run-456:';

  try {
    assert.equal(readStorageNamespace(), 'fb-run-456:');
  } finally {
    delete globalThis.__FB_RUN_STORAGE_PREFIX__;
  }
});
