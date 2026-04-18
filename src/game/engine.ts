import { chooseAiHandIndex } from './ai';
import { cards, type CardId } from './cards';
import type { Deck } from './decks';

export type PlayerId = 'player' | 'ai';
export type EncounterPhase = 'main' | 'attack' | 'gameOver';

export type UnitState = {
  instanceId: string;
  cardId: CardId;
  attack: number;
  health: number;
  exhausted: boolean;
};

export type EncounterPlayerState = {
  id: PlayerId;
  health: number;
  maxMana: number;
  mana: number;
  deck: Deck;
  hand: CardId[];
  board: UnitState[];
  discard: CardId[];
};

export type EncounterState = {
  version: 1;
  round: number;
  activePlayer: PlayerId;
  phase: EncounterPhase;
  winner: PlayerId | null;
  nextInstanceId: number;
  players: Record<PlayerId, EncounterPlayerState>;
};

type EncounterOptions = {
  playerDeck: Deck;
  aiDeck: Deck;
};

type PlayCardOptions = {
  playerId: PlayerId;
  handIndex: number;
};

type AttackOptions = {
  playerId: PlayerId;
  attackerId: string;
};

const STARTING_HEALTH = 12;
const STARTING_HAND_SIZE = 3;
const MAX_MANA = 5;

export function createEncounter(options: EncounterOptions): EncounterState {
  let state: EncounterState = {
    version: 1,
    round: 1,
    activePlayer: 'player',
    phase: 'main',
    winner: null,
    nextInstanceId: 1,
    players: {
      player: createPlayerState('player', options.playerDeck),
      ai: createPlayerState('ai', options.aiDeck),
    },
  };

  state = drawOpeningHands(state);
  return startTurn(state, 'player', false);
}

export function drawCard(state: EncounterState, playerId: PlayerId): EncounterState {
  const player = state.players[playerId];
  if (player.deck.length === 0) {
    return state;
  }

  const [cardId, ...deck] = player.deck;
  return updatePlayer(state, playerId, {
    deck,
    hand: [...player.hand, cardId],
  });
}

export function playCard(state: EncounterState, options: PlayCardOptions): EncounterState {
  assertActionableTurn(state, options.playerId, 'main');

  const player = state.players[options.playerId];
  const cardId = player.hand[options.handIndex];
  if (!cardId) {
    throw new Error('Card not found in hand');
  }

  const card = cards[cardId];
  if (card.cost > player.mana) {
    throw new Error('Not enough mana to play card');
  }

  const hand = player.hand.filter((_, index) => index !== options.handIndex);
  const unit: UnitState = {
    instanceId: `unit-${state.nextInstanceId}`,
    cardId,
    attack: card.attack,
    health: card.health,
    exhausted: true,
  };

  return {
    ...updatePlayer(state, options.playerId, {
      hand,
      mana: player.mana - card.cost,
      board: [...player.board, unit],
    }),
    nextInstanceId: state.nextInstanceId + 1,
  };
}

export function attackOpponent(state: EncounterState, options: AttackOptions): EncounterState {
  assertActionableTurn(state, options.playerId, 'attack');

  const attackerOwner = state.players[options.playerId];
  const attackerIndex = attackerOwner.board.findIndex((unit) => unit.instanceId === options.attackerId);
  if (attackerIndex === -1) {
    throw new Error('Attacker not found');
  }

  const attacker = attackerOwner.board[attackerIndex];
  if (attacker.exhausted) {
    throw new Error('Unit cannot attack yet');
  }

  const defenderId = getOpponent(options.playerId);
  const exhaustedBoard = attackerOwner.board.map((unit, index) => (index === attackerIndex ? { ...unit, exhausted: true } : unit));
  const withAttackerSpent = updatePlayer(state, options.playerId, { board: exhaustedBoard });
  const defender = withAttackerSpent.players[defenderId];
  const withDamage = updatePlayer(withAttackerSpent, defenderId, {
    health: Math.max(0, defender.health - attacker.attack),
  });

  if (withDamage.players[defenderId].health === 0) {
    return {
      ...withDamage,
      phase: 'gameOver',
      winner: options.playerId,
    };
  }

  return withDamage;
}

export function beginAttackPhase(state: EncounterState, playerId: PlayerId): EncounterState {
  assertActionableTurn(state, playerId, 'main');
  return {
    ...state,
    phase: 'attack',
  };
}

export function endTurn(state: EncounterState): EncounterState {
  if (state.phase === 'gameOver') {
    return state;
  }

  const activePlayer = state.activePlayer;
  const attackReadyState = state.phase === 'main' ? { ...state, phase: 'attack' as EncounterPhase } : state;
  const nextPlayer = getOpponent(activePlayer);
  const nextRound = activePlayer === 'ai' ? state.round + 1 : state.round;
  const started = startTurn({ ...attackReadyState, round: nextRound }, nextPlayer, true);

  if (nextPlayer === 'ai') {
    return runAiTurn(started);
  }

  return started;
}

function runAiTurn(state: EncounterState): EncounterState {
  let next = state;
  let handIndex = chooseAiHandIndex(next.players.ai);

  while (handIndex !== -1) {
    next = playCard(next, { playerId: 'ai', handIndex });
    handIndex = chooseAiHandIndex(next.players.ai);
  }

  next = { ...next, phase: 'attack' };

  for (const unit of next.players.ai.board) {
    if (unit.exhausted) {
      continue;
    }
    next = attackOpponent(next, { playerId: 'ai', attackerId: unit.instanceId });
    if (next.phase === 'gameOver') {
      return next;
    }
  }

  return endTurn(next);
}

function drawOpeningHands(state: EncounterState): EncounterState {
  let next = state;
  for (let draw = 0; draw < STARTING_HAND_SIZE; draw += 1) {
    next = drawCard(next, 'player');
    next = drawCard(next, 'ai');
  }
  return next;
}

function startTurn(state: EncounterState, playerId: PlayerId, drawForTurn: boolean): EncounterState {
  const player = state.players[playerId];
  const maxMana = Math.min(player.maxMana + 1, MAX_MANA);
  const readiedBoard = player.board.map((unit) => ({ ...unit, exhausted: false }));
  let next = {
    ...state,
    activePlayer: playerId,
    phase: 'main' as EncounterPhase,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        maxMana,
        mana: maxMana,
        board: readiedBoard,
      },
    },
  };

  if (drawForTurn) {
    next = drawCard(next, playerId);
  }

  return next;
}

function createPlayerState(id: PlayerId, deck: Deck): EncounterPlayerState {
  return {
    id,
    health: STARTING_HEALTH,
    maxMana: 0,
    mana: 0,
    deck: [...deck],
    hand: [],
    board: [],
    discard: [],
  };
}

function assertActionableTurn(state: EncounterState, playerId: PlayerId, phase: 'main' | 'attack'): void {
  if (state.activePlayer !== playerId) {
    throw new Error('It is not this player\'s turn');
  }
  if (state.phase !== phase) {
    throw new Error(`Action requires ${phase} phase`);
  }
}

function updatePlayer(
  state: EncounterState,
  playerId: PlayerId,
  updates: Partial<EncounterPlayerState>,
): EncounterState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        ...updates,
      },
    },
  };
}

function getOpponent(playerId: PlayerId): PlayerId {
  return playerId === 'player' ? 'ai' : 'player';
}
