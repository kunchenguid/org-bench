function clampHealth(value: number) {
  return Math.max(0, value);
}

const encounters = [
  {
    name: 'Rogue AI challenger',
    enemyHp: 24,
  },
  {
    name: 'Apex Mirror',
    enemyHp: 30,
  },
] as const;

export type BattleState = {
  encounterIndex: number;
  status: 'active' | 'won';
  turn: 'player' | 'enemy' | 'complete';
  player: {
    hp: number;
    shielded: boolean;
  };
  enemy: {
    hp: number;
  };
  log: string[];
};

function createEncounterState(encounterIndex: number, playerHp = 30): BattleState {
  const encounter = encounters[encounterIndex] ?? encounters[encounters.length - 1];

  return {
    encounterIndex,
    status: 'active',
    turn: 'player',
    player: {
      hp: playerHp,
      shielded: false,
    },
    enemy: {
      hp: encounter.enemyHp,
    },
    log: [`${encounter.name} enters the signal arena.`],
  };
}

export function createInitialState(): BattleState {
  return createEncounterState(0);
}

function finishIfWon(state: BattleState): BattleState {
  if (state.enemy.hp > 0) {
    return state;
  }

  return {
    ...state,
    status: 'won',
    turn: 'complete',
    enemy: {
      ...state.enemy,
      hp: 0,
    },
    log: [...state.log, 'The rogue AI collapses under your strike.'],
  };
}

export function performPlayerAction(state: BattleState, action: 'attack' | 'defend'): BattleState {
  if (state.status !== 'active' || state.turn !== 'player') {
    return state;
  }

  if (action === 'attack') {
    const next = {
      ...state,
      turn: 'enemy' as const,
      enemy: {
        ...state.enemy,
        hp: clampHealth(state.enemy.hp - 6),
      },
      log: [...state.log, 'You strike first and crack the AI shell for 6 damage.'],
    };

    return finishIfWon(next);
  }

  return {
    ...state,
    turn: 'enemy',
    player: {
      ...state.player,
      shielded: true,
    },
    log: [...state.log, 'You brace and bank shield charge for the counter hit.'],
  };
}

export function resolveEnemyTurn(state: BattleState): BattleState {
  if (state.status !== 'active' || state.turn !== 'enemy') {
    return state;
  }

  const damage = state.player.shielded ? 3 : 6;

  return {
    ...state,
    turn: 'player',
    player: {
      hp: clampHealth(state.player.hp - damage),
      shielded: false,
    },
    log: [...state.log, `The AI fires back for ${damage} damage.`],
  };
}

export function advanceEncounter(state: BattleState): BattleState {
  if (state.status !== 'won') {
    return state;
  }

  const nextEncounterIndex = Math.min(state.encounterIndex + 1, encounters.length - 1);
  const next = createEncounterState(nextEncounterIndex, state.player.hp);

  return {
    ...next,
    log: [...next.log, `${encounters[nextEncounterIndex].name} is ready for the next duel.`],
  };
}

export function serializeBattleState(state: BattleState): string {
  return JSON.stringify(state);
}

export function deserializeBattleState(serializedState: string): BattleState {
  return JSON.parse(serializedState) as BattleState;
}
