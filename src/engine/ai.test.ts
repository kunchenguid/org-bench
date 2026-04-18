import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseAiPlan, createEncounterBehavior, type AiState } from './ai.ts';

function createState(overrides: Partial<AiState> = {}): AiState {
  return {
    turn: 4,
    mana: 5,
    aiHealth: 18,
    playerHealth: 20,
    hand: [],
    board: [],
    enemyBoard: [],
    ...overrides,
  };
}

test('deploys the highest pressure affordable creature by default', () => {
  const plan = chooseAiPlan(
    createState({
      hand: [
        { id: 'ember-scout', type: 'creature', cost: 2, attack: 2, health: 1 },
        { id: 'ashen-brute', type: 'creature', cost: 4, attack: 5, health: 4 },
      ],
    }),
    createEncounterBehavior(),
  );

  assert.deepEqual(plan.deploy, {
    cardId: 'ashen-brute',
    reason: 'highest-pressure-creature',
  });
});

test('uses a lethal spell before deploying when hero pressure is available', () => {
  const plan = chooseAiPlan(
    createState({
      mana: 6,
      playerHealth: 4,
      hand: [
        { id: 'cinder-bolt', type: 'spell', cost: 2, damage: 4 },
        { id: 'ashen-brute', type: 'creature', cost: 4, attack: 5, health: 4 },
      ],
    }),
    createEncounterBehavior({ spellBias: 0.85 }),
  );

  assert.deepEqual(plan.spell, {
    cardId: 'cinder-bolt',
    target: 'enemy-hero',
    reason: 'lethal-spell',
  });
});

test('encounter variation seed breaks equal deploy ties deterministically', () => {
  const state = createState({
    hand: [
      { id: 'aether-fox', type: 'creature', cost: 3, attack: 3, health: 2 },
      { id: 'brass-hound', type: 'creature', cost: 3, attack: 3, health: 2 },
    ],
  });

  const first = chooseAiPlan(state, createEncounterBehavior({ variationSeed: 1 }));
  const second = chooseAiPlan(state, createEncounterBehavior({ variationSeed: 1 }));
  const shifted = chooseAiPlan(state, createEncounterBehavior({ variationSeed: 7 }));

  assert.equal(first.deploy?.cardId, second.deploy?.cardId);
  assert.notEqual(first.deploy?.cardId, shifted.deploy?.cardId);
});
