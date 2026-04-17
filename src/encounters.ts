export type EnemyCard = {
  id: string;
  name: string;
  cost: number;
  damage: number;
};

export type Encounter = {
  id: string;
  name: string;
  enemyDeck: EnemyCard[];
};

export type EncounterRun = {
  currentEncounter: Encounter;
  completedEncounterIds: string[];
  isComplete: boolean;
};

export type EncounterOutcome = 'won' | 'lost';

export type EnemyTurnInput = {
  mana: number;
  hand: EnemyCard[];
};

export type EnemyTurnChoice = {
  cardId: string | null;
  damage: number;
  spentMana: number;
};

export const ENCOUNTERS: Encounter[] = [
  {
    id: 'cinder-raider',
    name: 'Cinder Raider',
    enemyDeck: [
      { id: 'ember-swipe', name: 'Ember Swipe', cost: 1, damage: 1 },
      { id: 'raider-warcry', name: 'Raider Warcry', cost: 2, damage: 3 },
      { id: 'bonfire-bolt', name: 'Bonfire Bolt', cost: 3, damage: 4 },
    ],
  },
  {
    id: 'grove-warden',
    name: 'Grove Warden',
    enemyDeck: [
      { id: 'vine-snap', name: 'Vine Snap', cost: 1, damage: 2 },
      { id: 'rooted-guard', name: 'Rooted Guard', cost: 2, damage: 2 },
      { id: 'canopy-crush', name: 'Canopy Crush', cost: 4, damage: 5 },
    ],
  },
  {
    id: 'storm-ascendant',
    name: 'Storm Ascendant',
    enemyDeck: [
      { id: 'spark-jolt', name: 'Spark Jolt', cost: 1, damage: 2 },
      { id: 'static-surge', name: 'Static Surge', cost: 3, damage: 4 },
      { id: 'thunderhead', name: 'Thunderhead', cost: 5, damage: 7 },
    ],
  },
];

export function createEncounterRun(): EncounterRun {
  return {
    currentEncounter: ENCOUNTERS[0],
    completedEncounterIds: [],
    isComplete: false,
  };
}

export function chooseEnemyTurn(input: EnemyTurnInput): EnemyTurnChoice {
  const playableCards = input.hand.filter((card) => card.cost <= input.mana);

  if (playableCards.length === 0) {
    return {
      cardId: null,
      damage: 0,
      spentMana: 0,
    };
  }

  const bestCard = playableCards.reduce((best, card) => {
    if (card.damage > best.damage) {
      return card;
    }

    if (card.damage === best.damage && card.cost > best.cost) {
      return card;
    }

    return best;
  });

  return {
    cardId: bestCard.id,
    damage: bestCard.damage,
    spentMana: bestCard.cost,
  };
}

export function advanceEncounter(run: EncounterRun, outcome: EncounterOutcome): EncounterRun {
  if (outcome === 'lost' || run.isComplete) {
    return run;
  }

  const completedEncounterIds = run.completedEncounterIds.includes(run.currentEncounter.id)
    ? run.completedEncounterIds
    : [...run.completedEncounterIds, run.currentEncounter.id];
  const currentIndex = ENCOUNTERS.findIndex((encounter) => encounter.id === run.currentEncounter.id);
  const nextEncounter = ENCOUNTERS[currentIndex + 1];

  if (!nextEncounter) {
    return {
      currentEncounter: run.currentEncounter,
      completedEncounterIds,
      isComplete: true,
    };
  }

  return {
    currentEncounter: nextEncounter,
    completedEncounterIds,
    isComplete: false,
  };
}
