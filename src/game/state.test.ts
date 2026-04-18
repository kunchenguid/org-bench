import { describe, expect, test } from 'vitest';

import {
  applyChampionDamage,
  createGameState,
  drawCard,
  endTurn,
  playCard,
  resolveCombat,
  startTurn,
} from './state';

const scout = { attack: 2, cost: 1, health: 1, id: 'scout', name: 'Scout' };
const guardian = { attack: 1, cost: 2, health: 3, id: 'guardian', name: 'Guardian' };
const striker = { attack: 3, cost: 2, health: 2, id: 'striker', name: 'Striker' };

describe('game state flow', () => {
  test('creates a deterministic baseline state from deck order', () => {
    const state = createGameState({
      enemyDeck: [guardian],
      playerDeck: [scout, striker],
    });

    expect(state.turn).toBe(0);
    expect(state.activePlayer).toBe('player');
    expect(state.player.deck.map((card) => card.id)).toEqual(['scout', 'striker']);
    expect(state.player.hand).toEqual([]);
    expect(state.player.resources).toBe(0);
    expect(state.player.maxResources).toBe(0);
    expect(state.winner).toBeNull();
  });

  test('drawCard moves the top deck card into hand without shuffling', () => {
    const baseline = createGameState({
      enemyDeck: [guardian],
      playerDeck: [scout, striker],
    });

    const nextState = drawCard(baseline, 'player');

    expect(nextState.player.hand.map((card) => card.id)).toEqual(['scout']);
    expect(nextState.player.deck.map((card) => card.id)).toEqual(['striker']);
    expect(baseline.player.hand).toEqual([]);
  });

  test('startTurn increments turn, refills resources, and draws one card for the active side', () => {
    const baseline = createGameState({
      enemyDeck: [guardian],
      playerDeck: [scout, striker],
    });

    const nextState = startTurn(baseline, 'player');

    expect(nextState.turn).toBe(1);
    expect(nextState.activePlayer).toBe('player');
    expect(nextState.player.maxResources).toBe(1);
    expect(nextState.player.resources).toBe(1);
    expect(nextState.player.hand.map((card) => card.id)).toEqual(['scout']);
    expect(nextState.player.deck.map((card) => card.id)).toEqual(['striker']);
  });

  test('playCard spends resources and moves a chosen hand card onto the battlefield', () => {
    const baseline = startTurn(
      createGameState({
        enemyDeck: [guardian],
        playerDeck: [scout, striker],
      }),
      'player',
    );

    const nextState = playCard(baseline, 'player', 'scout');

    expect(nextState.player.resources).toBe(0);
    expect(nextState.player.hand).toEqual([]);
    expect(nextState.player.battlefield.map((card) => card.id)).toEqual(['scout']);
  });

  test('applyChampionDamage declares a winner when lethal damage lands on the enemy champion', () => {
    const baseline = createGameState({
      enemyDeck: [guardian],
      playerDeck: [scout, striker],
      startingHealth: 3,
    });

    const nextState = applyChampionDamage(baseline, 'enemy', 3);

    expect(nextState.enemy.health).toBe(0);
    expect(nextState.winner).toBe('player');
  });

  test('applyChampionDamage declares a winner when lethal damage lands on the player champion', () => {
    const baseline = createGameState({
      enemyDeck: [guardian],
      playerDeck: [scout, striker],
      startingHealth: 2,
    });

    const nextState = applyChampionDamage(baseline, 'player', 2);

    expect(nextState.player.health).toBe(0);
    expect(nextState.winner).toBe('enemy');
  });

  test('resolveCombat removes defeated attacker and blocker to their discard piles', () => {
    const baseline = {
      ...createGameState({
        enemyDeck: [],
        playerDeck: [],
      }),
      enemy: {
        ...createGameState({ enemyDeck: [], playerDeck: [] }).enemy,
        battlefield: [striker],
      },
      player: {
        ...createGameState({ enemyDeck: [], playerDeck: [] }).player,
        battlefield: [striker],
      },
    };

    const nextState = resolveCombat(baseline, 'striker', 'striker');

    expect(nextState.player.battlefield).toEqual([]);
    expect(nextState.enemy.battlefield).toEqual([]);
    expect(nextState.player.discard.map((card) => card.id)).toEqual(['striker']);
    expect(nextState.enemy.discard.map((card) => card.id)).toEqual(['striker']);
  });

  test('resolveCombat deals unblocked attacker damage to the enemy champion', () => {
    const baseline = {
      ...createGameState({
        enemyDeck: [],
        playerDeck: [],
      }),
      player: {
        ...createGameState({ enemyDeck: [], playerDeck: [] }).player,
        battlefield: [striker],
      },
    };

    const nextState = resolveCombat(baseline, 'striker');

    expect(nextState.enemy.health).toBe(17);
    expect(nextState.player.battlefield.map((card) => card.id)).toEqual(['striker']);
  });

  test('endTurn clears floating resources and hands priority to the enemy', () => {
    const baseline = startTurn(
      createGameState({
        enemyDeck: [guardian],
        playerDeck: [scout, striker],
      }),
      'player',
    );

    const nextState = endTurn(baseline, 'player');

    expect(nextState.activePlayer).toBe('enemy');
    expect(nextState.player.resources).toBe(0);
    expect(nextState.turn).toBe(1);
  });
});
