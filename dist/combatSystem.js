import { PlayerType, TurnPhase } from './gameState.js';
import { getPlayerState, getOpponentState, updatePlayerState } from './stateManager.js';
import { getCardById } from './stateManager.js';
export function canAttack(state, attackerCardId) {
    if (state.currentPhase !== TurnPhase.COMBAT) {
        return false;
    }
    const currentPlayer = state.currentPlayer;
    const playerState = getPlayerState(state, currentPlayer);
    return playerState.board.includes(attackerCardId);
}
export function getValidTargets(state, attackerCardId) {
    if (!canAttack(state, attackerCardId)) {
        return [];
    }
    const opponent = state.currentPlayer === PlayerType.PLAYER ? PlayerType.OPPONENT : PlayerType.PLAYER;
    const opponentState = getOpponentState(state, state.currentPlayer);
    const targets = [];
    for (const cardId of opponentState.board) {
        const card = getCardById(state, cardId);
        if (card) {
            targets.push(cardId);
        }
    }
    targets.push(opponent === PlayerType.PLAYER ? 'player' : 'opponent');
    return targets;
}
export function resolveCombat(state, action) {
    const attackerCard = getCardById(state, action.attackerCardId);
    if (!attackerCard) {
        throw new Error(`Attacker card ${action.attackerCardId} not found`);
    }
    const attackerDamage = attackerCard.health;
    let targetDamage = 0;
    let attackerReceivedDamage = 0;
    let targetDestroyed = false;
    let attackerDestroyed = false;
    if (action.targetCardId) {
        const targetCard = getCardById(state, action.targetCardId);
        if (!targetCard) {
            throw new Error(`Target card ${action.targetCardId} not found`);
        }
        targetDamage = attackerDamage;
        attackerReceivedDamage = targetCard.health;
        const targetRemainingHealth = targetCard.health - targetDamage;
        targetDestroyed = targetRemainingHealth <= 0;
        const attackerRemainingHealth = attackerCard.health - attackerReceivedDamage;
        attackerDestroyed = attackerRemainingHealth <= 0;
        let newState = state;
        const currentPlayer = state.currentPlayer;
        const opponent = currentPlayer === PlayerType.PLAYER ? PlayerType.OPPONENT : PlayerType.PLAYER;
        if (attackerDestroyed) {
            const currentBoard = getPlayerState(newState, currentPlayer).board;
            newState = updatePlayerState(newState, currentPlayer, {
                board: currentBoard.filter(id => id !== action.attackerCardId)
            });
        }
        if (targetDestroyed) {
            const opponentBoard = getOpponentState(newState, currentPlayer).board;
            newState = updatePlayerState(newState, opponent, {
                board: opponentBoard.filter(id => id !== action.targetCardId)
            });
        }
        return {
            attackerCardId: action.attackerCardId,
            targetCardId: action.targetCardId,
            damageToTarget: targetDamage,
            damageToAttacker: attackerReceivedDamage,
            attackerDestroyed,
            targetDestroyed
        };
    }
    else if (action.targetPlayer) {
        targetDamage = attackerDamage;
        let newState = state;
        const targetPlayerState = action.targetPlayer === PlayerType.PLAYER
            ? newState.player
            : newState.opponent;
        const newHealth = Math.max(0, targetPlayerState.health - targetDamage);
        newState = updatePlayerState(newState, action.targetPlayer, {
            health: newHealth
        });
        return {
            attackerCardId: action.attackerCardId,
            targetPlayer: action.targetPlayer,
            damageToTarget: targetDamage,
            damageToAttacker: 0,
            attackerDestroyed: false,
            targetDestroyed: false
        };
    }
    throw new Error('Invalid combat action: must specify targetCardId or targetPlayer');
}
export function dealDamageToPlayer(state, target, amount) {
    const playerState = target === PlayerType.PLAYER ? state.player : state.opponent;
    const newHealth = Math.max(0, playerState.health - amount);
    return updatePlayerState(state, target, {
        health: newHealth
    });
}
export function dealDamageToCard(state, cardId, amount) {
    const card = getCardById(state, cardId);
    if (!card) {
        throw new Error(`Card ${cardId} not found`);
    }
    const newHealth = Math.max(0, card.health - amount);
    if (newHealth <= 0) {
        const currentPlayer = state.currentPlayer;
        const playerState = getPlayerState(state, currentPlayer);
        const opponentState = getOpponentState(state, currentPlayer);
        if (playerState.board.includes(cardId)) {
            return updatePlayerState(state, currentPlayer, {
                board: playerState.board.filter(id => id !== cardId)
            });
        }
        else if (opponentState.board.includes(cardId)) {
            const opponent = currentPlayer === PlayerType.PLAYER ? PlayerType.OPPONENT : PlayerType.PLAYER;
            return updatePlayerState(state, opponent, {
                board: opponentState.board.filter(id => id !== cardId)
            });
        }
    }
    return state;
}
export function healPlayer(state, target, amount) {
    const playerState = target === PlayerType.PLAYER ? state.player : state.opponent;
    const newHealth = Math.min(playerState.maxHealth, playerState.health + amount);
    return updatePlayerState(state, target, {
        health: newHealth
    });
}
export function healCard(state, cardId, amount) {
    const card = getCardById(state, cardId);
    if (!card) {
        throw new Error(`Card ${cardId} not found`);
    }
    const newHealth = card.health + amount;
    return state;
}
export function canTargetPlayer(state, player) {
    const opponent = state.currentPlayer === PlayerType.PLAYER ? PlayerType.OPPONENT : PlayerType.PLAYER;
    const opponentState = getOpponentState(state, state.currentPlayer);
    return opponentState.board.length === 0;
}
