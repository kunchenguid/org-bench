import { describe, expect, it } from 'vitest';

import {
  createGameState,
  endTurn,
  playCard,
  startTurn,
  type CardDefinition,
} from './engine';

const playerDeck: CardDefinition[] = [
  { id: 'p1', name: 'Scout', type: 'creature', cost: 1, attack: 1, health: 1 },
  { id: 'p2', name: 'Bruiser', type: 'creature', cost: 2, attack: 3, health: 2 },
  { id: 'p3', name: 'Spark', type: 'spell', cost: 1, damage: 2 },
  { id: 'p4', name: 'Guard', type: 'creature', cost: 2, attack: 2, health: 3 },
  { id: 'p5', name: 'Volley', type: 'spell', cost: 2, damage: 3 },
];

const opponentDeck: CardDefinition[] = [
  { id: 'o1', name: 'Raider', type: 'creature', cost: 1, attack: 2, health: 1 },
  { id: 'o2', name: 'Hex', type: 'spell', cost: 1, damage: 1 },
  { id: 'o3', name: 'Sentinel', type: 'creature', cost: 3, attack: 3, health: 4 },
  { id: 'o4', name: 'Shot', type: 'spell', cost: 2, damage: 2 },
  { id: 'o5', name: 'Captain', type: 'creature', cost: 4, attack: 4, health: 4 },
];

describe('game engine', () => {
  it('creates deterministic opening state with separate zones for both players', () => {
    const state = createGameState({ playerDeck, opponentDeck, openingHandSize: 3 });

    expect(state.currentPlayer).toBe('player');
    expect(state.turn).toBe(1);

    expect(state.players.player.health).toBe(20);
    expect(state.players.player.resources).toBe(0);
    expect(state.players.player.maxResources).toBe(0);
    expect(state.players.player.hand.map((card) => card.id)).toEqual(['p1', 'p2', 'p3']);
    expect(state.players.player.deck.map((card) => card.id)).toEqual(['p4', 'p5']);
    expect(state.players.player.discard).toEqual([]);
    expect(state.players.player.battlefield).toEqual([]);

    expect(state.players.opponent.health).toBe(20);
    expect(state.players.opponent.resources).toBe(0);
    expect(state.players.opponent.maxResources).toBe(0);
    expect(state.players.opponent.hand.map((card) => card.id)).toEqual(['o1', 'o2', 'o3']);
    expect(state.players.opponent.deck.map((card) => card.id)).toEqual(['o4', 'o5']);
    expect(state.players.opponent.discard).toEqual([]);
    expect(state.players.opponent.battlefield).toEqual([]);
  });

  it('starts a turn by drawing the top card and refreshing resources', () => {
    const state = createGameState({ playerDeck, opponentDeck, openingHandSize: 3 });

    const nextState = startTurn(state);

    expect(nextState.currentPlayer).toBe('player');
    expect(nextState.players.player.maxResources).toBe(1);
    expect(nextState.players.player.resources).toBe(1);
    expect(nextState.players.player.hand.map((card) => card.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(nextState.players.player.deck.map((card) => card.id)).toEqual(['p5']);
    expect(nextState.players.opponent.hand.map((card) => card.id)).toEqual(['o1', 'o2', 'o3']);
  });

  it('ends the turn by switching players and starting the next turn deterministically', () => {
    const state = startTurn(createGameState({ playerDeck, opponentDeck, openingHandSize: 3 }));

    const nextState = endTurn(state);

    expect(nextState.currentPlayer).toBe('opponent');
    expect(nextState.turn).toBe(2);
    expect(nextState.players.player.resources).toBe(1);
    expect(nextState.players.opponent.maxResources).toBe(1);
    expect(nextState.players.opponent.resources).toBe(1);
    expect(nextState.players.opponent.hand.map((card) => card.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(nextState.players.opponent.deck.map((card) => card.id)).toEqual(['o5']);
  });

  it('plays a creature from hand onto the battlefield and spends resources', () => {
    const state = startTurn(createGameState({ playerDeck, opponentDeck, openingHandSize: 3 }));

    const nextState = playCard(state, 'p1');

    expect(nextState.players.player.resources).toBe(0);
    expect(nextState.players.player.hand.map((card) => card.id)).toEqual(['p2', 'p3', 'p4']);
    expect(nextState.players.player.battlefield).toEqual([
      {
        id: 'p1',
        instanceId: 'p1-1',
        name: 'Scout',
        type: 'creature',
        cost: 1,
        attack: 1,
        health: 1,
        currentHealth: 1,
      },
    ]);
  });

  it('plays a spell from hand into discard and applies its damage to the opposing hero', () => {
    const baseState = startTurn(createGameState({ playerDeck, opponentDeck, openingHandSize: 3 }));
    const spellCard: CardDefinition = { id: 'p3', name: 'Spark', type: 'spell', cost: 1, damage: 2 };
    const state = {
      ...baseState,
      players: {
        ...baseState.players,
        player: {
          ...baseState.players.player,
          resources: 1,
          hand: [spellCard],
          battlefield: [],
          discard: [],
        },
      },
    };

    const nextState = playCard(state, 'p3');

    expect(nextState.players.player.resources).toBe(0);
    expect(nextState.players.player.hand).toEqual([]);
    expect(nextState.players.player.discard.map((card) => card.id)).toEqual(['p3']);
    expect(nextState.players.opponent.health).toBe(18);
  });
});
