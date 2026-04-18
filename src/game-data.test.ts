import { describe, expect, it } from 'vitest';
import { cards, decks, encounterLadder, keywordGlossary } from './game-data';

describe('game data', () => {
  it('defines a compact duel set with two factions and bounded keywords', () => {
    expect(cards).toHaveLength(12);
    expect(new Set(cards.map((card) => card.faction))).toEqual(
      new Set(['Ashfall Covenant', 'Verdant Loom']),
    );
    expect(keywordGlossary).toHaveLength(4);
  });

  it('builds two 20-card starter decks from the shared card pool', () => {
    expect(decks).toHaveLength(2);

    for (const deck of decks) {
      const size = deck.list.reduce((total, entry) => total + entry.count, 0);
      expect(size).toBe(20);
      expect(deck.list.every((entry) => cards.some((card) => card.id === entry.cardId))).toBe(true);
    }
  });

  it('provides a three-step encounter ladder with replayable variation', () => {
    expect(encounterLadder).toHaveLength(3);
    expect(encounterLadder.every((step) => step.variants.length >= 2)).toBe(true);
  });
});
