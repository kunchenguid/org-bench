const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEncounterSet,
  createInitialState,
  getEnemyTurnPlan,
  applyEnemyTurn,
} = require('../src/game-core.js');

test('createEncounterSet exposes multiple encounters with distinct enemy decks', () => {
  const encounters = createEncounterSet();

  assert.equal(encounters.length >= 2, true);
  assert.notDeepEqual(encounters[0].enemyDeck, encounters[1].enemyDeck);
  assert.notEqual(encounters[0].enemyHero.name, encounters[1].enemyHero.name);
});

test('getEnemyTurnPlan plays a card when the enemy has enough mana', () => {
  const state = createInitialState(createEncounterSet()[0], 7);
  state.enemy.mana = 2;
  state.enemy.maxMana = 2;
  state.enemy.hand = [
    { id: 'bog-spider', name: 'Bog Spider', cost: 2, attack: 2, health: 2 },
  ];

  const plan = getEnemyTurnPlan(state);

  assert.deepEqual(plan.map((step) => step.type), ['play-card', 'end-turn']);
  assert.equal(plan[0].card.name, 'Bog Spider');
});

test('getEnemyTurnPlan attacks the opposing hero when no defender is on board', () => {
  const state = createInitialState(createEncounterSet()[0], 5);
  state.enemy.hand = [];
  state.enemy.board = [
    { id: 'bog-spider', name: 'Bog Spider', attack: 2, health: 2, currentHealth: 2, exhausted: false },
  ];
  state.player.board = [];

  const plan = getEnemyTurnPlan(state);

  assert.deepEqual(plan.map((step) => step.type), ['attack-hero', 'end-turn']);
});

test('applyEnemyTurn spends mana, summons the minion, and deals hero damage', () => {
  const state = createInitialState(createEncounterSet()[0], 3);
  state.enemy.mana = 3;
  state.enemy.maxMana = 3;
  state.enemy.hand = [
    { id: 'reef-raider', name: 'Reef Raider', cost: 1, attack: 1, health: 1 },
  ];
  state.enemy.board = [
    { id: 'bog-spider', name: 'Bog Spider', attack: 2, health: 2, currentHealth: 2, exhausted: false },
  ];
  state.player.health = 12;

  const result = applyEnemyTurn(state);

  assert.equal(result.state.enemy.mana, 2);
  assert.equal(result.state.enemy.board.length, 2);
  assert.equal(result.state.player.health, 10);
  assert.equal(result.events.some((event) => event.type === 'enemy-play-card'), true);
  assert.equal(result.events.some((event) => event.type === 'enemy-attack-hero'), true);
});
