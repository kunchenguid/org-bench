import { describe, expect, test } from 'vitest';

import { createNamespacedStorage } from './persistence';

type MemoryStorage = {
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();

  return {
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('createNamespacedStorage', () => {
  test('prefixes keys with the injected run namespace', () => {
    const storage = createMemoryStorage();
    const session = createNamespacedStorage(storage, 'run:apple-seed-01');

    session.set('battle-state', { turn: 3, health: 18 });

    expect(storage.getItem('run:apple-seed-01:duel-tcg:battle-state')).toBe(
      JSON.stringify({ turn: 3, health: 18 }),
    );
  });

  test('reads parsed JSON values back out of storage', () => {
    const storage = createMemoryStorage();
    const session = createNamespacedStorage(storage, 'run:apple-seed-01');

    storage.setItem(
      'run:apple-seed-01:duel-tcg:encounter',
      JSON.stringify({ encounterId: 'boss', enemyHealth: 9 }),
    );

    expect(session.get<{ encounterId: string; enemyHealth: number }>('encounter')).toEqual({
      encounterId: 'boss',
      enemyHealth: 9,
    });
  });

  test('removes only keys inside its own duel scope', () => {
    const storage = createMemoryStorage();
    const session = createNamespacedStorage(storage, 'run:apple-seed-01');

    storage.setItem('run:apple-seed-01:duel-tcg:save-a', '{"value":1}');
    storage.setItem('run:apple-seed-01:duel-tcg:save-b', '{"value":2}');
    storage.setItem('run:apple-seed-01:other-game:save-c', '{"value":3}');
    storage.setItem('run:other-run:duel-tcg:save-d', '{"value":4}');

    session.clear();

    expect(storage.getItem('run:apple-seed-01:duel-tcg:save-a')).toBeNull();
    expect(storage.getItem('run:apple-seed-01:duel-tcg:save-b')).toBeNull();
    expect(storage.getItem('run:apple-seed-01:other-game:save-c')).toBe('{"value":3}');
    expect(storage.getItem('run:other-run:duel-tcg:save-d')).toBe('{"value":4}');
  });
});
