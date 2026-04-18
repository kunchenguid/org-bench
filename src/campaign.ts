export type DeckCard = {
  name: string;
  count: number;
};

export type Encounter = {
  id: string;
  name: string;
  opponent: string;
  summary: string;
  playerDeck: {
    name: string;
    cards: DeckCard[];
  };
  enemyDeck: {
    name: string;
    cards: DeckCard[];
  };
  aiPlan: string[];
};

export const ladderEncounters: Encounter[] = [
  {
    id: 'cinder-bridge-ambush',
    name: 'Cinder Bridge Ambush',
    opponent: 'Ash Courier Serin',
    summary: 'Open the ladder against a low-curve Ember patrol that tries to win before shields matter.',
    playerDeck: {
      name: 'Forgeheart Starter',
      cards: [
        { name: 'Spark Initiate', count: 4 },
        { name: 'Forgeblade Adept', count: 4 },
        { name: 'Boiling Volley', count: 3 },
        { name: 'Cinder Banner', count: 2 }
      ]
    },
    enemyDeck: {
      name: 'Bridge Raiders',
      cards: [
        { name: 'Coal Runner', count: 4 },
        { name: 'Torchline Skirmisher', count: 4 },
        { name: 'Flashfire', count: 3 },
        { name: 'Bridge Tax', count: 2 }
      ]
    },
    aiPlan: [
      'Play the cheapest pressure unit first.',
      'Use burn on blockers before sending attacks face.',
      'Spend all mana each turn unless lethal is already on board.'
    ]
  },
  {
    id: 'skyrail-siege',
    name: 'Skyrail Siege',
    opponent: 'Rail Warden Ilya',
    summary: 'Mid-ladder defense duel against an Aether shell that stabilizes with shields and evasive threats.',
    playerDeck: {
      name: 'Stormglass Tempo',
      cards: [
        { name: 'Static Diver', count: 4 },
        { name: 'Skyglass Tactician', count: 3 },
        { name: 'Phase Barrier', count: 3 },
        { name: 'Recall Pulse', count: 2 }
      ]
    },
    enemyDeck: {
      name: 'Siege Ward',
      cards: [
        { name: 'Rail Sentinel', count: 4 },
        { name: 'Aegis Drone', count: 4 },
        { name: 'Static Lock', count: 3 },
        { name: 'Vaultbeam', count: 2 }
      ]
    },
    aiPlan: [
      'Deploy one shield unit before any expensive attacker.',
      'Hold removal for the strongest opposing flier.',
      'If health is ahead, attack with evasive units before trading on board.'
    ]
  },
  {
    id: 'the-glass-throne',
    name: 'The Glass Throne',
    opponent: 'Archon Vael',
    summary: 'Final boss encounter with a mixed Ember-Aether list that pivots from control into lethal burn.',
    playerDeck: {
      name: 'Ashen Crown',
      cards: [
        { name: 'Ember Duelist', count: 4 },
        { name: 'Mirrorwing Sage', count: 3 },
        { name: 'Phoenix Circuit', count: 3 },
        { name: 'Last Spark', count: 2 }
      ]
    },
    enemyDeck: {
      name: 'Throne Protocol',
      cards: [
        { name: 'Glass Archivist', count: 4 },
        { name: 'Crownfire Golem', count: 3 },
        { name: 'Prism Rebuke', count: 3 },
        { name: 'Royal Inferno', count: 2 }
      ]
    },
    aiPlan: [
      'Remove the highest attack enemy each turn before developing a finisher.',
      'If lethal burn is available, cast it before developing.',
      'Only swing with the boss unit when at least one blocker remains back.'
    ]
  }
];
