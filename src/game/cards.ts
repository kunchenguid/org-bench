export type CardId = 'ember-scout' | 'ash-guard' | 'blaze-titan';

export type CardDefinition = {
  id: CardId;
  name: string;
  cost: number;
  attack: number;
  health: number;
};

export const cards: Record<CardId, CardDefinition> = {
  'ember-scout': {
    id: 'ember-scout',
    name: 'Ember Scout',
    cost: 1,
    attack: 1,
    health: 1,
  },
  'ash-guard': {
    id: 'ash-guard',
    name: 'Ash Guard',
    cost: 2,
    attack: 2,
    health: 3,
  },
  'blaze-titan': {
    id: 'blaze-titan',
    name: 'Blaze Titan',
    cost: 3,
    attack: 4,
    health: 4,
  },
};
