import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceEncounter,
  createInitialState,
  deserializeBattleState,
  performPlayerAction,
  resolveEnemyTurn,
  serializeBattleState,
} from './game';

test('createInitialState starts an active encounter', () => {
  const state = createInitialState();

  assert.equal(state.status, 'active');
  assert.equal(state.turn, 'player');
  assert.equal(state.player.hp, 30);
  assert.equal(state.enemy.hp, 24);
  assert.match(state.log[0], /rogue ai/i);
});

test('attack advances combat and damages the enemy', () => {
  const next = performPlayerAction(createInitialState(), 'attack');

  assert.equal(next.turn, 'enemy');
  assert.equal(next.enemy.hp, 18);
  assert.match(next.log.at(-1) ?? '', /strike/i);
});

test('defend reduces incoming damage on the enemy turn', () => {
  const defended = performPlayerAction(createInitialState(), 'defend');
  const afterEnemy = resolveEnemyTurn(defended);

  assert.equal(afterEnemy.turn, 'player');
  assert.equal(afterEnemy.player.hp, 27);
  assert.match(afterEnemy.log.at(-2) ?? '', /brace/i);
});

test('winning attack ends the encounter before the enemy acts', () => {
  const state = createInitialState();
  state.enemy.hp = 6;

  const next = performPlayerAction(state, 'attack');

  assert.equal(next.status, 'won');
  assert.equal(next.turn, 'complete');
  assert.equal(next.enemy.hp, 0);
});

test('advanceEncounter promotes the run to the next rogue AI duel', () => {
  const won = createInitialState();
  won.status = 'won';
  won.turn = 'complete';
  won.enemy.hp = 0;
  won.player.hp = 24;

  const next = advanceEncounter(won);

  assert.equal(next.status, 'active');
  assert.equal(next.turn, 'player');
  assert.equal(next.encounterIndex, 1);
  assert.equal(next.player.hp, 24);
  assert.equal(next.enemy.hp, 30);
  assert.match(next.log.at(-1) ?? '', /apex mirror/i);
});

test('serializeBattleState round-trips encounter progress and shield state', () => {
  const defended = performPlayerAction(createInitialState(), 'defend');
  const saved = serializeBattleState(defended);
  const restored = deserializeBattleState(saved);

  assert.deepEqual(restored, defended);
});
