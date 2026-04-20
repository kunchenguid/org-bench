const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPlayableCardIds,
  getTutorialStep,
  getAttackCue,
} = require('./tutorial-state.js');

test('marks only affordable player hand cards as playable', () => {
  const state = {
    mana: 1,
    hand: [
      { id: 'spark', cost: 1, owner: 'player' },
      { id: 'giant', cost: 3, owner: 'player' },
      { id: 'enemy-card', cost: 0, owner: 'enemy' },
    ],
  };

  assert.deepEqual(getPlayableCardIds(state), ['spark']);
});

test('guides the opening turn toward playing a card first', () => {
  const state = {
    phase: 'player',
    mana: 1,
    hand: [{ id: 'spark', cost: 1, owner: 'player' }],
    board: { player: [], enemy: [{ id: 'enemy-guard', canBeAttacked: false }] },
    tutorial: { playedCardThisTurn: false, attackedThisTurn: false },
  };

  assert.equal(getTutorialStep(state).id, 'play-card');
});

test('guides the player to attack when a ready ally has a legal target', () => {
  const state = {
    phase: 'player',
    mana: 0,
    hand: [],
    board: {
      player: [{ id: 'vanguard', canAttack: true }],
      enemy: [{ id: 'enemy-guard', canBeAttacked: true }],
    },
    tutorial: { playedCardThisTurn: true, attackedThisTurn: false },
  };

  assert.equal(getTutorialStep(state).id, 'attack');
});

test('surfaces an end turn prompt when no action remains', () => {
  const state = {
    phase: 'player',
    mana: 0,
    hand: [{ id: 'giant', cost: 3, owner: 'player' }],
    board: { player: [], enemy: [] },
    tutorial: { playedCardThisTurn: true, attackedThisTurn: true },
  };

  assert.equal(getTutorialStep(state).id, 'end-turn');
});

test('returns the first attack cue for the guided prompt', () => {
  const state = {
    board: {
      player: [{ id: 'vanguard', canAttack: true }, { id: 'scout', canAttack: false }],
      enemy: [{ id: 'enemy-guard', canBeAttacked: true }, { id: 'enemy-hero', canBeAttacked: true }],
    },
  };

  assert.deepEqual(getAttackCue(state), {
    attackerId: 'vanguard',
    targetId: 'enemy-guard',
  });
});
