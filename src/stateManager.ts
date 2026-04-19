import {
  GameState,
  PlayerType,
  PlayerState,
  TurnPhase,
  GameStateType,
  GameConfig,
  CombatResult,
  CombatAction,
  PhaseTransition,
  PhaseAction
} from './gameState.js';
import { Card } from './types.js';

const DEFAULT_CONFIG: GameConfig = {
  startingHealth: 30,
  startingMaxMana: 10,
  maxManaCap: 10,
  handSize: 4,
  deckSize: 20,
  turnTimeLimit: 30
};

const STATE_VERSION = '1.0.0';

function createInitialPlayerState(type: PlayerType, config: GameConfig): PlayerState {
  return {
    health: config.startingHealth,
    maxHealth: config.startingHealth,
    mana: 0,
    maxMana: config.startingMaxMana,
    manaSpent: 0,
    hand: [],
    board: [],
    deck: Array.from({ length: config.deckSize }, (_, i) => `${type}_${i}`)
  };
}

export function createInitialGameState(cards: Map<string, Card>, config?: Partial<GameConfig>): GameState {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  return {
    version: STATE_VERSION,
    gameState: GameStateType.IN_PROGRESS,
    currentTurn: 1,
    currentPlayer: PlayerType.PLAYER,
    currentPhase: TurnPhase.DRAW,
    turnTimer: finalConfig.turnTimeLimit,
    player: createInitialPlayerState(PlayerType.PLAYER, finalConfig),
    opponent: createInitialPlayerState(PlayerType.OPPONENT, finalConfig),
    cards,
    config: finalConfig
  };
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify({
    ...state,
    cards: Object.fromEntries(state.cards)
  });
}

export function deserializeGameState(serialized: string): GameState {
  const parsed = JSON.parse(serialized);
  return {
    ...parsed,
    cards: new Map(Object.entries(parsed.cards))
  };
}

export function saveToLocalStorage(state: GameState, key = 'gameState'): void {
  try {
    localStorage.setItem(key, serializeGameState(state));
  } catch (e) {
    console.warn('Failed to save game state to localStorage:', e);
  }
}

export function loadFromLocalStorage(key = 'gameState'): GameState | null {
  try {
    const serialized = localStorage.getItem(key);
    if (!serialized) return null;
    return deserializeGameState(serialized);
  } catch (e) {
    console.warn('Failed to load game state from localStorage:', e);
    return null;
  }
}

export function getPlayerState(state: GameState, player: PlayerType): PlayerState {
  return player === PlayerType.PLAYER ? state.player : state.opponent;
}

export function getOpponentState(state: GameState, player: PlayerType): PlayerState {
  return player === PlayerType.PLAYER ? state.opponent : state.player;
}

export function updatePlayerState(state: GameState, player: PlayerType, update: Partial<PlayerState>): GameState {
  const target = player === PlayerType.PLAYER ? 'player' : 'opponent';
  return {
    ...state,
    [target]: { ...state[target], ...update }
  };
}

export function setTurnPhase(state: GameState, phase: TurnPhase): GameState {
  return {
    ...state,
    currentPhase: phase
  };
}

export function advanceTurn(state: GameState): GameState {
  const nextPlayer = state.currentPlayer === PlayerType.PLAYER ? PlayerType.OPPONENT : PlayerType.PLAYER;
  const turnIncrement = nextPlayer === PlayerType.PLAYER ? 1 : 0;
  
  return {
    ...state,
    currentTurn: state.currentTurn + turnIncrement,
    currentPlayer: nextPlayer,
    currentPhase: TurnPhase.DRAW,
    turnTimer: state.config.turnTimeLimit
  };
}

export function updateTurnTimer(state: GameState, delta: number): GameState {
  const newTimer = Math.max(0, state.turnTimer - delta);
  return {
    ...state,
    turnTimer: newTimer
  };
}

export function setGameState(state: GameState, gameStateType: GameStateType): GameState {
  return {
    ...state,
    gameState: gameStateType
  };
}

export function checkWinCondition(state: GameState): GameStateType {
  if (state.player.health <= 0 && state.opponent.health <= 0) {
    return GameStateType.DRAW;
  }
  if (state.player.health <= 0) {
    return GameStateType.OPPONENT_WINS;
  }
  if (state.opponent.health <= 0) {
    return GameStateType.PLAYER_WINS;
  }
  return state.gameState;
}

export function isGameOver(state: GameState): boolean {
  return state.gameState !== GameStateType.IN_PROGRESS;
}

export function getCardById(state: GameState, cardId: string): Card | undefined {
  return state.cards.get(cardId);
}