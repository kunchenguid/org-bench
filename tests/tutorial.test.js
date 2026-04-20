const test = require('node:test');
const assert = require('node:assert/strict');

const { getTutorialState } = require('../src/tutorial.js');

test('fresh player turn highlights playable cards and teaches the first summon', () => {
  const tutorial = getTutorialState({
    game: {
      turn: 'player',
      player: {
        mana: 1,
        hand: [
          { name: 'Ember Fox', type: 'unit', cost: 1, exhausted: false },
          { name: 'Ash Drake', type: 'unit', cost: 4, exhausted: false },
        ],
        board: [null, null, null],
      },
      enemy: { board: [null, null, null] },
    },
    selectedCard: -1,
    hoveredCard: -1,
    hoveredLane: -1,
  });

  assert.equal(tutorial.prompt, 'Play a glowing card from your hand.');
  assert.deepEqual(tutorial.highlightHandIndices, [0]);
  assert.equal(tutorial.endTurnPulse, false);
});

test('after selecting a unit, tutorial highlights open lanes', () => {
  const tutorial = getTutorialState({
    game: {
      turn: 'player',
      player: {
        mana: 2,
        hand: [
          { name: 'Ember Fox', type: 'unit', cost: 1 },
          { name: 'Flare Guard', type: 'unit', cost: 2 },
        ],
        board: [null, { name: 'Flare Guard', exhausted: true }, null],
      },
      enemy: { board: [null, null, null] },
    },
    selectedCard: 0,
    hoveredCard: -1,
    hoveredLane: -1,
  });

  assert.equal(tutorial.prompt, 'Choose a glowing lane to summon Ember Fox.');
  assert.deepEqual(tutorial.highlightLaneIndices, [0, 2]);
  assert.equal(tutorial.endTurnPulse, false);
});

test('when a unit is ready, tutorial teaches attacking before ending turn', () => {
  const tutorial = getTutorialState({
    game: {
      turn: 'player',
      player: {
        mana: 0,
        hand: [{ name: 'Ash Drake', type: 'unit', cost: 4 }],
        board: [
          { name: 'Ember Fox', exhausted: false },
          null,
          null,
        ],
      },
      enemy: {
        board: [
          { name: 'Mist Wisp', exhausted: true },
          null,
          null,
        ],
      },
    },
    selectedCard: -1,
    hoveredCard: -1,
    hoveredLane: -1,
  });

  assert.equal(tutorial.prompt, 'Attack with your glowing unit or end the turn.');
  assert.deepEqual(tutorial.attackLaneIndices, [0]);
  assert.equal(tutorial.endTurnPulse, true);
});
