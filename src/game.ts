function clampHealth(value: number) {
  return Math.max(0, value);
}

export type BattleState = {
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

export function createInitialState(): BattleState {
  return {
    status: 'active',
    turn: 'player',
    player: {
      hp: 30,
      shielded: false,
    },
    enemy: {
      hp: 24,
    },
    log: ['A rogue AI challenger enters the signal arena.'],
  };
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
