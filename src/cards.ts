export type CardType = 'Creature' | 'Spell';

export type CardDefinition = {
  id: string;
  name: string;
  faction: 'Ember Covenant' | 'Tidemark Circle';
  type: CardType;
  cost: number;
  stats?: { power: number; health: number };
  rules: string;
  artSeed: 'flame' | 'forge' | 'phoenix' | 'volcano' | 'lantern' | 'ash' | 'wave' | 'moon' | 'shell' | 'reef' | 'mist' | 'current';
};

export const cardLibrary: CardDefinition[] = [
  {
    id: 'ashen-battlemage',
    name: 'Ashen Battlemage',
    faction: 'Ember Covenant',
    type: 'Creature',
    cost: 2,
    stats: { power: 2, health: 2 },
    rules: 'When played, deal 1 damage to the enemy leader.',
    artSeed: 'flame',
  },
  {
    id: 'cinder-lancer',
    name: 'Cinder Lancer',
    faction: 'Ember Covenant',
    type: 'Creature',
    cost: 3,
    stats: { power: 3, health: 2 },
    rules: 'Aggressive frontliner that pressures slower decks.',
    artSeed: 'forge',
  },
  {
    id: 'phoenix-vow',
    name: 'Phoenix Vow',
    faction: 'Ember Covenant',
    type: 'Spell',
    cost: 4,
    rules: 'Restore 3 health to an ally and give it +1 power this turn.',
    artSeed: 'phoenix',
  },
  {
    id: 'molten-colossus',
    name: 'Molten Colossus',
    faction: 'Ember Covenant',
    type: 'Creature',
    cost: 6,
    stats: { power: 6, health: 6 },
    rules: 'Heavy finisher that dominates an open battlefield.',
    artSeed: 'volcano',
  },
  {
    id: 'lantern-initiate',
    name: 'Lantern Initiate',
    faction: 'Ember Covenant',
    type: 'Creature',
    cost: 1,
    stats: { power: 1, health: 2 },
    rules: 'Steady early unit that keeps Ember mana efficient.',
    artSeed: 'lantern',
  },
  {
    id: 'ashfall-rite',
    name: 'Ashfall Rite',
    faction: 'Ember Covenant',
    type: 'Spell',
    cost: 2,
    rules: 'Deal 2 damage to a creature. If it is defeated, draw a card.',
    artSeed: 'ash',
  },
  {
    id: 'tidal-archivist',
    name: 'Tidal Archivist',
    faction: 'Tidemark Circle',
    type: 'Creature',
    cost: 2,
    stats: { power: 1, health: 3 },
    rules: 'When played, look at the top card of your deck and keep it there or send it to the bottom.',
    artSeed: 'wave',
  },
  {
    id: 'moonpool-sage',
    name: 'Moonpool Sage',
    faction: 'Tidemark Circle',
    type: 'Creature',
    cost: 3,
    stats: { power: 2, health: 4 },
    rules: 'Defensive scholar that stabilizes the board for the late game.',
    artSeed: 'moon',
  },
  {
    id: 'shellguard-ray',
    name: 'Shellguard Ray',
    faction: 'Tidemark Circle',
    type: 'Creature',
    cost: 4,
    stats: { power: 3, health: 5 },
    rules: 'Guard unit that protects the Circle while tides build.',
    artSeed: 'shell',
  },
  {
    id: 'reef-whisper',
    name: 'Reef Whisper',
    faction: 'Tidemark Circle',
    type: 'Spell',
    cost: 1,
    rules: 'Draw a card. If you played a spell this turn, gain 1 mana next turn.',
    artSeed: 'reef',
  },
  {
    id: 'fogweave',
    name: 'Fogweave',
    faction: 'Tidemark Circle',
    type: 'Spell',
    cost: 3,
    rules: 'Return an enemy creature with cost 3 or less to its owner hand.',
    artSeed: 'mist',
  },
  {
    id: 'undertow-leviathan',
    name: 'Undertow Leviathan',
    faction: 'Tidemark Circle',
    type: 'Creature',
    cost: 6,
    stats: { power: 5, health: 7 },
    rules: 'Late-game anchor that shrugs off chip damage and closes the duel.',
    artSeed: 'current',
  },
];
