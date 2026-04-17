import { describe, expect, it } from 'vitest';

import { chooseEnemyAction, createGame, resolveAction, type CardDefinition } from './duel-engine';

const cards: CardDefinition[] = [
  {
    id: 'ember-scout',
    name: 'Ember Scout',
    kind: 'creature',
    cost: 1,
    attack: 2,
    health: 1,
  },
  {
    id: 'cinder-bolt',
    name: 'Cinder Bolt',
    kind: 'spell',
    cost: 1,
    damage: 3,
  },
  {
    id: 'tide-guard',
    name: 'Tide Guard',
    kind: 'creature',
    cost: 2,
    attack: 1,
    health: 4,
  },
];

describe('chooseEnemyAction', () => {
  it('uses a lethal spell when it can end the game immediately', () => {
    const opening = createGame({
      cards,
      playerDeck: ['ember-scout'],
      enemyDeck: ['cinder-bolt'],
      startingHandSize: 1,
      startingHealth: 3,
    });

    const enemyTurn = resolveAction(opening, {
      type: 'end_turn',
      playerId: 'player',
    });

    expect(chooseEnemyAction(enemyTurn)).toEqual({
      type: 'play_card',
      playerId: 'enemy',
      cardInstanceId: enemyTurn.players.enemy.hand[0].instanceId,
    });
  });

  it('otherwise plays the highest impact affordable card before ending the turn', () => {
    const opening = createGame({
      cards,
      playerDeck: ['ember-scout'],
      enemyDeck: ['tide-guard', 'cinder-bolt', 'ember-scout'],
      startingHandSize: 2,
      startingHealth: 20,
    });

    const enemyTurn = resolveAction(opening, {
      type: 'end_turn',
      playerId: 'player',
    });

    expect(enemyTurn.players.enemy.hand.map((card) => card.cardId)).toEqual([
      'tide-guard',
      'cinder-bolt',
      'ember-scout',
    ]);
    expect(chooseEnemyAction(enemyTurn)).toEqual({
      type: 'play_card',
      playerId: 'enemy',
      cardInstanceId: enemyTurn.players.enemy.hand[1].instanceId,
    });
  });

  it('ends the turn when nothing is affordable', () => {
    const opening = createGame({
      cards,
      playerDeck: ['ember-scout'],
      enemyDeck: ['tide-guard'],
      startingHandSize: 1,
      startingHealth: 20,
    });

    const enemyTurn = resolveAction(opening, {
      type: 'end_turn',
      playerId: 'player',
    });

    expect(chooseEnemyAction(enemyTurn)).toEqual({
      type: 'end_turn',
      playerId: 'enemy',
    });
  });
});
