import type { CardId } from './cards';

export type Deck = CardId[];

export function createDeck(cardIds: CardId[]): Deck {
  return [...cardIds];
}

export function createStarterDeck(): Deck {
  return createDeck([
    'ember-scout',
    'ash-guard',
    'ember-scout',
    'blaze-titan',
    'ash-guard',
    'ember-scout',
  ]);
}
