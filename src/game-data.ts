export type Faction = 'Ashfall Covenant' | 'Verdant Loom';

export type CardType = 'unit' | 'spell';

export type Keyword = 'Ambush' | 'Guard' | 'Renew' | 'Overrun';

export type Card = {
  id: string;
  name: string;
  faction: Faction;
  type: CardType;
  cost: number;
  attack?: number;
  health?: number;
  keywords: Keyword[];
  text: string;
};

export type DeckEntry = {
  cardId: string;
  count: number;
};

export type Deck = {
  id: string;
  name: string;
  faction: Faction;
  style: string;
  list: DeckEntry[];
};

export type EncounterVariant = {
  id: string;
  name: string;
  enemyDeckId: Deck['id'];
  twist: string;
  reward: string;
};

export type EncounterStep = {
  step: number;
  title: string;
  purpose: string;
  variants: EncounterVariant[];
};

// Balance notes: the set stays intentionally compact, with four evergreen keywords and
// mirrored deck sizes so either faction can anchor the same three-step campaign ladder.
export const keywordGlossary: Array<{ keyword: Keyword; reminder: string }> = [
  { keyword: 'Ambush', reminder: 'This unit can attack on the turn it enters play.' },
  { keyword: 'Guard', reminder: 'Enemy attacks must target this unit before your champion.' },
  {
    keyword: 'Renew',
    reminder: 'The first time this unit is defeated each duel, return it to your hand at end of turn.',
  },
  { keyword: 'Overrun', reminder: 'Excess combat damage also hits the opposing champion.' },
];

export const cards: Card[] = [
  {
    id: 'emberling-raider',
    name: 'Emberling Raider',
    faction: 'Ashfall Covenant',
    type: 'unit',
    cost: 1,
    attack: 2,
    health: 1,
    keywords: ['Ambush'],
    text: 'A one-drop that forces early trades and keeps the ember deck proactive.',
  },
  {
    id: 'furnace-vicar',
    name: 'Furnace Vicar',
    faction: 'Ashfall Covenant',
    type: 'unit',
    cost: 2,
    attack: 2,
    health: 3,
    keywords: [],
    text: 'On play, another ally gets +1 attack this turn.',
  },
  {
    id: 'ash-scar-lancer',
    name: 'Ash-Scar Lancer',
    faction: 'Ashfall Covenant',
    type: 'unit',
    cost: 3,
    attack: 4,
    health: 2,
    keywords: ['Ambush'],
    text: 'Fast pressure piece that punishes stalled boards but folds to clean defense.',
  },
  {
    id: 'brandsworn-sentinel',
    name: 'Brandsworn Sentinel',
    faction: 'Ashfall Covenant',
    type: 'unit',
    cost: 3,
    attack: 3,
    health: 4,
    keywords: ['Guard'],
    text: 'Stabilizes the otherwise fragile ember curve and protects ambush follow-ups.',
  },
  {
    id: 'cinderstorm-gambit',
    name: 'Cinderstorm Gambit',
    faction: 'Ashfall Covenant',
    type: 'spell',
    cost: 2,
    keywords: [],
    text: 'Deal 2 damage to a unit. If you control an Ambush unit, draw a card.',
  },
  {
    id: 'verdict-of-cinders',
    name: 'Verdict of Cinders',
    faction: 'Ashfall Covenant',
    type: 'spell',
    cost: 4,
    keywords: [],
    text: 'Deal 4 damage to a unit or 2 damage to every enemy Guard unit.',
  },
  {
    id: 'mosswoven-pup',
    name: 'Mosswoven Pup',
    faction: 'Verdant Loom',
    type: 'unit',
    cost: 1,
    attack: 1,
    health: 3,
    keywords: [],
    text: 'When this survives combat, heal your champion 1.',
  },
  {
    id: 'rootwall-keeper',
    name: 'Rootwall Keeper',
    faction: 'Verdant Loom',
    type: 'unit',
    cost: 2,
    attack: 1,
    health: 5,
    keywords: ['Guard'],
    text: 'Primary early blocker that buys time for the growth deck to scale.',
  },
  {
    id: 'canopy-shepherd',
    name: 'Canopy Shepherd',
    faction: 'Verdant Loom',
    type: 'unit',
    cost: 3,
    attack: 3,
    health: 3,
    keywords: ['Renew'],
    text: 'Reliable midgame value body that keeps Verdant hands from running dry.',
  },
  {
    id: 'thornback-behemoth',
    name: 'Thornback Behemoth',
    faction: 'Verdant Loom',
    type: 'unit',
    cost: 4,
    attack: 4,
    health: 5,
    keywords: ['Overrun'],
    text: 'Top-end closer that converts thick boards into champion damage.',
  },
  {
    id: 'bloom-surge',
    name: 'Bloom Surge',
    faction: 'Verdant Loom',
    type: 'spell',
    cost: 2,
    keywords: [],
    text: 'Give a unit +2/+2 this duel. If it has Guard, heal your champion 2.',
  },
  {
    id: 'remembrance-rite',
    name: 'Remembrance Rite',
    faction: 'Verdant Loom',
    type: 'spell',
    cost: 3,
    keywords: [],
    text: 'Return a defeated unit that costs 3 or less to your hand. Draw if it had Renew.',
  },
];

