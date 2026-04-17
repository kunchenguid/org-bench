import { describe, expect, it } from 'vitest';

import { createNamespacedLocalStore } from './persistence';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage() {
  const values = new Map<string, string>();

  const storage: MemoryStorage = {
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

  return { storage, values };
}

describe('createNamespacedLocalStore', () => {
  it('prefixes saved keys with the provided run namespace', () => {
    const { storage, values } = createMemoryStorage();
    const store = createNamespacedLocalStore('run:apple-seed-01', storage);

    store.save('campaign', { currentEncounterId: 'cinder-raider', completedEncounterIds: [] });

    expect(values.get('run:apple-seed-01:campaign')).toBe(
      JSON.stringify({ currentEncounterId: 'cinder-raider', completedEncounterIds: [] }),
    );
  });

  it('loads saved JSON and falls back when nothing is stored', () => {
    const { storage, values } = createMemoryStorage();
    const store = createNamespacedLocalStore('run:apple-seed-01', storage);

    values.set(
      'run:apple-seed-01:encounter',
      JSON.stringify({ id: 'cinder-raider', turn: 3, activePlayerId: 'player' }),
    );

    expect(store.load('encounter', null)).toEqual({
      id: 'cinder-raider',
      turn: 3,
      activePlayerId: 'player',
    });
    expect(store.load('missing', { resumed: false })).toEqual({ resumed: false });
  });

  it('removes saved keys and ignores invalid JSON by returning the fallback', () => {
    const { storage, values } = createMemoryStorage();
    const store = createNamespacedLocalStore('run:apple-seed-01', storage);

    values.set('run:apple-seed-01:broken', '{not json');
    values.set('run:apple-seed-01:campaign', JSON.stringify({ progress: 2 }));

    expect(store.load('broken', { progress: 0 })).toEqual({ progress: 0 });

    store.remove('campaign');

    expect(values.has('run:apple-seed-01:campaign')).toBe(false);
  });
});
