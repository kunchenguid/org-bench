import { describe, expect, test } from 'vitest';

import { createEncounterState, createLadder, endTurn } from './duel-engine';

describe('duel lethal resolution', () => {
  test('does not advance turns after the opponent has already been defeated', () => {
    const encounter = createEncounterState(createLadder()[0]);
    const finishedEncounter = {
      ...encounter,
      opponent: {
        ...encounter.opponent,
        health: 0,
      },
    };

    expect(endTurn(finishedEncounter)).toEqual(finishedEncounter);
  });
});
