import type { Card, Faction } from '../game-data';
import { createNamespacedStorage } from '../game/persistence';

export type CardGalleryFactionFilter = 'all' | Faction;

type StorageLike = Pick<Storage, 'getItem' | 'key' | 'length' | 'removeItem' | 'setItem'>;

const FILTER_KEY = 'card-gallery-faction';

function isCardGalleryFactionFilter(value: unknown): value is CardGalleryFactionFilter {
  return value === 'all' || value === 'Ashfall Covenant' || value === 'Verdant Loom';
}

export function filterCardsByFaction(cards: Card[], faction: CardGalleryFactionFilter): Card[] {
  if (faction === 'all') {
    return cards;
  }

  return cards.filter((card) => card.faction === faction);
}

export function describeFactionSelection(cards: Card[], faction: CardGalleryFactionFilter): string {
  const visibleCards = filterCardsByFaction(cards, faction);
  const noun = visibleCards.length === 1 ? 'card' : 'cards';

  if (faction === 'all') {
    return `Showing all ${visibleCards.length} ${noun}`;
  }

  return `Showing ${visibleCards.length} ${faction} ${noun}`;
}

export function createCardGalleryPreferences(storage: StorageLike, namespace: string) {
  const session = createNamespacedStorage(storage, namespace);

  return {
    getSelectedFaction(): CardGalleryFactionFilter {
      const value = session.get<string>(FILTER_KEY);
      return isCardGalleryFactionFilter(value) ? value : 'all';
    },
    setSelectedFaction(faction: CardGalleryFactionFilter) {
      session.set(FILTER_KEY, faction);
    },
  };
}
