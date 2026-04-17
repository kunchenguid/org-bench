export type FactionId = 'ember' | 'tide';
export type KeywordId = 'guard' | 'charge' | 'swift' | 'burn' | 'flow' | 'shield';

export type KeywordDefinition = {
  id: KeywordId;
  name: string;
  reminderText: string;
};

type CardBase = {
  id: string;
  name: string;
  faction: FactionId;
  cost: number;
  text: string;
  keywords: KeywordId[];
};

export type CreatureCard = CardBase & {
  kind: 'creature';
  attack: number;
  health: number;
};

export type SpellCard = CardBase & {
  kind: 'spell';
};

export type CardDefinition = CreatureCard | SpellCard;

export type DeckEntry = {
  cardId: string;
  count: number;
};

export type StarterDeck = {
  id: string;
  name: string;
  faction: FactionId;
  summary: string;
  cards: DeckEntry[];
};

export const keywordGlossary: KeywordDefinition[] = [
  { id: 'guard', name: 'Guard', reminderText: 'Enemies must attack this creature first.' },
  { id: 'charge', name: 'Charge', reminderText: 'This creature can attack the turn it is played.' },
  { id: 'swift', name: 'Swift', reminderText: 'This creature can move first during combat timing checks.' },
  { id: 'burn', name: 'Burn', reminderText: 'Deal the listed damage directly when the effect resolves.' },
  { id: 'flow', name: 'Flow', reminderText: 'Gain the bonus if you played another card this turn.' },
  { id: 'shield', name: 'Shield', reminderText: 'Prevent the next damage this unit would take each turn.' },
];

export const cardLibrary: CardDefinition[] = [
  {
    id: 'ember-scout',
    name: 'Ember Scout',
    faction: 'ember',
    kind: 'creature',
    cost: 1,
    attack: 2,
    health: 1,
    keywords: ['charge'],
    text: 'A fast opener that pressures life totals early.',
  },
  {
    id: 'cinder-guard',
    name: 'Cinder Guard',
    faction: 'ember',
    kind: 'creature',
    cost: 2,
    attack: 2,
    health: 3,
    keywords: ['guard'],
    text: 'Holds the line while the rest of the squad attacks around it.',
  },
  {
    id: 'ashen-duelist',
    name: 'Ashen Duelist',
    faction: 'ember',
    kind: 'creature',
    cost: 2,
    attack: 3,
    health: 2,
    keywords: [],
    text: 'Straight-rate attacker for the aggressive curve.',
  },
  {
    id: 'blazehowl-raider',
    name: 'Blazehowl Raider',
    faction: 'ember',
    kind: 'creature',
    cost: 3,
    attack: 4,
    health: 2,
    keywords: ['charge'],
    text: 'Crashes in immediately to convert tempo into damage.',
  },
  {
    id: 'forge-sentinel',
    name: 'Forge Sentinel',
    faction: 'ember',
    kind: 'creature',
    cost: 4,
    attack: 4,
    health: 5,
    keywords: ['guard'],
    text: 'A durable top-end body that protects smaller attackers.',
  },
  {
    id: 'coalburst',
    name: 'Coalburst',
    faction: 'ember',
    kind: 'spell',
    cost: 1,
    keywords: ['burn'],
    text: 'Deal 2 damage to any target.',
  },
  {
    id: 'flare-up',
    name: 'Flare Up',
    faction: 'ember',
    kind: 'spell',
    cost: 2,
    keywords: ['burn', 'flow'],
    text: 'Deal 3 damage. Flow: deal 4 instead.',
  },
  {
    id: 'war-drum',
    name: 'War Drum',
    faction: 'ember',
    kind: 'spell',
    cost: 3,
    keywords: [],
    text: 'Creatures you control get +1 attack this turn.',
  },
  {
    id: 'mist-lantern',
    name: 'Mist Lantern',
    faction: 'tide',
    kind: 'creature',
    cost: 1,
    attack: 1,
    health: 2,
    keywords: ['flow'],
    text: 'Smooths out sequencing for multi-card turns.',
  },
  {
    id: 'reef-defender',
    name: 'Reef Defender',
    faction: 'tide',
    kind: 'creature',
    cost: 2,
    attack: 1,
    health: 4,
    keywords: ['guard', 'shield'],
    text: 'A wall that buys time for value plays.',
  },
  {
    id: 'current-dancer',
    name: 'Current Dancer',
    faction: 'tide',
    kind: 'creature',
    cost: 2,
    attack: 2,
    health: 2,
    keywords: ['swift'],
    text: 'Flexible attacker that fits cleanly into trick-heavy turns.',
  },
  {
    id: 'wavekeeper',
    name: 'Wavekeeper',
    faction: 'tide',
    kind: 'creature',
    cost: 3,
    attack: 3,
    health: 4,
    keywords: ['shield'],
    text: 'Sticks on board and rewards careful trading.',
  },
  {
    id: 'deep-channel-sage',
    name: 'Deep Channel Sage',
    faction: 'tide',
    kind: 'creature',
    cost: 4,
    attack: 4,
    health: 4,
    keywords: ['flow'],
    text: 'A stable finisher for decks that chain spells together.',
  },
  {
    id: 'tidal-push',
    name: 'Tidal Push',
    faction: 'tide',
    kind: 'spell',
    cost: 1,
    keywords: [],
    text: 'Return an enemy creature with cost 2 or less to its owner hand.',
  },
  {
    id: 'foam-barrier',
    name: 'Foam Barrier',
    faction: 'tide',
    kind: 'spell',
    cost: 2,
    keywords: ['shield'],
    text: 'Give a friendly creature Shield and draw a card.',
  },
  {
    id: 'undertow',
    name: 'Undertow',
    faction: 'tide',
    kind: 'spell',
    cost: 3,
    keywords: ['flow'],
    text: 'Exhaust an enemy creature. Flow: exhaust two instead.',
  },
];

export const cardById: Record<string, CardDefinition> = Object.fromEntries(
  cardLibrary.map((card) => [card.id, card]),
);

export const starterDecks: StarterDeck[] = [
  {
    id: 'ember-vanguard',
    name: 'Ember Vanguard',
    faction: 'ember',
    summary: 'Low-curve pressure backed by direct burn and quick attackers.',
    cards: [
      { cardId: 'ember-scout', count: 3 },
      { cardId: 'cinder-guard', count: 3 },
      { cardId: 'ashen-duelist', count: 3 },
      { cardId: 'blazehowl-raider', count: 3 },
      { cardId: 'forge-sentinel', count: 2 },
      { cardId: 'coalburst', count: 3 },
      { cardId: 'flare-up', count: 2 },
      { cardId: 'war-drum', count: 1 },
    ],
  },
  {
    id: 'tide-anchor',
    name: 'Tide Anchor',
    faction: 'tide',
    summary: 'Board control deck with shields, bounce, and patient finishers.',
    cards: [
      { cardId: 'mist-lantern', count: 3 },
      { cardId: 'reef-defender', count: 3 },
      { cardId: 'current-dancer', count: 3 },
      { cardId: 'wavekeeper', count: 3 },
      { cardId: 'deep-channel-sage', count: 2 },
      { cardId: 'tidal-push', count: 2 },
      { cardId: 'foam-barrier', count: 2 },
      { cardId: 'undertow', count: 2 },
    ],
  },
];

export const deckById: Record<string, CardDefinition> = cardById;
