const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createInitialState,
  playCard,
  attackWithUnit,
  endTurn,
  serializeState,
  deserializeState,
} = require('../game-logic.js');

test('createInitialState deals opening hands and sets player turn', () => {
  const state = createInitialState(7);

  assert.equal(state.turn, 1);
  assert.equal(state.currentPlayer, 'player');
  assert.equal(state.player.hand.length, 3);
  assert.equal(state.enemy.hand.length, 3);
  assert.equal(state.player.mana, 1);
  assert.equal(state.player.maxMana, 1);
  assert.equal(state.enemy.board.length, 0);
});

test('playCard spends mana and summons the unit to board', () => {
  const state = createInitialState(7);
  const playableIndex = state.player.hand.findIndex((card) => card.cost <= state.player.mana);

  assert.notEqual(playableIndex, -1);

  const next = playCard(state, 'player', playableIndex);

  assert.equal(next.player.board.length, 1);
  assert.equal(next.player.hand.length, 2);
  assert.equal(next.player.mana, 0);
  assert.equal(next.player.board[0].sleeping, true);
});

test('endTurn advances to the enemy and resolves a basic ai turn', () => {
  const state = createInitialState(7);
  const next = endTurn(state);

  assert.equal(next.currentPlayer, 'player');
  assert.equal(next.turn, 2);
  assert.ok(next.log.some((entry) => entry.includes('Enemy turn')));
});

test('attackWithUnit damages the opposing hero and exhausts the attacker', () => {
  let state = createInitialState(7);
  const playableIndex = state.player.hand.findIndex((card) => card.cost <= state.player.mana);

  state = playCard(state, 'player', playableIndex);
  state.player.board[0].sleeping = false;

  const next = attackWithUnit(state, 'player', 0);

  assert.equal(next.enemy.health, 19);
  assert.equal(next.player.board[0].sleeping, true);
});

test('serializeState and deserializeState preserve the duel state', () => {
  const state = createInitialState(7);
  const saved = serializeState(state);
  const restored = deserializeState(saved);

  assert.deepEqual(restored, state);
});
