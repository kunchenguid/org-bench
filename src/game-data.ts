export const STORAGE_NAMESPACE = 'org-bench:google-seed-01:duel-of-embers';

export const STORAGE_KEYS = {
  profile: `${STORAGE_NAMESPACE}:profile`,
  campaign: `${STORAGE_NAMESPACE}:campaign`,
  decks: `${STORAGE_NAMESPACE}:decks`,
} as const;

export const KEYWORDS = ['Guard', 'Ambush', 'Spark', 'Rally', 'Bloom'] as const;

export type Faction = 'embercourt' | 'grove';

export type CardType = 'unit' | 'spell';

export type CardDefinition = {
  id: string;
  name: string;
  faction: Faction;
  type: CardType;
  cost: number;
  attack?: number;
  life?: number;
  keywords: Array<(typeof KEYWORDS)[number]>;
  rulesText: string;
};

export const CARDS: CardDefinition[] = [
  {
    id: 'ember-squire',
    name: 'Ember Squire',
    faction: 'embercourt',
    type: 'unit',
    cost: 1,
    attack: 2,
    life: 1,
    keywords: ['Spark'],
    rulesText: 'Spark - Deal 1 damage to the opposing champion when played.',
  },
  {
    id: 'cinder-guard',
    name: 'Cinder Guard',
    faction: 'embercourt',
    type: 'unit',
    cost: 2,
    attack: 2,
    life: 3,
    keywords: ['Guard'],
    rulesText: 'Guard - Enemies must challenge this first.',
  },
  {
    id: 'banner-captain',
    name: 'Banner Captain',
    faction: 'embercourt',
    type: 'unit',
    cost: 3,
    attack: 3,
    life: 3,
    keywords: ['Rally'],
    rulesText: 'Rally - Your next unit this turn costs 1 less.',
  },
  {
    id: 'flare-hound',
    name: 'Flare Hound',
    faction: 'embercourt',
    type: 'unit',
    cost: 2,
    attack: 3,
    life: 1,
    keywords: ['Ambush'],
    rulesText: 'Ambush - Can attack enemy units the turn it enters play.',
  },
  {
    id: 'sunsteel-colossus',
    name: 'Sunsteel Colossus',
    faction: 'embercourt',
    type: 'unit',
    cost: 5,
    attack: 5,
    life: 5,
    keywords: ['Guard'],
    rulesText: 'A late-game wall that stabilizes the board.',
  },
  {
    id: 'scorching-volley',
    name: 'Scorching Volley',
    faction: 'embercourt',
    type: 'spell',
    cost: 2,
    keywords: ['Spark'],
    rulesText: 'Deal 2 damage to a unit or 1 damage to the opposing champion.',
  },
  {
    id: 'mossling-scout',
    name: 'Mossling Scout',
    faction: 'grove',
    type: 'unit',
    cost: 1,
    attack: 1,
    life: 2,
    keywords: ['Bloom'],
    rulesText: 'Bloom - Gains +1 attack the first time you restore life each duel.',
  },
  {
    id: 'thornveil-stalker',
    name: 'Thornveil Stalker',
    faction: 'grove',
    type: 'unit',
    cost: 2,
    attack: 2,
    life: 2,
    keywords: ['Ambush'],
    rulesText: 'Ambush - Excellent at picking off damaged defenders.',
  },
  {
    id: 'grove-warden',
    name: 'Grove Warden',
    faction: 'grove',
    type: 'unit',
    cost: 3,
    attack: 2,
    life: 4,
    keywords: ['Guard'],
    rulesText: 'Guard - Holds lanes while your board grows wider.',
  },
  {
    id: 'petal-channeler',
    name: 'Petal Channeler',
    faction: 'grove',
    type: 'unit',
    cost: 3,
    attack: 3,
    life: 3,
    keywords: ['Bloom'],
    rulesText: 'Bloom - Restores 1 life to your champion when played.',
  },
  {
    id: 'ancient-oakheart',
    name: 'Ancient Oakheart',
    faction: 'grove',
    type: 'unit',
    cost: 5,
    attack: 4,
    life: 6,
    keywords: ['Guard', 'Bloom'],
    rulesText: 'A resilient finisher that rewards the life-gain package.',
  },
  {
    id: 'wildburst-ritual',
    name: 'Wildburst Ritual',
    faction: 'grove',
    type: 'spell',
    cost: 2,
    keywords: ['Rally'],
    rulesText: 'Give a unit +2 attack this turn. Draw a card if you control two Grove units.',
  },
];

