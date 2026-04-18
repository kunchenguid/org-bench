import { cardLibrary, type CardDefinition } from '../cards';

export type CardId = CardDefinition['id'];

export type UnitCard = CardDefinition & {
  type: 'Creature';
  stats: { power: number; health: number };
};

export function getCard(cardId: CardId): CardDefinition | undefined {
  return cardLibrary.find((card) => card.id === cardId);
}

export function getUnitCard(cardId: CardId): UnitCard | undefined {
  const card = getCard(cardId);
  if (!card || card.type !== 'Creature' || !card.stats) {
    return undefined;
  }

  return card;
}
