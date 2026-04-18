import { createEncounterState, endTurn, playCard } from '../src/game';

describe('game model', () => {
  test('creates an encounter with zone state for both sides', () => {
    const state = createEncounterState();

    expect(state.turn).toBe(1);
    expect(state.currentPlayer).toBe('player');
    expect(state.player.health).toBe(20);
    expect(state.player.hand).toHaveLength(3);
    expect(state.player.deck.length).toBeGreaterThan(0);
    expect(state.player.discard).toHaveLength(0);
    expect(state.player.battlefield).toHaveLength(0);
    expect(state.opponent.hand).toHaveLength(3);
    expect(state.opponent.battlefield).toHaveLength(0);
    expect(state.log[0]).toMatch(/ember ridge/i);
  });

  test('resolves card play and a deterministic AI turn', () => {
    const openingState = createEncounterState();
    const playerCardId = openingState.player.hand[0]?.id;

    if (!playerCardId) {
      throw new Error('Expected an opening hand card');
    }

    const playedState = playCard(openingState, 'player', playerCardId);

    expect(playedState.player.battlefield).toHaveLength(1);
    expect(playedState.player.mana.current).toBe(0);
    expect(playedState.player.discard).toHaveLength(0);

    const nextState = endTurn(playedState);

    expect(nextState.turn).toBe(2);
    expect(nextState.currentPlayer).toBe('player');
    expect(nextState.player.health).toBe(18);
    expect(nextState.opponent.battlefield).toHaveLength(1);
    expect(nextState.log.some((entry) => entry.includes('Enemy played Stoneguard Sentinel'))).toBe(true);
  });

  test('logs each card play once', () => {
    const openingState = createEncounterState();
    const playerCardId = openingState.player.hand[0]?.id;

    if (!playerCardId) {
      throw new Error('Expected an opening hand card');
    }

    const playedState = playCard(openingState, 'player', playerCardId);
    const playerPlayEntries = playedState.log.filter((entry) => entry === 'You played Ash Striker.');

    expect(playerPlayEntries).toHaveLength(1);

    const nextState = endTurn(playedState);
    const enemyPlayEntries = nextState.log.filter((entry) => entry === 'Enemy played Stoneguard Sentinel.');

    expect(enemyPlayEntries).toHaveLength(1);
  });
});
