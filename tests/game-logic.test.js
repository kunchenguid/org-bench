const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createInitialState,
  playCard,
  runAiTurn,
  createStorageKey,
  serializeState,
  deserializeState,
} = require('../game-logic.js');

test('initial state deals a guided playable opening hand', () => {
  const state = createInitialState(7);

  assert.equal(state.turn, 1);
  assert.equal(state.currentPlayer, 'player');
  assert.equal(state.player.mana, 1);
  assert.equal(state.player.maxMana, 1);
  assert.equal(state.player.hand.length, 4);
  assert.ok(state.player.hand.some((card) => card.cost <= state.player.mana));
  assert.equal(state.log[0].type, 'tutorial');
});

test('playing a unit spends mana and summons it exhausted', () => {
  let state = createInitialState(7);
  const card = state.player.hand.find((entry) => entry.type === 'unit' && entry.cost === 1);

  assert.ok(card, 'expected a playable 1-cost unit');

  state = playCard(state, 'player', card.instanceId);

  assert.equal(state.player.mana, 0);
  assert.equal(state.player.board.length, 1);
  assert.equal(state.player.board[0].instanceId, card.instanceId);
  assert.equal(state.player.board[0].canAttack, false);
  assert.equal(state.player.hand.some((entry) => entry.instanceId === card.instanceId), false);
});

test('ai turn plays cards and advances back to the player', () => {
  let state = createInitialState(11);
  const firstPlayable = state.player.hand.find((entry) => entry.cost <= state.player.mana);
  state = playCard(state, 'player', firstPlayable.instanceId);

  state = runAiTurn(state);

  assert.equal(state.currentPlayer, 'player');
  assert.equal(state.turn, 2);
  assert.ok(state.log.some((entry) => entry.type === 'ai-turn-complete'));
  assert.equal(state.enemy.maxMana, 1);
  assert.equal(state.player.maxMana, 2);
});

test('state survives serialization with a namespaced storage key', () => {
  const state = createInitialState(19);
  const key = createStorageKey('run-42:');
  const roundTrip = deserializeState(serializeState(state));

  assert.equal(key, 'run-42:apple-duel-save');
  assert.equal(roundTrip.seed, state.seed);
  assert.equal(roundTrip.player.hand.length, state.player.hand.length);
  assert.equal(roundTrip.enemy.deck.length, state.enemy.deck.length);
});
