export type CreatureCard = {
  id: string;
  type: 'creature';
  cost: number;
  attack: number;
  health: number;
};

export type SpellCard = {
  id: string;
  type: 'spell';
  cost: number;
  damage: number;
};

export type AiCard = CreatureCard | SpellCard;

export type BoardUnit = {
  id: string;
  attack: number;
  health: number;
  canAttack?: boolean;
  guard?: boolean;
};

export type AiState = {
  turn: number;
  mana: number;
  aiHealth: number;
  playerHealth: number;
  hand: AiCard[];
  board: BoardUnit[];
  enemyBoard: BoardUnit[];
};

export type EncounterBehavior = {
  aggression: number;
  spellBias: number;
  reserveMana: number;
  variationSeed: number;
};

export type DeployDecision = {
  cardId: string;
  reason: 'highest-pressure-creature';
};

export type SpellDecision = {
  cardId: string;
  target: 'enemy-hero' | string;
  reason: 'lethal-spell' | 'board-removal';
};

export type AttackDecision = {
  attackerId: string;
  target: 'enemy-hero' | string;
  reason: 'clear-guard' | 'pick-trade' | 'push-face';
};

export type AiPlan = {
  deploy?: DeployDecision;
  spell?: SpellDecision;
  attacks: AttackDecision[];
};

const defaultEncounterBehavior: EncounterBehavior = {
  aggression: 0.65,
  spellBias: 0.5,
  reserveMana: 0,
  variationSeed: 0,
};

export function createEncounterBehavior(
  overrides: Partial<EncounterBehavior> = {},
): EncounterBehavior {
  return {
    ...defaultEncounterBehavior,
    ...overrides,
  };
}

export function chooseAiPlan(state: AiState, encounter: EncounterBehavior): AiPlan {
  const spell = chooseSpell(state, encounter);
  const manaAfterSpell = state.mana - (spell ? getCardById(state.hand, spell.cardId)?.cost ?? 0 : 0);

  return {
    spell,
    deploy: chooseDeploy(state, encounter, manaAfterSpell),
    attacks: chooseAttacks(state, encounter),
  };
}

function chooseDeploy(
  state: AiState,
  encounter: EncounterBehavior,
  availableMana: number,
): DeployDecision | undefined {
  const spendableMana = Math.max(0, availableMana - encounter.reserveMana);
  const creatures = state.hand.filter(
    (card): card is CreatureCard => card.type === 'creature' && card.cost <= spendableMana,
  );

  const best = pickBest(creatures, encounter, (card) => card.attack * 3 + card.health * 2 + card.cost);

  if (!best) {
    return undefined;
  }

  return {
    cardId: best.id,
    reason: 'highest-pressure-creature',
  };
}

function chooseSpell(state: AiState, encounter: EncounterBehavior): SpellDecision | undefined {
  const spells = state.hand.filter(
    (card): card is SpellCard => card.type === 'spell' && card.cost <= state.mana,
  );

  const lethal = pickBest(
    spells.filter((card) => card.damage >= state.playerHealth),
    encounter,
    (card) => 1000 + card.damage,
  );

  if (lethal) {
    return {
      cardId: lethal.id,
      target: 'enemy-hero',
      reason: 'lethal-spell',
    };
  }

  if (encounter.spellBias < 0.6 || state.enemyBoard.length === 0) {
    return undefined;
  }

  const removals = spells.flatMap((card) =>
    state.enemyBoard
      .filter((unit) => unit.health <= card.damage)
      .map((unit) => ({
        card,
        unit,
        score: unit.attack * 3 + unit.health,
      })),
  );

  const bestRemoval = pickBest(removals, encounter, (entry) => entry.score + entry.card.damage);

  if (!bestRemoval) {
    return undefined;
  }

  return {
    cardId: bestRemoval.card.id,
    target: bestRemoval.unit.id,
    reason: 'board-removal',
  };
}

function chooseAttacks(state: AiState, encounter: EncounterBehavior): AttackDecision[] {
  const attackers = [...state.board]
    .filter((unit) => unit.canAttack !== false)
    .sort((left, right) => right.attack - left.attack || compareStable(left.id, right.id));
  const guards = state.enemyBoard.filter((unit) => unit.guard);

  if (guards.length > 0) {
    const guardTarget = pickBest(guards, encounter, (unit) => unit.attack * 3 + unit.health);
    if (!guardTarget) {
      return [];
    }

    return attackers.map((attacker) => ({
      attackerId: attacker.id,
      target: guardTarget.id,
      reason: 'clear-guard',
    }));
  }

  return attackers.map((attacker) => {
    const tradeTarget = pickBest(
      state.enemyBoard.filter((unit) => unit.health <= attacker.attack),
      encounter,
      (unit) => unit.attack * (1 - encounter.aggression) * 4 + unit.health,
    );

    if (tradeTarget && encounter.aggression < 0.55) {
      return {
        attackerId: attacker.id,
        target: tradeTarget.id,
        reason: 'pick-trade' as const,
      };
    }

    return {
      attackerId: attacker.id,
      target: 'enemy-hero' as const,
      reason: 'push-face' as const,
    };
  });
}

function pickBest<T>(
  items: T[],
  encounter: EncounterBehavior,
  score: (item: T) => number,
): T | undefined {
  return [...items].sort((left, right) => {
    const delta = score(right) - score(left);
    if (delta !== 0) {
      return delta;
    }

    return seededRank(left, encounter) - seededRank(right, encounter);
  })[0];
}

function seededRank(item: unknown, encounter: EncounterBehavior): number {
  return hashString(`${encounter.variationSeed}:${getStableKey(item)}`);
}

function getStableKey(item: unknown): string {
  if (typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string') {
    return item.id;
  }

  return JSON.stringify(item);
}

function getCardById(hand: AiCard[], cardId: string): AiCard | undefined {
  return hand.find((card) => card.id === cardId);
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right);
}
