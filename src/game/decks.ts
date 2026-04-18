import type { CardId } from './cards';

export type Deck = CardId[];

export function createDeck(cardIds: CardId[]): Deck {
  return [...cardIds];
}

export function createStarterDeck(): Deck {
  return createDeck([
    'lantern-initiate',
    'lantern-initiate',
    'ashen-battlemage',
    'ashen-battlemage',
    'cinder-lancer',
    'cinder-lancer',
    'phoenix-vow',
    'molten-colossus',
    'ashfall-rite',
    'ashfall-rite',
    'tidal-archivist',
    'tidal-archivist',
    'moonpool-sage',
    'moonpool-sage',
    'shellguard-ray',
    'shellguard-ray',
    'reef-whisper',
    'reef-whisper',
    'fogweave',
    'undertow-leviathan',
  ]);
}
