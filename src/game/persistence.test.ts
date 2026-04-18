import { describe, expect, it } from 'vitest';

import {
  clearPersistedGameState,
  createStorageKey,
  loadPersistedGameState,
  savePersistedGameState,
} from './persistence';

type StubStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function createStorageStub(): StubStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();

  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe('persistence helpers', () => {
  it('prefixes every storage key with the harness namespace', () => {
    expect(createStorageKey('apple-seed-01', 'save')).toBe('apple-seed-01:save');
  });

  it('saves and loads serialized state through a namespaced key', () => {
    const storage = createStorageStub();
    const state = { run: 3, hp: 14, resources: 2 };

    savePersistedGameState(storage, 'apple-seed-01', 'slot-a', state);

    expect(storage.values.get('apple-seed-01:slot-a')).toBe(JSON.stringify(state));
    expect(loadPersistedGameState<typeof state>(storage, 'apple-seed-01', 'slot-a')).toEqual(state);
  });

  it('removes persisted state through the same namespaced key', () => {
    const storage = createStorageStub();

    storage.setItem('apple-seed-01:slot-a', '{"ok":true}');
    clearPersistedGameState(storage, 'apple-seed-01', 'slot-a');

    expect(storage.getItem('apple-seed-01:slot-a')).toBeNull();
  });
});
