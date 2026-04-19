import { getPlayerState, updatePlayerState } from './stateManager.js';
export function drawCard(state, player, count = 1) {
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
export function playCardToBoard(state, player, cardId) {
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
export function returnCardToHand(state, player, cardId) {
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
export function discardCard(state, player, cardId) {
    const playerState = getPlayerState(state, player);
    if (!playerState.hand.includes(cardId)) {
        throw new Error(`Card ${cardId} not in hand`);
    }
    const newHand = playerState.hand.filter(id => id !== cardId);
    return updatePlayerState(state, player, {
        hand: newHand
    });
}
export function getHandSize(state, player) {
    return getPlayerState(state, player).hand.length;
}
export function getBoardSize(state, player) {
    return getPlayerState(state, player).board.length;
}
export function getDeckSize(state, player) {
    return getPlayerState(state, player).deck.length;
}
export function getHand(state, player) {
    return getPlayerState(state, player).hand;
}
export function getBoard(state, player) {
    return getPlayerState(state, player).board;
}
export function getDeck(state, player) {
    return getPlayerState(state, player).deck;
}
export function shuffleDeck(state, player) {
    const playerState = getPlayerState(state, player);
    const shuffledDeck = [...playerState.deck].sort(() => Math.random() - 0.5);
    return updatePlayerState(state, player, {
        deck: shuffledDeck
    });
}
export function isCardInHand(state, player, cardId) {
    return getPlayerState(state, player).hand.includes(cardId);
}
export function isCardOnBoard(state, player, cardId) {
    return getPlayerState(state, player).board.includes(cardId);
}
export function isCardInDeck(state, player, cardId) {
    return getPlayerState(state, player).deck.includes(cardId);
}
export function getTotalCards(state, player) {
    const playerState = getPlayerState(state, player);
    return playerState.hand.length + playerState.board.length + playerState.deck.length;
}
export function getCardLocation(state, cardId) {
    const playerState = state.player;
    const opponentState = state.opponent;
    if (playerState.hand.includes(cardId))
        return 'hand';
    if (playerState.board.includes(cardId))
        return 'board';
    if (playerState.deck.includes(cardId))
        return 'deck';
    if (opponentState.hand.includes(cardId))
        return 'hand';
    if (opponentState.board.includes(cardId))
        return 'board';
    if (opponentState.deck.includes(cardId))
        return 'deck';
    return null;
}
export function fatigueDamage(state, player) {
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
