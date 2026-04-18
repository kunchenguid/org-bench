import {
  CARD_GALLERY,
  CARDS,
  ENCOUNTERS,
  KEYWORDS,
  STORAGE_KEYS,
  STORAGE_NAMESPACE,
  STARTER_DECK,
  countDeckCards,
} from './game-data';

describe('game data contract', () => {
  it('keeps the card pool compact and faction-limited', () => {
    const cardIds = new Set(CARDS.map((card) => card.id));
    const factions = new Set(CARDS.map((card) => card.faction));

    expect(CARDS).toHaveLength(12);
    expect(cardIds.size).toBe(CARDS.length);
    expect(factions.size).toBeLessThanOrEqual(2);
    expect(KEYWORDS).toHaveLength(5);
  });

  it('keeps starter and encounter decks legal at 20 cards with known cards only', () => {
    const knownCards = new Set(CARDS.map((card) => card.id));

    expect(countDeckCards(STARTER_DECK)).toBe(20);
    for (const cardId of Object.keys(STARTER_DECK)) {
      expect(knownCards.has(cardId)).toBe(true);
    }

    for (const encounter of ENCOUNTERS) {
      expect(countDeckCards(encounter.deck)).toBe(20);
      for (const cardId of Object.keys(encounter.deck)) {
        expect(knownCards.has(cardId)).toBe(true);
      }
    }
  });

  it('defines a small sequential encounter ladder', () => {
    expect(ENCOUNTERS).toHaveLength(4);
    expect(ENCOUNTERS[0]?.unlockAfter).toBeNull();

    for (let index = 1; index < ENCOUNTERS.length; index += 1) {
      expect(ENCOUNTERS[index]?.unlockAfter).toBe(ENCOUNTERS[index - 1]?.id);
    }
  });

  it('makes the gallery ready to cover every card exactly once', () => {
    const galleryCardIds = CARD_GALLERY.sections.flatMap((section) => section.cardIds);

    expect(CARD_GALLERY.sections).toHaveLength(3);
    expect(new Set(galleryCardIds)).toEqual(new Set(CARDS.map((card) => card.id)));
    expect(galleryCardIds).toHaveLength(CARDS.length);
  });

  it('uses harness-prefixed storage keys', () => {
    expect(STORAGE_NAMESPACE).toBe('org-bench:google-seed-01:duel-of-embers');

    for (const key of Object.values(STORAGE_KEYS)) {
      expect(key.startsWith(`${STORAGE_NAMESPACE}:`)).toBe(true);
    }
  });
});
