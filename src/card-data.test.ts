import { describe, expect, it } from 'vitest';

import { cardLibrary, deckById, keywordGlossary, starterDecks } from './card-data';

describe('card data', () => {
  it('defines a compact starter card pool for two factions', () => {
    expect(cardLibrary).toHaveLength(16);

    const factions = new Set(cardLibrary.map((card) => card.faction));
    expect([...factions].sort()).toEqual(['ember', 'tide']);

    const creatures = cardLibrary.filter((card) => card.kind === 'creature');
    const spells = cardLibrary.filter((card) => card.kind === 'spell');
    expect(creatures.length).toBeGreaterThan(0);
    expect(spells.length).toBeGreaterThan(0);
  });

  it('limits the keyword glossary to six reusable mechanics', () => {
    expect(keywordGlossary).toHaveLength(6);
    expect(keywordGlossary.map((keyword) => keyword.id)).toEqual([
      'guard',
      'charge',
      'swift',
      'burn',
      'flow',
      'shield',
    ]);
  });

  it('ships two 20-card starter decks built from the shared pool', () => {
    expect(starterDecks).toHaveLength(2);

    for (const deck of starterDecks) {
      const totalCards = deck.cards.reduce((sum, entry) => sum + entry.count, 0);
      expect(totalCards).toBe(20);

      for (const entry of deck.cards) {
        const card = deckById[entry.cardId];
        expect(card).toBeDefined();
        expect(card.faction).toBe(deck.faction);
      }
    }
  });
});
