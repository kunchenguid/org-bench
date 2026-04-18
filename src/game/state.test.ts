import { describe, expect, it } from 'vitest';

import {
  advanceTurn,
  createDuelState,
  dealDamage,
  deployCard,
  type DuelState,
} from './state';

function getPlayer(state: DuelState, playerId: 'player' | 'opponent') {
  return state.players[playerId];
}

describe('duel state', () => {
  it('creates deterministic opening hands and zone state', () => {
    const state = createDuelState({
      playerDeck: ['p1', 'p2', 'p3', 'p4', 'p5'],
      opponentDeck: ['o1', 'o2', 'o3', 'o4', 'o5'],
      openingHandSize: 3,
    });

    expect(state.activePlayer).toBe('player');
    expect(state.turn).toBe(1);
    expect(state.outcome).toBe('in_progress');

    expect(getPlayer(state, 'player')).toMatchObject({
      deck: ['p4', 'p5'],
      hand: ['p1', 'p2', 'p3'],
      discard: [],
      battlefield: [],
      health: 20,
      resources: { current: 0, max: 0 },
    });

    expect(getPlayer(state, 'opponent')).toMatchObject({
      deck: ['o4', 'o5'],
      hand: ['o1', 'o2', 'o3'],
      discard: [],
      battlefield: [],
      health: 20,
      resources: { current: 0, max: 0 },
    });
  });

  it('deploys a card from hand to battlefield and spends resources', () => {
    const started = advanceTurn(
      advanceTurn(
        createDuelState({
          playerDeck: ['p1', 'p2', 'p3', 'p4', 'p5'],
          opponentDeck: ['o1', 'o2', 'o3', 'o4', 'o5'],
          openingHandSize: 1,
        })
      )
    );

    const deployed = deployCard(started, 'player', 0, 1);

    expect(getPlayer(deployed, 'player').hand).toEqual(['p2']);
    expect(getPlayer(deployed, 'player').battlefield).toEqual(['p1']);
    expect(getPlayer(deployed, 'player').resources).toEqual({ current: 0, max: 1 });
  });

  it('advances through alternating turns, refreshes resources, draws cards, and tracks duel outcome', () => {
    const initial = createDuelState({
      playerDeck: ['p1', 'p2', 'p3', 'p4'],
      opponentDeck: ['o1', 'o2', 'o3', 'o4'],
      openingHandSize: 1,
    });

    const playerTurnThree = advanceTurn(advanceTurn(advanceTurn(advanceTurn(initial))));

    expect(playerTurnThree.activePlayer).toBe('player');
    expect(playerTurnThree.turn).toBe(3);
    expect(getPlayer(playerTurnThree, 'player').hand).toEqual(['p1', 'p2', 'p3']);
    expect(getPlayer(playerTurnThree, 'player').resources).toEqual({ current: 2, max: 2 });

    const finished = dealDamage(playerTurnThree, 'opponent', 20);

    expect(getPlayer(finished, 'opponent').health).toBe(0);
    expect(finished.outcome).toBe('player_won');
  });
});
