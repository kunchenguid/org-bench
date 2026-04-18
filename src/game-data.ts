import { cardLibrary, type CardDefinition } from './cards';

export const CARDS = cardLibrary;

export type StorageKeys = {
  profile: string;
  campaign: string;
  decks: string;
};

export function createStorageKeys(namespace: string): StorageKeys {
  return {
    profile: `${namespace}:profile`,
    campaign: `${namespace}:campaign`,
    decks: `${namespace}:decks`,
  };
}

export type DeckList = Record<string, number>;

export const STARTER_DECK: DeckList = {
  'lantern-initiate': 2,
  'ashen-battlemage': 2,
  'cinder-lancer': 2,
  'phoenix-vow': 1,
  'molten-colossus': 1,
  'ashfall-rite': 2,
  'tidal-archivist': 2,
  'moonpool-sage': 2,
  'shellguard-ray': 2,
  'reef-whisper': 2,
  fogweave: 1,
  'undertow-leviathan': 1,
};

export type EncounterDefinition = {
  id: string;
  name: string;
  unlockAfter: string | null;
  deck: DeckList;
  summary: string;
};

export const ENCOUNTERS: EncounterDefinition[] = [
  {
    id: 'ember-vanguard',
    name: 'Ember Vanguard',
    unlockAfter: null,
    summary: 'A fast Ember Covenant patrol that pressures early with cheap creatures and burn.',
    deck: {
      'lantern-initiate': 4,
      'ashen-battlemage': 4,
      'cinder-lancer': 4,
      'ashfall-rite': 4,
      'molten-colossus': 2,
      'phoenix-vow': 2,
    },
  },
  {
    id: 'tidemark-shell',
    name: 'Tidemark Shell',
    unlockAfter: 'ember-vanguard',
    summary: 'A slower Tidemark Circle rival that stabilizes with durable blockers and card flow.',
    deck: {
      'reef-whisper': 4,
      'tidal-archivist': 4,
      'moonpool-sage': 4,
      'shellguard-ray': 4,
      fogweave: 2,
      'undertow-leviathan': 2,
    },
  },
  {
    id: 'confluence-duelists',
    name: 'Confluence Duelists',
    unlockAfter: 'tidemark-shell',
    summary: 'The midpoint encounter mixes Ember tempo tools with Tidemark setup creatures.',
    deck: {
      'lantern-initiate': 2,
      'ashen-battlemage': 2,
      'cinder-lancer': 2,
      'ashfall-rite': 2,
      'tidal-archivist': 2,
      'moonpool-sage': 2,
      'shellguard-ray': 2,
      'reef-whisper': 2,
      fogweave: 2,
      'undertow-leviathan': 2,
    },
  },
  {
    id: 'leviathan-covenant',
    name: 'Leviathan Covenant',
    unlockAfter: 'confluence-duelists',
    summary: 'The final encounter leans on both factions and closes with six-cost finishers.',
    deck: {
      'lantern-initiate': 2,
      'ashen-battlemage': 2,
      'cinder-lancer': 2,
      'phoenix-vow': 1,
      'molten-colossus': 1,
      'ashfall-rite': 2,
      'tidal-archivist': 2,
      'moonpool-sage': 2,
      'shellguard-ray': 2,
      'reef-whisper': 1,
      fogweave: 1,
      'undertow-leviathan': 2,
    },
  },
];

export const CARD_GALLERY = {
  sections: [
    {
      id: 'ember-covenant',
      title: 'Ember Covenant',
      description: 'Aggressive fire mages, soldiers, and direct-damage spells.',
      cardIds: cardLibrary.filter((card) => card.faction === 'Ember Covenant').map((card) => card.id),
    },
    {
      id: 'tidemark-circle',
      title: 'Tidemark Circle',
      description: 'Protective sea mages with card flow and durable late-game bodies.',
      cardIds: cardLibrary.filter((card) => card.faction === 'Tidemark Circle').map((card) => card.id),
    },
    {
      id: 'field-guide',
      title: 'Field Guide',
      description: 'Reference section for deckbuilding, encounter rewards, and keyword reminders.',
      cardIds: [],
    },
  ],
};

export function countDeckCards(deck: DeckList): number {
  return Object.values(deck).reduce((total, copies) => total + copies, 0);
}

export function getCardById(cardId: string): CardDefinition | undefined {
  return cardLibrary.find((card) => card.id === cardId);
}
