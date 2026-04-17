import { describe, expect, it } from 'vitest';

import {
  createGame,
  getLegalActions,
  getOpponentId,
  resolveAction,
  type CardDefinition,
} from './duel-engine';

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

describe('duel engine', () => {
  it('creates a deterministic opening state with deck, hand, and resource zones', () => {
    const game = createGame({
      cards,
      playerDeck: ['ember-scout', 'cinder-bolt', 'tide-guard'],
      enemyDeck: ['tide-guard', 'ember-scout', 'cinder-bolt'],
      startingHandSize: 2,
      startingHealth: 20,
    });

    expect(game.activePlayerId).toBe('player');
    expect(game.turn).toBe(1);
    expect(game.winnerId).toBeNull();

    expect(game.players.player.health).toBe(20);
    expect(game.players.player.maxResources).toBe(1);
    expect(game.players.player.resources).toBe(1);
    expect(game.players.player.hand.map((card) => card.cardId)).toEqual(['ember-scout', 'cinder-bolt']);
    expect(game.players.player.deck).toEqual(['tide-guard']);
    expect(game.players.player.discard).toEqual([]);
    expect(game.players.player.battlefield).toEqual([]);

    expect(game.players.enemy.health).toBe(20);
    expect(game.players.enemy.hand.map((card) => card.cardId)).toEqual(['tide-guard', 'ember-scout']);
    expect(game.players.enemy.deck).toEqual(['cinder-bolt']);
  });

  it('lists only legal actions for the active player based on current resources', () => {
    const game = createGame({
      cards,
      playerDeck: ['ember-scout', 'tide-guard', 'cinder-bolt'],
      enemyDeck: ['tide-guard', 'ember-scout', 'cinder-bolt'],
      startingHandSize: 2,
      startingHealth: 20,
    });

    expect(getLegalActions(game)).toEqual([
      {
        type: 'play_card',
        playerId: 'player',
        cardInstanceId: game.players.player.hand[0].instanceId,
      },
      {
        type: 'end_turn',
        playerId: 'player',
      },
    ]);
  });

  it('moves creatures to the battlefield and spells to discard while updating health and resources', () => {
    const opening = createGame({
      cards,
      playerDeck: ['ember-scout', 'cinder-bolt', 'tide-guard'],
      enemyDeck: ['tide-guard', 'ember-scout', 'cinder-bolt'],
      startingHandSize: 2,
      startingHealth: 20,
    });

    const afterCreature = resolveAction(opening, {
      type: 'play_card',
      playerId: 'player',
      cardInstanceId: opening.players.player.hand[0].instanceId,
    });

    expect(afterCreature.players.player.resources).toBe(0);
    expect(afterCreature.players.player.hand.map((card) => card.cardId)).toEqual(['cinder-bolt']);
    expect(afterCreature.players.player.battlefield).toEqual([
      expect.objectContaining({
        cardId: 'ember-scout',
        attack: 2,
        health: 1,
        exhausted: true,
      }),
    ]);

    const spellTurn = resolveAction(afterCreature, {
      type: 'end_turn',
      playerId: 'player',
    });

    const backToPlayer = resolveAction(spellTurn, {
      type: 'end_turn',
      playerId: 'enemy',
    });

    const afterSpell = resolveAction(backToPlayer, {
      type: 'play_card',
      playerId: 'player',
      cardInstanceId: backToPlayer.players.player.hand[0].instanceId,
    });

    expect(afterSpell.players.enemy.health).toBe(17);
    expect(afterSpell.players.player.resources).toBe(1);
    expect(afterSpell.players.player.discard).toEqual(['cinder-bolt']);
    expect(afterSpell.players.player.hand.map((card) => card.cardId)).toEqual(['tide-guard']);
  });

  it('advances turns deterministically, refills resources, draws a card, and readies the next player board', () => {
    const opening = createGame({
      cards,
      playerDeck: ['ember-scout', 'cinder-bolt', 'tide-guard'],
      enemyDeck: ['tide-guard', 'ember-scout', 'cinder-bolt'],
      startingHandSize: 2,
      startingHealth: 20,
    });

    const afterPlay = resolveAction(opening, {
      type: 'play_card',
      playerId: 'player',
      cardInstanceId: opening.players.player.hand[0].instanceId,
    });

    const nextTurn = resolveAction(afterPlay, {
      type: 'end_turn',
      playerId: 'player',
    });

    expect(nextTurn.activePlayerId).toBe('enemy');
    expect(nextTurn.turn).toBe(2);
    expect(nextTurn.players.enemy.maxResources).toBe(1);
    expect(nextTurn.players.enemy.resources).toBe(1);
    expect(nextTurn.players.enemy.hand.map((card) => card.cardId)).toEqual([
      'tide-guard',
      'ember-scout',
      'cinder-bolt',
    ]);

    const backToPlayer = resolveAction(nextTurn, {
      type: 'end_turn',
      playerId: 'enemy',
    });

    expect(backToPlayer.activePlayerId).toBe('player');
    expect(backToPlayer.turn).toBe(3);
    expect(backToPlayer.players.player.maxResources).toBe(2);
    expect(backToPlayer.players.player.resources).toBe(2);
    expect(backToPlayer.players.player.hand.map((card) => card.cardId)).toEqual(['cinder-bolt', 'tide-guard']);
    expect(backToPlayer.players.player.battlefield[0].exhausted).toBe(false);
  });

  it('awards the game when a damage spell reduces the opponent to zero health', () => {
    const game = createGame({
      cards,
      playerDeck: ['cinder-bolt'],
      enemyDeck: ['ember-scout'],
      startingHandSize: 1,
      startingHealth: 3,
    });

    const finished = resolveAction(game, {
      type: 'play_card',
      playerId: 'player',
      cardInstanceId: game.players.player.hand[0].instanceId,
    });

    expect(finished.winnerId).toBe('player');
    expect(finished.players[getOpponentId('player')].health).toBe(0);
    expect(getLegalActions(finished)).toEqual([]);
  });

  it('adds an attack action for ready creatures and applies combat damage to the opposing hero', () => {
    const opening = createGame({
      cards,
      playerDeck: ['ember-scout', 'cinder-bolt', 'tide-guard'],
      enemyDeck: ['tide-guard', 'ember-scout', 'cinder-bolt'],
      startingHandSize: 2,
      startingHealth: 20,
    });

    const afterPlay = resolveAction(opening, {
      type: 'play_card',
      playerId: 'player',
      cardInstanceId: opening.players.player.hand[0].instanceId,
    });
    const enemyTurn = resolveAction(afterPlay, {
      type: 'end_turn',
      playerId: 'player',
    });
    const backToPlayer = resolveAction(enemyTurn, {
      type: 'end_turn',
      playerId: 'enemy',
    });

    expect(getLegalActions(backToPlayer)).toContainEqual({
      type: 'attack',
      playerId: 'player',
      attackerInstanceId: backToPlayer.players.player.battlefield[0].instanceId,
      target: {
        type: 'hero',
        playerId: 'enemy',
      },
    });

    const afterAttack = resolveAction(backToPlayer, {
      type: 'attack',
      playerId: 'player',
      attackerInstanceId: backToPlayer.players.player.battlefield[0].instanceId,
      target: {
        type: 'hero',
        playerId: 'enemy',
      },
    });

    expect(afterAttack.players.enemy.health).toBe(18);
    expect(afterAttack.players.player.battlefield[0].exhausted).toBe(true);
  });

  it('resolves creature combat by dealing simultaneous damage and moving defeated units out of the battlefield', () => {
    const opening = createGame({
      cards,
      playerDeck: ['ember-scout', 'cinder-bolt', 'tide-guard'],
      enemyDeck: ['ember-scout', 'tide-guard', 'cinder-bolt'],
      startingHandSize: 2,
      startingHealth: 20,
    });

    const playerSetup = resolveAction(opening, {
      type: 'play_card',
      playerId: 'player',
      cardInstanceId: opening.players.player.hand[0].instanceId,
    });
    const enemyTurn = resolveAction(playerSetup, {
      type: 'end_turn',
      playerId: 'player',
    });
    const enemySetup = resolveAction(enemyTurn, {
      type: 'play_card',
      playerId: 'enemy',
      cardInstanceId: enemyTurn.players.enemy.hand[0].instanceId,
    });
    const backToPlayer = resolveAction(enemySetup, {
      type: 'end_turn',
      playerId: 'enemy',
    });

    const afterAttack = resolveAction(backToPlayer, {
      type: 'attack',
      playerId: 'player',
      attackerInstanceId: backToPlayer.players.player.battlefield[0].instanceId,
      target: {
        type: 'creature',
        playerId: 'enemy',
        instanceId: backToPlayer.players.enemy.battlefield[0].instanceId,
      },
    });

    expect(afterAttack.players.player.battlefield).toEqual([]);
    expect(afterAttack.players.enemy.battlefield).toEqual([]);
    expect(afterAttack.players.player.discard).toEqual(['ember-scout']);
    expect(afterAttack.players.enemy.discard).toEqual(['ember-scout']);
  });
});
