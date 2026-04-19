import { GameState, PlayerType } from './gameState.js';
import { getPlayerState, getOpponentState, updatePlayerState } from './stateManager.js';
import { getCardById } from './stateManager.js';

export function drawCard(state: GameState, player: PlayerType, count: number = 1): GameState {
  const playerState = getPlayerState(state, player);
  const cardsToDraw = Math.min(count, playerState.deck.length);
  
  if (cardsToDraw === 0) {
    return state;
  }
  
  const drawnCards = playerState.deck.slice(0, cardsToDraw);
  const remainingDeck = playerState.deck.slice(cardsToDraw);
  
  return updatePlayerState(state, player, {
    deck: remainingDeck,
    hand: [...playerState.hand, ...drawnCards]
  });
}

export function playCardToBoard(state: GameState, player: PlayerType, cardId: string): GameState {
  const playerState = getPlayerState(state, player);
  
  if (!playerState.hand.includes(cardId)) {
    throw new Error(`Card ${cardId} not in hand`);
  }
  
  const newHand = playerState.hand.filter(id => id !== cardId);
  const newBoard = [...playerState.board, cardId];
  
  return updatePlayerState(state, player, {
    hand: newHand,
    board: newBoard
  });
}

export function returnCardToHand(state: GameState, player: PlayerType, cardId: string): GameState {
  const playerState = getPlayerState(state, player);
  
  if (!playerState.board.includes(cardId)) {
    throw new Error(`Card ${cardId} not on board`);
  }
  
  const newBoard = playerState.board.filter(id => id !== cardId);
  const newHand = [...playerState.hand, cardId];
  
  return updatePlayerState(state, player, {
    board: newBoard,
    hand: newHand
  });
}

export function discardCard(state: GameState, player: PlayerType, cardId: string): GameState {
  const playerState = getPlayerState(state, player);
  
  if (!playerState.hand.includes(cardId)) {
    throw new Error(`Card ${cardId} not in hand`);
  }
  
  const newHand = playerState.hand.filter(id => id !== cardId);
  
  return updatePlayerState(state, player, {
    hand: newHand
  });
}

export function getHandSize(state: GameState, player: PlayerType): number {
  return getPlayerState(state, player).hand.length;
}

export function getBoardSize(state: GameState, player: PlayerType): number {
  return getPlayerState(state, player).board.length;
}

export function getDeckSize(state: GameState, player: PlayerType): number {
  return getPlayerState(state, player).deck.length;
}

export function getHand(state: GameState, player: PlayerType): string[] {
  return getPlayerState(state, player).hand;
}

export function getBoard(state: GameState, player: PlayerType): string[] {
  return getPlayerState(state, player).board;
}

export function getDeck(state: GameState, player: PlayerType): string[] {
  return getPlayerState(state, player).deck;
}

export function shuffleDeck(state: GameState, player: PlayerType): GameState {
  const playerState = getPlayerState(state, player);
  const shuffledDeck = [...playerState.deck].sort(() => Math.random() - 0.5);
  
  return updatePlayerState(state, player, {
    deck: shuffledDeck
  });
}

export function isCardInHand(state: GameState, player: PlayerType, cardId: string): boolean {
  return getPlayerState(state, player).hand.includes(cardId);
}

export function isCardOnBoard(state: GameState, player: PlayerType, cardId: string): boolean {
  return getPlayerState(state, player).board.includes(cardId);
}

export function isCardInDeck(state: GameState, player: PlayerType, cardId: string): boolean {
  return getPlayerState(state, player).deck.includes(cardId);
}

export function getTotalCards(state: GameState, player: PlayerType): number {
  const playerState = getPlayerState(state, player);
  return playerState.hand.length + playerState.board.length + playerState.deck.length;
}

export function getCardLocation(state: GameState, cardId: string): 'hand' | 'board' | 'deck' | 'unknown' | null {
  const playerState = state.player;
  const opponentState = state.opponent;
  
  if (playerState.hand.includes(cardId)) return 'hand';
  if (playerState.board.includes(cardId)) return 'board';
  if (playerState.deck.includes(cardId)) return 'deck';
  
  if (opponentState.hand.includes(cardId)) return 'hand';
  if (opponentState.board.includes(cardId)) return 'board';
  if (opponentState.deck.includes(cardId)) return 'deck';
  
  return null;
}

export function fatigueDamage(state: GameState, player: PlayerType): GameState {
  const playerState = getPlayerState(state, player);
  const fatigueAmount = playerState.deck.length === 0 ? 1 : 0;
  
  if (fatigueAmount === 0) {
    return state;
  }
  
  const newHealth = Math.max(0, playerState.health - fatigueAmount);
  
  return updatePlayerState(state, player, {
    health: newHealth
  });
}