export const decks: Deck[] = [
  {
    id: 'covenant-blitz',
    name: 'Covenant Blitz',
    faction: 'Ashfall Covenant',
    style: 'Low curve, repeated Ambush threats, and burn that clears a path.',
    list: [
      { cardId: 'emberling-raider', count: 4 },
      { cardId: 'furnace-vicar', count: 4 },
      { cardId: 'ash-scar-lancer', count: 3 },
      { cardId: 'brandsworn-sentinel', count: 3 },
      { cardId: 'cinderstorm-gambit', count: 3 },
      { cardId: 'verdict-of-cinders', count: 3 },
    ],
  },
  {
    id: 'loom-bastion',
    name: 'Loom Bastion',
    faction: 'Verdant Loom',
    style: 'Absorb the early game, recur efficient bodies, then win with a single oversized lane.',
    list: [
      { cardId: 'mosswoven-pup', count: 4 },
      { cardId: 'rootwall-keeper', count: 4 },
      { cardId: 'canopy-shepherd', count: 4 },
      { cardId: 'thornback-behemoth', count: 3 },
      { cardId: 'bloom-surge', count: 3 },
      { cardId: 'remembrance-rite', count: 2 },
    ],
  },
];

// Ladder structure: opener tests pacing, midpoint tests adaptation, finale tests mastery.
export const encounterLadder: EncounterStep[] = [
  {
    step: 1,
    title: 'Border Skirmish',
    purpose: 'Teach the player the speed difference between the two factions.',
    variants: [
      {
        id: 'smuggler-pyre',
        name: 'Smuggler Pyre',
        enemyDeckId: 'covenant-blitz',
        twist: 'The enemy discounts the first Ambush card they play each duel by 1.',
        reward: 'Start the next duel with one bonus mulligan.',
      },
      {
        id: 'thicket-watch',
        name: 'Thicket Watch',
        enemyDeckId: 'loom-bastion',
        twist: 'The first Guard unit the enemy deploys enters with +0/+1.',
        reward: 'Restore 3 champion health before the next duel.',
      },
    ],
  },
  {
    step: 2,
    title: 'Shrine Breach',
    purpose: 'Force adaptation by pushing one signature mechanic harder than the base deck list does.',
    variants: [
      {
        id: 'ember-reliquary',
        name: 'Ember Reliquary',
        enemyDeckId: 'covenant-blitz',
        twist: 'Whenever the enemy removes a unit with a spell, their weakest unit gains +1 attack.',
        reward: 'Add one flexible sideboard card choice before the finale.',
      },
      {
        id: 'rootbound-basilica',
        name: 'Rootbound Basilica',
        enemyDeckId: 'loom-bastion',
        twist: 'The first Renew unit that returns each duel costs 1 less to replay.',
        reward: 'Scout the final boss variant before queueing into it.',
      },
    ],
  },
  {
    step: 3,
    title: 'Crown Ascent',
    purpose: 'Boss duel with a sharper version of the faction identity and a visible pre-fight tell.',
    variants: [
      {
        id: 'pyre-regent',
        name: 'Pyre Regent',
        enemyDeckId: 'covenant-blitz',
        twist: 'The enemy begins with a Brandsworn Sentinel in play at half health.',
        reward: 'Campaign clear: unlock the ember banner frame.',
      },
      {
        id: 'loom-matriarch',
        name: 'Loom Matriarch',
        enemyDeckId: 'loom-bastion',
        twist: 'The enemy champion heals 2 the first time they trigger Renew each duel.',
        reward: 'Campaign clear: unlock the verdant banner frame.',
      },
    ],
  },
];
