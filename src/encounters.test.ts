import { describe, expect, it } from 'vitest';

import {
  ENCOUNTERS,
  advanceEncounter,
  createEncounterRun,
  chooseEnemyTurn,
} from './encounters';

describe('chooseEnemyTurn', () => {
  it('plays the highest damage card the enemy can afford', () => {
    const choice = chooseEnemyTurn({
      mana: 2,
      hand: ENCOUNTERS[0].enemyDeck,
    });

    expect(choice).toEqual({
      cardId: 'raider-warcry',
      damage: 3,
      spentMana: 2,
    });
  });

  it('passes when no card is playable', () => {
    const choice = chooseEnemyTurn({
      mana: 0,
      hand: ENCOUNTERS[1].enemyDeck,
    });

    expect(choice).toEqual({
      cardId: null,
      damage: 0,
      spentMana: 0,
    });
  });
});

describe('advanceEncounter', () => {
  it('moves to the next encounter after a win', () => {
    const run = createEncounterRun();

    const advanced = advanceEncounter(run, 'won');

    expect(advanced.currentEncounter.id).toBe(ENCOUNTERS[1].id);
    expect(advanced.completedEncounterIds).toEqual([ENCOUNTERS[0].id]);
    expect(advanced.isComplete).toBe(false);
  });

  it('marks the run complete after the final win', () => {
    const run = {
      currentEncounter: ENCOUNTERS[ENCOUNTERS.length - 1],
      completedEncounterIds: ENCOUNTERS.slice(0, -1).map((encounter) => encounter.id),
      isComplete: false,
    };

    const advanced = advanceEncounter(run, 'won');

    expect(advanced.currentEncounter.id).toBe(ENCOUNTERS[ENCOUNTERS.length - 1].id);
    expect(advanced.completedEncounterIds).toEqual(ENCOUNTERS.map((encounter) => encounter.id));
    expect(advanced.isComplete).toBe(true);
  });

  it('keeps the same encounter after a loss', () => {
    const run = createEncounterRun();

    const advanced = advanceEncounter(run, 'lost');

    expect(advanced).toEqual(run);
  });
});