export type DeckList = Record<string, number>;

export const STARTER_DECK: DeckList = {
  'ember-squire': 3,
  'cinder-guard': 3,
  'banner-captain': 2,
  'flare-hound': 3,
  'sunsteel-colossus': 1,
  'scorching-volley': 3,
  'mossling-scout': 2,
  'grove-warden': 2,
  'wildburst-ritual': 1,
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
    id: 'ashfall-vanguard',
    name: 'Ashfall Vanguard',
    unlockAfter: null,
    summary: 'A low-curve Embercourt patrol that teaches early combat trades.',
    deck: {
      'ember-squire': 4,
      'cinder-guard': 4,
      'flare-hound': 4,
      'banner-captain': 2,
      'scorching-volley': 4,
      'sunsteel-colossus': 2,
    },
  },
  {
    id: 'rootwake-circle',
    name: 'Rootwake Circle',
    unlockAfter: 'ashfall-vanguard',
    summary: 'A Grove sustain deck that pressures the player to plan around durable blockers.',
    deck: {
      'mossling-scout': 4,
      'thornveil-stalker': 3,
      'grove-warden': 4,
      'petal-channeler': 3,
      'ancient-oakheart': 2,
      'wildburst-ritual': 4,
    },
  },
  {
    id: 'twilight-concord',
    name: 'Twilight Concord',
    unlockAfter: 'rootwake-circle',
    summary: 'The first mixed-faction rival uses both ambush units and stabilizing guards.',
    deck: {
      'ember-squire': 2,
      'cinder-guard': 2,
      'banner-captain': 2,
      'flare-hound': 2,
      'scorching-volley': 2,
      'mossling-scout': 2,
      'thornveil-stalker': 2,
      'grove-warden': 2,
      'petal-channeler': 2,
      'wildburst-ritual': 2,
    },
  },
  {
    id: 'crown-of-seasons',
    name: 'Crown of Seasons',
    unlockAfter: 'twilight-concord',
    summary: 'The finale combines both factions around larger finishers and tempo swings.',
    deck: {
      'cinder-guard': 3,
      'banner-captain': 2,
      'sunsteel-colossus': 2,
      'scorching-volley': 3,
      'thornveil-stalker': 2,
      'grove-warden': 3,
      'petal-channeler': 3,
      'ancient-oakheart': 2,
    },
  },
];

export const CARD_GALLERY = {
  sections: [
    {
      id: 'embercourt-vanguard',
      title: 'Embercourt Vanguard',
      description: 'Aggressive soldiers, hounds, and direct-damage tactics.',
      cardIds: ['ember-squire', 'cinder-guard', 'banner-captain', 'flare-hound', 'sunsteel-colossus', 'scorching-volley'],
    },
    {
      id: 'grove-covenant',
      title: 'Grove Covenant',
      description: 'Durable wardens and growth-based units that reward life gain.',
      cardIds: ['mossling-scout', 'thornveil-stalker', 'grove-warden', 'petal-channeler', 'ancient-oakheart', 'wildburst-ritual'],
    },
    {
      id: 'field-guide',
      title: 'Field Guide',
      description: 'Reference section for deckbuilding, encounter rewards, and keyword reminders.',
      cardIds: [],
    },
  ],
};

export const countDeckCards = (deck: DeckList) => Object.values(deck).reduce((total, copies) => total + copies, 0);
