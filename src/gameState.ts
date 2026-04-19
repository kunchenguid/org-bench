import { Card } from './types.js';

export enum TurnPhase {
  DRAW = 'draw',
  MAIN = 'main',
  COMBAT = 'combat',
  END = 'end'
}

export enum PhaseActionType {
  DRAW = 'draw',
  MANA_REFILL = 'mana_refill',
  COMBAT_RESET = 'combat_reset',
  END_TURN = 'end_turn'
}

export enum PlayerType {
  PLAYER = 'player',
  OPPONENT = 'opponent'
}

export enum GameStateType {
  IN_PROGRESS = 'in_progress',
  PLAYER_WINS = 'player_wins',
  OPPONENT_WINS = 'opponent_wins',
  DRAW = 'draw'
}

export interface PlayerState {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  manaSpent: number;
  hand: string[];
  board: string[];
  deck: string[];
}

export interface GameConfig {
  startingHealth: number;
  startingMaxMana: number;
  maxManaCap: number;
  handSize: number;
  deckSize: number;
  turnTimeLimit: number;
}

export interface GameState {
  version: string;
  gameState: GameStateType;
  currentTurn: number;
  currentPlayer: PlayerType;
  currentPhase: TurnPhase;
  turnTimer: number;
  player: PlayerState;
  opponent: PlayerState;
  cards: Map<string, Card>;
  config: GameConfig;
}

export interface CombatAction {
  attackerCardId: string;
  targetCardId?: string;
  targetPlayer?: PlayerType;
}

export interface CombatResult {
  attackerCardId: string;
  targetCardId?: string;
  targetPlayer?: PlayerType;
  damageToTarget: number;
  damageToAttacker: number;
  attackerDestroyed: boolean;
  targetDestroyed: boolean;
}

export interface PhaseTransition {
  fromPhase: TurnPhase;
  toPhase: TurnPhase;
  actions: PhaseAction[];
}

export interface PhaseAction {
  type: 'draw' | 'mana_refill' | 'combat_reset' | 'end_turn';
  playerId: PlayerType;
  details?: Record<string, unknown>;
}