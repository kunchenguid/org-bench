const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseEncounterVariant,
  createInitialState,
  createStorageKey,
  describeEncounter,
  hydrateState,
  playCard,
  endTurn,
  runEnemyTurn,
} = require('../src/game-state.js');

test('createStorageKey prefixes every key with the run namespace', () => {
  assert.equal(
    createStorageKey('bench-42', 'save'),
    'bench-42:fb-duel-tcg:save'
  );
});

test('hydrateState returns a fresh opening state when storage is empty', () => {
  const state = hydrateState(null);

  assert.equal(state.turn, 1);
  assert.equal(state.currentActor, 'player');
   assert.equal(state.encounter.name, 'The Breach at Glasshouse Gate');
   assert.equal(state.player.hero.name, 'Lys, Heartroot Warden');
   assert.equal(state.enemy.hero.name, 'Commander Varka');
  assert.equal(state.player.hand.length, 3);
  assert.equal(state.enemy.hand.length, 3);
   assert.equal(state.player.hand[0].faction, 'verdant');
   assert.match(state.player.hand[0].rulesText, /survived/i);
});

test('playCard spends mana, moves the card to the board, and records a cue', () => {
  const openingState = createInitialState();
  const playableCardId = openingState.player.hand.find((card) => card.cost <= openingState.player.mana).id;

  const nextState = playCard(openingState, playableCardId);

  assert.equal(nextState.player.mana, openingState.player.mana - 1);
  assert.equal(nextState.player.board.length, 1);
  assert.equal(nextState.player.hand.length, 2);
  assert.match(nextState.tutorialCue.title, /Attack|Minion|End Turn/);
});

test('endTurn hands control to the enemy and refills enemy mana on curve', () => {
  const openingState = createInitialState();
  const nextState = endTurn(openingState);

  assert.equal(nextState.currentActor, 'enemy');
  assert.equal(nextState.turn, 1);
  assert.equal(nextState.enemy.mana, 1);
  assert.equal(nextState.enemy.maxMana, 1);
});

test('chooseEncounterVariant is deterministic per run seed and changes tutorial setup', () => {
  const shieldSeed = chooseEncounterVariant('shield-seed');
  const repeatedShieldSeed = chooseEncounterVariant('shield-seed');
  const rushSeed = chooseEncounterVariant('rush-seed');

  assert.deepEqual(repeatedShieldSeed, shieldSeed);
  assert.notEqual(rushSeed.id, shieldSeed.id);
  assert.notEqual(rushSeed.enemyBoard[0].templateId, shieldSeed.enemyBoard[0].templateId);
});

test('describeEncounter returns the visible matchup summary for the current duel', () => {
  const state = createInitialState();

  assert.equal(
    describeEncounter(state),
    'The Breach at Glasshouse Gate - Lys, Heartroot Warden vs Commander Varka'
  );
});

test('runEnemyTurn plays a legal card, attacks an open lane, and returns control to the player', () => {
  const state = createInitialState({ encounterSeed: 'rush-seed' });
  state.currentActor = 'enemy';
  state.enemy.maxMana = 3;
  state.enemy.mana = 3;
  state.enemy.hand = [
    { id: 'ember-volley-1', templateId: 'ember-volley', type: 'spell', cost: 3 },
    { id: 'ash-recruit-1', templateId: 'ash-recruit', type: 'unit', cost: 1, attack: 2, health: 1 },
  ];
  state.enemy.board = [];
  state.player.board = [];
  state.player.health = 20;

  const nextState = runEnemyTurn(state);

  assert.equal(nextState.currentActor, 'player');
  assert.equal(nextState.enemy.board.length, 1);
  assert.equal(nextState.player.health, 18);
  assert.match(nextState.lastEnemyPlan.summary, /Played Ash Recruit/);
});
