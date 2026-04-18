import { describe, expect, it } from 'vitest';

import { cardPool, encounterLadder, factions, keywords, starterDecks } from './content';

describe('content model', () => {
  it('defines exactly two faction identities', () => {
    expect(factions).toHaveLength(2);
    expect(factions.map((faction) => faction.id)).toEqual(['skyforge', 'wildroot']);
    expect(factions.map((faction) => faction.theme)).toEqual([
      'disciplined tempo and formation combat',
      'growth, healing, and oversized bodies',
    ]);
  });

  it('ships a compact twenty-card pool', () => {
    expect(cardPool).toHaveLength(20);
    expect(new Set(cardPool.map((card) => card.id)).size).toBe(20);
    expect(cardPool.filter((card) => card.factionId === 'skyforge')).toHaveLength(10);
    expect(cardPool.filter((card) => card.factionId === 'wildroot')).toHaveLength(10);
  });

  it('defines two twenty-card starter decks from the shared pool', () => {
    expect(starterDecks).toHaveLength(2);

    for (const deck of starterDecks) {
      const totalCopies = deck.cards.reduce((sum, entry) => sum + entry.count, 0);
      expect(totalCopies).toBe(20);
      expect(deck.cards.every((entry) => cardPool.some((card) => card.id === entry.cardId))).toBe(true);
    }
  });

  it('defines every keyword referenced by the card pool', () => {
    const keywordIds = new Set(keywords.map((keyword) => keyword.id));

    for (const card of cardPool) {
      for (const keywordId of card.keywords) {
        expect(keywordIds.has(keywordId)).toBe(true);
      }
    }
  });

  it('defines an encounter ladder with escalating pressure', () => {
    expect(encounterLadder.map((encounter) => encounter.id)).toEqual([
      'sparring-partner',
      'grove-tender',
      'vanguard-captain',
      'canopy-elder',
    ]);

    expect(encounterLadder.map((encounter) => encounter.difficulty)).toEqual([1, 2, 3, 4]);
    expect(encounterLadder.every((encounter) => encounter.deckId)).toBe(true);
  });
});
