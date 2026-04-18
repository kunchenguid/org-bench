import { cardPool, factions, type CardDefinition as GameCardDefinition, type FactionId } from '../game/content';

export type CardFaction = 'Skyforge' | 'Wildroot';

export type CardType = 'Creature' | 'Spell';

export type CardDefinition = {
  name: string;
  faction: CardFaction;
  type: CardType;
  cost: number;
  text: string;
  attack?: number;
  health?: number;
};

export type FactionSummary = {
  faction: CardFaction;
  blurb: string;
  creatureCount: number;
  spellCount: number;
};

const factionLabels: Record<FactionId, CardFaction> = {
  skyforge: 'Skyforge',
  wildroot: 'Wildroot',
};

export const cardCatalog: CardDefinition[] = cardPool.map((card) => ({
  name: card.name,
  faction: factionLabels[card.factionId],
  type: toCardType(card),
  cost: card.cost,
  text: card.text,
  attack: card.attack,
  health: card.health,
}));

const factionBlurbs: Record<CardFaction, string> = {
  Skyforge: factions.find((faction) => faction.id === 'skyforge')?.theme ?? '',
  Wildroot: factions.find((faction) => faction.id === 'wildroot')?.theme ?? '',
};

export function getCardsByFaction(faction: CardFaction): CardDefinition[] {
  return cardCatalog.filter((card) => card.faction === faction);
}

export function getFactionSummaries(): FactionSummary[] {
  return (Object.keys(factionBlurbs) as CardFaction[]).map((faction) => {
    const cards = getCardsByFaction(faction);

    return {
      faction,
      blurb: factionBlurbs[faction],
      creatureCount: cards.filter((card) => card.type === 'Creature').length,
      spellCount: cards.filter((card) => card.type === 'Spell').length,
    };
  });
}

function toCardType(card: GameCardDefinition): CardType {
  return card.type === 'creature' ? 'Creature' : 'Spell';
}
