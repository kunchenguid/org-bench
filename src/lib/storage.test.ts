import { describe, expect, it } from 'vitest';
import { createNamespacedStorage } from './storage';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

describe('createNamespacedStorage', () => {
  it('prefixes every storage key with the provided namespace', () => {
    const storage = createMemoryStorage();
    const namespacedStorage = createNamespacedStorage(storage, 'run:amazon-seed-01');

    namespacedStorage.setText('encounter', 'shadow-warden');

    expect(storage.getItem('run:amazon-seed-01:encounter')).toBe('shadow-warden');
    expect(storage.getItem('encounter')).toBeNull();
  });

  it('round-trips JSON values through the namespace wrapper', () => {
    const storage = createMemoryStorage();
    const namespacedStorage = createNamespacedStorage(storage, 'run:amazon-seed-01');

    namespacedStorage.setJson('progress', { encounterId: 'ember-raid', playerHealth: 16 });

    expect(namespacedStorage.getJson<{ encounterId: string; playerHealth: number }>('progress')).toEqual({
      encounterId: 'ember-raid',
      playerHealth: 16
    });
  });

  it('removes only the namespaced key requested', () => {
    const storage = createMemoryStorage();
    const namespacedStorage = createNamespacedStorage(storage, 'run:amazon-seed-01');

    storage.setItem('run:amazon-seed-01:progress', '{"done":false}');
    storage.setItem('run:other-run:progress', '{"done":true}');

    namespacedStorage.remove('progress');

    expect(storage.getItem('run:amazon-seed-01:progress')).toBeNull();
    expect(storage.getItem('run:other-run:progress')).toBe('{"done":true}');
  });
});
