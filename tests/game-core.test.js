const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CARD_LIBRARY,
  createInitialState,
  createStorageAdapter,
  playCard,
  endPlayerTurn,
  performEnemyTurn,
} = require('../src/game-core.js');

test('createInitialState builds a 20-card guided opening hand with a playable first turn', () => {
  const state = createInitialState({ rng: () => 0.25 });

  assert.ok(Object.keys(CARD_LIBRARY).length >= 12);
  assert.equal(state.turn, 1);
  assert.equal(state.activeSide, 'player');
  assert.equal(state.tutorial.step, 'play-a-card');
  assert.equal(state.player.hand.length, 3);
  assert.equal(state.enemy.hand.length, 3);
  assert.equal(state.player.deck.length + state.player.hand.length, 20);
  assert.equal(state.enemy.deck.length + state.enemy.hand.length, 20);
  assert.ok(state.player.hand.some((card) => card.cost <= state.player.mana));
});

test('storage adapter prefixes saves with the run namespace and round-trips JSON', () => {
  const writes = new Map();
  const storage = {
    getItem(key) {
      return writes.has(key) ? writes.get(key) : null;
    },
    setItem(key, value) {
      writes.set(key, value);
    },
    removeItem(key) {
      writes.delete(key);
    },
  };

  const adapter = createStorageAdapter(storage, 'apple-run-17');
  adapter.save({ turn: 3, winner: null });

  assert.equal(writes.has('apple-run-17:duel-tcg-save'), true);
  assert.deepEqual(adapter.load(), { turn: 3, winner: null });
});

test('playing a card advances the guided tutorial toward ending the turn', () => {
  const state = createInitialState({ rng: () => 0.25 });
  const playableIndex = state.player.hand.findIndex((card) => card.cost <= state.player.mana);

  const played = playCard(state, playableIndex);

  assert.equal(played, true);
  assert.equal(state.player.board.length, 1);
  assert.equal(state.player.board[0].summoningSickness, true);
  assert.equal(state.tutorial.step, 'end-turn');
  assert.match(state.tutorial.message, /end your turn/i);
});

test('enemy turn spends mana on a playable unit and attacks a guard before the hero', () => {
  const state = createInitialState({ rng: () => 0.25 });

  state.player.board = [{
    uid: 'player-guard-1',
    cardId: 'sunlance',
    owner: 'player',
    name: 'Sunlance Sentry',
    faction: 'sol',
    cost: 2,
    attack: 2,
    health: 3,
    maxHealth: 3,
    text: 'Durable frontline fighter.',
    art: 'assets/cards/sunlance.svg',
    ready: true,
    summoningSickness: false,
    keywords: ['guard'],
  }];
  state.enemy.hand = [{
    uid: 'enemy-adept-1',
    cardId: 'moonwarden',
    owner: 'enemy',
    name: 'Moonwarden',
    faction: 'luna',
    cost: 2,
    attack: 2,
    health: 2,
    maxHealth: 2,
    text: 'Balanced defender with clear stats.',
    art: 'assets/cards/moonwarden.svg',
    ready: false,
    summoningSickness: true,
    keywords: [],
  }];
  state.enemy.board = [{
    uid: 'enemy-raider-1',
    cardId: 'mistfox',
    owner: 'enemy',
    name: 'Mistfox',
    faction: 'luna',
    cost: 1,
    attack: 1,
    health: 1,
    maxHealth: 1,
    text: 'Quick skirmisher that rewards trading first.',
    art: 'assets/cards/mistfox.svg',
    ready: true,
    summoningSickness: false,
    keywords: [],
  }];
  state.enemy.maxMana = 2;
  state.enemy.mana = 2;
  state.activeSide = 'enemy';
  state.pendingAi = true;

  const ended = endPlayerTurn(state);
  assert.equal(ended, false);

  const acted = performEnemyTurn(state);

  assert.equal(acted, true);
  assert.equal(state.activeSide, 'player');
  assert.equal(state.enemy.board.length, 1);
  assert.equal(state.player.board.length, 0);
  assert.equal(state.player.hero.health, 20);
  assert.match(state.message, /your turn/i);
});
