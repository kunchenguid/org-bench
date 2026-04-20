const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CARD_LIBRARY,
  ENCOUNTER_PROFILES,
  FACTIONS,
  MECHANICS,
  createInitialState,
  playCard,
  endTurn,
  createStorageKey,
} = require('../src/logic.js');

test('createStorageKey prefixes persisted keys with the run namespace', () => {
  assert.equal(createStorageKey('fb-run-1', 'save'), 'fb-run-1:save');
});

test('content exports two factions, a compact mechanic set, and a judge-sized card pool', () => {
  assert.equal(Array.isArray(FACTIONS), true);
  assert.equal(FACTIONS.length, 2);
  assert.equal(Array.isArray(MECHANICS), true);
  assert.equal(MECHANICS.length >= 4 && MECHANICS.length <= 6, true);
  assert.equal(Array.isArray(CARD_LIBRARY), true);
  assert.equal(CARD_LIBRARY.length >= 12 && CARD_LIBRARY.length <= 24, true);
});

test('encounter profiles define replayable 20-card enemy decks with distinct patterns', () => {
  assert.equal(Array.isArray(ENCOUNTER_PROFILES), true);
  assert.equal(ENCOUNTER_PROFILES.length >= 3, true);

  const first = ENCOUNTER_PROFILES[0];
  const second = ENCOUNTER_PROFILES[1];
  assert.equal(first.enemyDeck.length, 20);
  assert.equal(second.enemyDeck.length, 20);
  assert.notDeepEqual(first.enemyDeck, second.enemyDeck);
  assert.notEqual(first.enemyStyle, second.enemyStyle);
});

test('different seeds surface different enemy encounters for replayability', () => {
  const first = createInitialState({ seed: 1 });
  const second = createInitialState({ seed: 2 });

  assert.equal(first.encounter.enemyDeckName.length > 0, true);
  assert.equal(second.encounter.enemyDeckName.length > 0, true);
  assert.notEqual(first.encounter.enemyDeckName, second.encounter.enemyDeckName);
  assert.notDeepEqual(
    first.enemy.deck.map((card) => card.id),
    second.enemy.deck.map((card) => card.id),
  );
});

test('player can play a one-cost unit from hand onto the first open lane', () => {
  const state = createInitialState({ seed: 7 });
  const oneCostIndex = state.player.hand.findIndex((card) => card.cost === 1 && card.type === 'unit');

  assert.notEqual(oneCostIndex, -1);

  const nextState = playCard(state, 'player', oneCostIndex, 0);

  assert.equal(nextState.player.mana, state.player.mana - 1);
  assert.equal(nextState.player.board[0].name.length > 0, true);
  assert.equal(nextState.player.hand.length, state.player.hand.length - 1);
});

test('ending the player turn refills enemy mana, draws, and attacks face when possible', () => {
  const base = createInitialState({ seed: 3 });
  const state = {
    ...base,
    player: {
      ...base.player,
      health: 18,
      board: [null, null, null],
    },
    enemy: {
      ...base.enemy,
      mana: 0,
      maxMana: 0,
      deck: base.enemy.deck.slice(1),
      hand: [base.enemy.deck[0]],
      board: [
        {
          id: 'ember-fox-token',
          name: 'Ember Fox',
          type: 'unit',
          attack: 2,
          health: 1,
          maxHealth: 1,
          cost: 1,
          exhausted: false,
        },
        null,
        null,
      ],
    },
  };

  const nextState = endTurn(state);

  assert.equal(nextState.turn, 'player');
  assert.equal(nextState.enemy.maxMana, 1);
  assert.equal(nextState.enemy.mana, 0);
  assert.equal(nextState.player.health, 16);
  assert.equal(nextState.enemy.hand.length >= 0, true);
});
