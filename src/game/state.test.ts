import { describe, expect, test } from 'vitest';

import { createGameState, drawCard, startTurn } from './state';

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
});
