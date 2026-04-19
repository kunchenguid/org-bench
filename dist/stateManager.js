import { PlayerType, TurnPhase, GameStateType } from './gameState.js';
const DEFAULT_CONFIG = {
    startingHealth: 30,
    startingMaxMana: 10,
    maxManaCap: 10,
    handSize: 4,
    deckSize: 20,
    turnTimeLimit: 30
};
const STATE_VERSION = '1.0.0';
function createInitialPlayerState(type, config) {
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
export function createInitialGameState(cards, config) {
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
export function serializeGameState(state) {
    return JSON.stringify({
        ...state,
        cards: Object.fromEntries(state.cards)
    });
}
export function deserializeGameState(serialized) {
    const parsed = JSON.parse(serialized);
    return {
        ...parsed,
        cards: new Map(Object.entries(parsed.cards))
    };
}
export function saveToLocalStorage(state, key = 'gameState') {
    try {
        localStorage.setItem(key, serializeGameState(state));
    }
    catch (e) {
        console.warn('Failed to save game state to localStorage:', e);
    }
}
export function loadFromLocalStorage(key = 'gameState') {
    try {
        const serialized = localStorage.getItem(key);
        if (!serialized)
            return null;
        return deserializeGameState(serialized);
    }
    catch (e) {
        console.warn('Failed to load game state from localStorage:', e);
        return null;
    }
}
export function getPlayerState(state, player) {
    return player === PlayerType.PLAYER ? state.player : state.opponent;
}
export function getOpponentState(state, player) {
    return player === PlayerType.PLAYER ? state.opponent : state.player;
}
export function updatePlayerState(state, player, update) {
    const target = player === PlayerType.PLAYER ? 'player' : 'opponent';
    return {
        ...state,
        [target]: { ...state[target], ...update }
    };
}
export function setTurnPhase(state, phase) {
    return {
        ...state,
        currentPhase: phase
    };
}
export function advanceTurn(state) {
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
export function updateTurnTimer(state, delta) {
    const newTimer = Math.max(0, state.turnTimer - delta);
    return {
        ...state,
        turnTimer: newTimer
    };
}
export function setGameState(state, gameStateType) {
    return {
        ...state,
        gameState: gameStateType
    };
}
export function checkWinCondition(state) {
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
export function isGameOver(state) {
    return state.gameState !== GameStateType.IN_PROGRESS;
}
export function getCardById(state, cardId) {
    return state.cards.get(cardId);
}
