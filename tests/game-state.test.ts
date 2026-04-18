import { describe, expect, test } from 'vitest';

import {
  createInitialGameState,
  endTurn,
  getPreconstructedDeck,
  playCard,
  startTurn
} from '../src/game/state';

describe('game state foundation', () => {
  test('builds deterministic 20-card preconstructed decks', () => {
    const emberDeck = getPreconstructedDeck('ember');
    const tidalDeck = getPreconstructedDeck('tidal');

    expect(emberDeck).toHaveLength(20);
    expect(tidalDeck).toHaveLength(20);
    expect(emberDeck[0]?.id).toBe('ember-scout');
    expect(emberDeck[19]?.id).toBe('ember-nova');
    expect(tidalDeck[0]?.id).toBe('tidal-myrmidon');
    expect(tidalDeck[19]?.id).toBe('tidal-leviathan');
  });

  test('creates a deterministic opening state and advances resources on turn start', () => {
    let state = createInitialGameState();

    expect(state.turn).toBe(1);
    expect(state.activePlayer).toBe('player');
    expect(state.player.hand.map((card) => card.id)).toEqual([
      'ember-scout',
      'ember-scout',
      'ember-spark'
    ]);
    expect(state.player.deck[0]?.id).toBe('ember-guard');
    expect(state.player.resources).toEqual({ current: 0, max: 0 });

    state = startTurn(state);

    expect(state.player.resources).toEqual({ current: 1, max: 1 });
    expect(state.player.hand).toHaveLength(4);
    expect(state.player.hand[3]?.id).toBe('ember-guard');
  });

  test('resolves creature and spell cards using available resources', () => {
    let state = startTurn(createInitialGameState());

    state = playCard(state, { playerId: 'player', handIndex: 0 });

    expect(state.player.resources).toEqual({ current: 0, max: 1 });
    expect(state.player.battlefield.map((card) => card.id)).toEqual(['ember-scout']);
    expect(state.player.discardPile).toHaveLength(0);

    state = endTurn(state);
    state = startTurn(state);
    state = endTurn(state);
    state = startTurn(state);

    expect(state.player.resources).toEqual({ current: 2, max: 2 });
    expect(state.player.hand.map((card) => card.id)).toContain('ember-spark');

    const sparkIndex = state.player.hand.findIndex((card) => card.id === 'ember-spark');
    state = playCard(state, { playerId: 'player', handIndex: sparkIndex, targetPlayerId: 'opponent' });

    expect(state.player.resources).toEqual({ current: 1, max: 2 });
    expect(state.player.discardPile.map((card) => card.id)).toEqual(['ember-spark']);
    expect(state.opponent.health).toBe(17);
  });
});
