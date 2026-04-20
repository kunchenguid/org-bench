const test = require('node:test');
const assert = require('node:assert/strict');

const { createStorageHelper } = require('./storage.js');

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
    dump() {
      return new Map(values);
    },
  };
}

test('uses explicit namespace when provided', () => {
  const storage = createMemoryStorage();
  const helper = createStorageHelper({ storage, namespace: 'run-42' });

  helper.saveEncounter({ turn: 3, player: { hp: 15 } });

  assert.equal(helper.getPrefix(), 'run-42');
  assert.deepEqual(JSON.parse(storage.getItem('run-42:encounter')).snapshot, {
    turn: 3,
    player: { hp: 15 },
  });
});

test('falls back to configured prefix when namespace discovery is empty', () => {
  const storage = createMemoryStorage();
  const helper = createStorageHelper({
    storage,
    namespaceCandidates: [null, '', '   '],
    fallbackPrefix: 'duel-dev',
  });

  helper.saveEncounter({ seed: 9 });

  assert.equal(helper.getPrefix(), 'duel-dev');
  assert.ok(storage.getItem('duel-dev:encounter'));
});

test('uses the first non-empty discovered namespace candidate', () => {
  const storage = createMemoryStorage();
  const helper = createStorageHelper({
    storage,
    namespaceCandidates: [undefined, ' bench-run ', 'later'],
  });

  assert.equal(helper.getPrefix(), 'bench-run');
});

test('round-trips encounter snapshots with wrapper metadata', () => {
  const storage = createMemoryStorage();
  const helper = createStorageHelper({ storage, namespace: 'resume' });
  const snapshot = {
    turn: 6,
    phase: 'combat',
    player: { hp: 11, mana: 2, hand: ['Spark Imp'] },
    enemy: { hp: 4, board: [{ id: 'ember-fox', attack: 3, health: 1 }] },
  };

  helper.saveEncounter(snapshot);

  assert.deepEqual(helper.loadEncounter(), snapshot);
});

test('returns null instead of throwing on corrupt stored data', () => {
  const storage = createMemoryStorage();
  storage.setItem('safe:encounter', '{not json');
  const helper = createStorageHelper({ storage, namespace: 'safe' });

  assert.equal(helper.loadEncounter(), null);
});

test('returns null for invalid snapshot wrappers', () => {
  const storage = createMemoryStorage();
  storage.setItem('safe:encounter', JSON.stringify({ version: 1 }));
  const helper = createStorageHelper({ storage, namespace: 'safe' });

  assert.equal(helper.loadEncounter(), null);
});

test('clears persisted encounter state', () => {
  const storage = createMemoryStorage();
  const helper = createStorageHelper({ storage, namespace: 'clear-me' });

  helper.saveEncounter({ turn: 1 });
  helper.clearEncounter();

  assert.equal(storage.getItem('clear-me:encounter'), null);
});
