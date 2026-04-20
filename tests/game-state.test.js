const assert = require('node:assert/strict');

const {
  CARD_LIBRARY,
  createInitialState,
  createStorageKey,
  playCard,
  attackTarget,
  endPlayerTurn,
} = require('../src/game-state.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeState(overrides = {}) {
  const base = createInitialState({ seed: 7 });
  return Object.assign(base, overrides);
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('createStorageKey prefixes the provided namespace', () => {
  assert.equal(createStorageKey('apple-run-1', 'save'), 'apple-run-1:save');
});

test('createInitialState creates opening hands and mana for a new duel', () => {
  const state = createInitialState({ seed: 11 });

  assert.equal(state.player.hand.length, 4);
  assert.equal(state.enemy.hand.length, 4);
  assert.equal(state.player.deck.length, 16);
  assert.equal(state.enemy.deck.length, 16);
  assert.equal(state.player.maxMana, 1);
  assert.equal(state.player.mana, 1);
  assert.equal(state.turn, 'player');
});

test('playCard moves a unit from hand to board and spends mana', () => {
  const state = makeState({
    player: {
      health: 20,
      mana: 2,
      maxMana: 2,
      deck: [],
      hand: [clone(CARD_LIBRARY.sunlanceSquire)],
      board: [],
    },
  });

  const next = playCard(state, 'player', state.player.hand[0].instanceId);

  assert.equal(next.player.hand.length, 0);
  assert.equal(next.player.board.length, 1);
  assert.equal(next.player.board[0].name, 'Sunlance Squire');
  assert.equal(next.player.board[0].canAttack, false);
  assert.equal(next.player.mana, 1);
});

test('attackTarget applies simultaneous combat damage and removes defeated units', () => {
  const state = makeState({
    player: {
      health: 20,
      mana: 0,
      maxMana: 1,
      deck: [],
      hand: [],
      board: [{
        ...clone(CARD_LIBRARY.sunlanceSquire),
        currentHealth: 2,
        canAttack: true,
        asleep: false,
      }],
    },
    enemy: {
      health: 20,
      mana: 0,
      maxMana: 1,
      deck: [],
      hand: [],
      board: [{
        ...clone(CARD_LIBRARY.duskfangRaider),
        currentHealth: 1,
        canAttack: true,
        asleep: false,
      }],
    },
  });

  const next = attackTarget(state, 'player', state.player.board[0].instanceId, 'unit', state.enemy.board[0].instanceId);

  assert.equal(next.player.board.length, 1);
  assert.equal(next.player.board[0].currentHealth, 1);
  assert.equal(next.player.board[0].canAttack, false);
  assert.equal(next.enemy.board.length, 0);
});

test('endPlayerTurn refreshes the enemy turn and draws up to one card', () => {
  const state = makeState({
    turn: 'player',
    player: {
      health: 20,
      mana: 0,
      maxMana: 1,
      deck: [],
      hand: [],
      board: [],
    },
    enemy: {
      health: 20,
      mana: 0,
      maxMana: 1,
      deck: [clone(CARD_LIBRARY.bloomkinTender)],
      hand: [],
      board: [{
        ...clone(CARD_LIBRARY.duskfangRaider),
        currentHealth: 3,
        canAttack: false,
        asleep: true,
      }],
    },
  });

  const next = endPlayerTurn(state);

  assert.equal(next.turn, 'enemy');
  assert.equal(next.enemy.maxMana, 2);
  assert.equal(next.enemy.mana, 2);
  assert.equal(next.enemy.hand.length, 1);
  assert.equal(next.enemy.board[0].asleep, false);
  assert.equal(next.enemy.board[0].canAttack, true);
});
