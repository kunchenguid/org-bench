import {
  CARD_GALLERY,
  CARDS,
  ENCOUNTERS,
  STARTER_DECK,
  countDeckCards,
  createStorageKeys,
} from './game-data';
import { cardLibrary } from './cards';

describe('game data contract', () => {
  it('reuses the canonical shared card library', () => {
    const cardIds = new Set(CARDS.map((card) => card.id));
    const factions = new Set(CARDS.map((card) => card.faction));

    expect(CARDS).toBe(cardLibrary);
    expect(CARDS).toHaveLength(12);
    expect(cardIds.size).toBe(CARDS.length);
    expect(factions).toEqual(new Set(['Ember Covenant', 'Tidemark Circle']));
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

  it('builds storage keys from an injected namespace', () => {
    const storageKeys = createStorageKeys('org-bench:test-run');

    expect(storageKeys).toEqual({
      profile: 'org-bench:test-run:profile',
      campaign: 'org-bench:test-run:campaign',
      decks: 'org-bench:test-run:decks',
    });
  });
});
