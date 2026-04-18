import { describe, expect, it } from 'vitest';

import type { Card } from '../game-data';
import {
  createCardGalleryPreferences,
  filterCardsByFaction,
  type CardGalleryFactionFilter,
} from './card-gallery-preferences';

type MemoryStorage = {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();

  return {
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

const sampleCards: Card[] = [
  {
    id: 'ash-card',
    name: 'Ash Card',
    faction: 'Ashfall Covenant',
    type: 'unit',
    cost: 1,
    attack: 1,
    health: 1,
    keywords: [],
    text: 'Test card',
  },
  {
    id: 'verdant-card',
    name: 'Verdant Card',
    faction: 'Verdant Loom',
    type: 'unit',
    cost: 1,
    attack: 1,
    health: 1,
    keywords: [],
    text: 'Test card',
  },
];

describe('card gallery preferences', () => {
  it('defaults to showing all factions when nothing is stored', () => {
    const preferences = createCardGalleryPreferences(createMemoryStorage(), 'run:apple-seed-01');

    expect(preferences.getSelectedFaction()).toBe<CardGalleryFactionFilter>('all');
  });

  it('persists and restores a valid faction filter', () => {
    const storage = createMemoryStorage();
    const preferences = createCardGalleryPreferences(storage, 'run:apple-seed-01');

    preferences.setSelectedFaction('Verdant Loom');

    expect(preferences.getSelectedFaction()).toBe<CardGalleryFactionFilter>('Verdant Loom');
    expect(storage.getItem('run:apple-seed-01:duel-tcg:card-gallery-faction')).toBe(
      JSON.stringify('Verdant Loom'),
    );
  });

  it('falls back to all when storage contains an unknown value', () => {
    const storage = createMemoryStorage();
    storage.setItem('run:apple-seed-01:duel-tcg:card-gallery-faction', JSON.stringify('Unknown'));

    const preferences = createCardGalleryPreferences(storage, 'run:apple-seed-01');

    expect(preferences.getSelectedFaction()).toBe<CardGalleryFactionFilter>('all');
  });

  it('filters cards by the selected faction', () => {
    expect(filterCardsByFaction(sampleCards, 'all')).toHaveLength(2);
    expect(filterCardsByFaction(sampleCards, 'Ashfall Covenant')).toEqual([sampleCards[0]]);
    expect(filterCardsByFaction(sampleCards, 'Verdant Loom')).toEqual([sampleCards[1]]);
  });
});
