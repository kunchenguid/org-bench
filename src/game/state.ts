export type CardDefinition = {
  attack: number;
  cost: number;
  health: number;
  id: string;
  name: string;
};

export type Side = 'enemy' | 'player';

export type PlayerState = {
  battlefield: CardDefinition[];
  deck: CardDefinition[];
  discard: CardDefinition[];
  hand: CardDefinition[];
  health: number;
  maxResources: number;
  resources: number;
};

export type GameState = {
  activePlayer: Side;
  enemy: PlayerState;
  player: PlayerState;
  turn: number;
  winner: Side | null;
};

type CreateGameStateInput = {
  enemyDeck: CardDefinition[];
  playerDeck: CardDefinition[];
  startingHealth?: number;
};

function createPlayerState(deck: CardDefinition[], health: number): PlayerState {
  return {
    battlefield: [],
    deck: [...deck],
    discard: [],
    hand: [],
    health,
    maxResources: 0,
    resources: 0,
  };
}

export function createGameState(input: CreateGameStateInput): GameState {
  const startingHealth = input.startingHealth ?? 20;

  return {
    activePlayer: 'player',
    enemy: createPlayerState(input.enemyDeck, startingHealth),
    player: createPlayerState(input.playerDeck, startingHealth),
    turn: 0,
    winner: null,
  };
}

export function drawCard(state: GameState, side: Side): GameState {
  const currentPlayer = state[side];
  const [drawnCard, ...remainingDeck] = currentPlayer.deck;

  if (!drawnCard) {
    return state;
  }

  return {
    ...state,
    [side]: {
      ...currentPlayer,
      deck: remainingDeck,
      hand: [...currentPlayer.hand, drawnCard],
    },
  };
}

export function startTurn(state: GameState, side: Side): GameState {
  const currentPlayer = state[side];
  const nextResources = currentPlayer.maxResources + 1;
  const refreshedState: GameState = {
    ...state,
    activePlayer: side,
    [side]: {
      ...currentPlayer,
      maxResources: nextResources,
      resources: nextResources,
    },
    turn: state.turn + 1,
  };

  return drawCard(refreshedState, side);
}

export function playCard(state: GameState, side: Side, cardId: string): GameState {
  const currentPlayer = state[side];
  const cardIndex = currentPlayer.hand.findIndex((card) => card.id === cardId);

  if (cardIndex === -1) {
    return state;
  }

  const cardToPlay = currentPlayer.hand[cardIndex];
  if (currentPlayer.resources < cardToPlay.cost) {
    return state;
  }

  return {
    ...state,
    [side]: {
      ...currentPlayer,
      battlefield: [...currentPlayer.battlefield, cardToPlay],
      hand: currentPlayer.hand.filter((card) => card.id !== cardId),
      resources: currentPlayer.resources - cardToPlay.cost,
    },
  };
}

export function applyChampionDamage(state: GameState, side: Side, damage: number): GameState {
  const currentPlayer = state[side];
  const nextHealth = Math.max(0, currentPlayer.health - damage);
  const winner =
    nextHealth === 0 ? (side === 'player' ? 'enemy' : 'player') : state.winner;

  return {
    ...state,
    [side]: {
      ...currentPlayer,
      health: nextHealth,
    },
    winner,
  };
}

export function resolveCombat(
  state: GameState,
  attackerCardId: string,
  blockerCardId?: string,
): GameState {
  const attacker = state.player.battlefield.find((card) => card.id === attackerCardId);

  if (!attacker) {
    return state;
  }

  if (!blockerCardId) {
    return applyChampionDamage(state, 'enemy', attacker.attack);
  }

  const blocker = state.enemy.battlefield.find((card) => card.id === blockerCardId);
  if (!blocker) {
    return state;
  }

  const attackerSurvives = attacker.health > blocker.attack;
  const blockerSurvives = blocker.health > attacker.attack;

  return {
    ...state,
    enemy: {
      ...state.enemy,
      battlefield: blockerSurvives
        ? state.enemy.battlefield
        : state.enemy.battlefield.filter((card) => card.id !== blockerCardId),
      discard: blockerSurvives ? state.enemy.discard : [...state.enemy.discard, blocker],
    },
    player: {
      ...state.player,
      battlefield: attackerSurvives
        ? state.player.battlefield
        : state.player.battlefield.filter((card) => card.id !== attackerCardId),
      discard: attackerSurvives ? state.player.discard : [...state.player.discard, attacker],
    },
  };
}
