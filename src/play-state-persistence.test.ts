import { describe, expect, it } from 'vitest';

import { createGame, type GameState } from './duel-engine';
import { ENCOUNTERS, advanceEncounter, createEncounterRun } from './encounters';
import {
  advanceSavedEncounterRun,
  completeSavedEncounter,
  clearSavedActiveEncounter,
  loadSavedActiveEncounter,
  loadSavedEncounterRun,
  resetSavedEncounterProgress,
  saveActiveEncounter,
  saveEncounterRun,
} from './play-state-persistence';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage() {
  const values = new Map<string, string>();

  const storage: MemoryStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };

  return { storage, values };
}

function createTestGame(): GameState {
  return createGame({
    cards: [
      { id: 'emberling', name: 'Emberling', kind: 'creature', cost: 1, attack: 1, health: 2 },
      { id: 'spark', name: 'Spark', kind: 'spell', cost: 1, damage: 2 },
    ],
    playerDeck: ['emberling', 'spark'],
    enemyDeck: ['spark', 'spark'],
    startingHandSize: 1,
    startingHealth: 20,
  });
}

describe('play state persistence', () => {
  it('saves and restores ladder progress with encounter ids', () => {
    const { storage, values } = createMemoryStorage();

    saveEncounterRun('run:apple-seed-01', storage, {
      currentEncounter: ENCOUNTERS[1],
      completedEncounterIds: [ENCOUNTERS[0].id],
      isComplete: false,
    });

    expect(values.get('run:apple-seed-01:encounter-run')).toBe(
      JSON.stringify({
        currentEncounterId: ENCOUNTERS[1].id,
        completedEncounterIds: [ENCOUNTERS[0].id],
        isComplete: false,
      }),
    );

    expect(loadSavedEncounterRun('run:apple-seed-01', storage)).toEqual({
      currentEncounter: ENCOUNTERS[1],
      completedEncounterIds: [ENCOUNTERS[0].id],
      isComplete: false,
    });
  });

  it('saves and restores an active encounter without network data', () => {
    const { storage } = createMemoryStorage();
    const game = createTestGame();

    saveActiveEncounter('run:apple-seed-01', storage, {
      encounter: ENCOUNTERS[0],
      game,
      statusMessage: 'Enemy turn resolved. Your move.',
      log: ['Started encounter: Cinder Raider.'],
    });

    expect(loadSavedActiveEncounter('run:apple-seed-01', storage)).toEqual({
      encounter: ENCOUNTERS[0],
      game,
      statusMessage: 'Enemy turn resolved. Your move.',
      log: ['Started encounter: Cinder Raider.'],
    });
  });

  it('falls back for broken saves and clears an encounter resume slot', () => {
    const { storage, values } = createMemoryStorage();

    values.set('run:apple-seed-01:encounter-run', JSON.stringify({ currentEncounterId: 'missing' }));
    values.set('run:apple-seed-01:active-encounter', JSON.stringify({ encounterId: ENCOUNTERS[0].id }));

    expect(loadSavedEncounterRun('run:apple-seed-01', storage)).toEqual(createEncounterRun());
    expect(loadSavedActiveEncounter('run:apple-seed-01', storage)).toBeNull();

    saveActiveEncounter('run:apple-seed-01', storage, {
      encounter: ENCOUNTERS[0],
      game: createTestGame(),
      statusMessage: 'Saved for clear test.',
      log: [],
    });
    clearSavedActiveEncounter('run:apple-seed-01', storage);

    expect(values.has('run:apple-seed-01:active-encounter')).toBe(false);
  });

  it('persists completed encounters so a reload can resume the next ladder node', () => {
    const { storage } = createMemoryStorage();
    const advancedRun = advanceEncounter(createEncounterRun(), 'won');

    saveEncounterRun('run:apple-seed-01', storage, advancedRun);

    const restoredRun = loadSavedEncounterRun('run:apple-seed-01', storage);

    expect(restoredRun.completedEncounterIds).toEqual([ENCOUNTERS[0].id]);
    expect(restoredRun.currentEncounter.id).toBe(ENCOUNTERS[1].id);
    expect(restoredRun.isComplete).toBe(false);
  });

  it('advances the saved encounter run in storage after a win', () => {
    const { storage } = createMemoryStorage();

    saveEncounterRun('run:apple-seed-01', storage, createEncounterRun());

    const advancedRun = advanceSavedEncounterRun('run:apple-seed-01', storage, 'won');

    expect(advancedRun).toEqual({
      currentEncounter: ENCOUNTERS[1],
      completedEncounterIds: [ENCOUNTERS[0].id],
      isComplete: false,
    });
    expect(loadSavedEncounterRun('run:apple-seed-01', storage)).toEqual(advancedRun);
  });

  it('marks the saved encounter run complete after the final win', () => {
    const { storage } = createMemoryStorage();

    saveEncounterRun('run:apple-seed-01', storage, {
      currentEncounter: ENCOUNTERS[ENCOUNTERS.length - 1],
      completedEncounterIds: ENCOUNTERS.slice(0, -1).map((encounter) => encounter.id),
      isComplete: false,
    });

    const completedRun = advanceSavedEncounterRun('run:apple-seed-01', storage, 'won');

    expect(completedRun).toEqual({
      currentEncounter: ENCOUNTERS[ENCOUNTERS.length - 1],
      completedEncounterIds: ENCOUNTERS.map((encounter) => encounter.id),
      isComplete: true,
    });
    expect(loadSavedEncounterRun('run:apple-seed-01', storage)).toEqual(completedRun);
  });

  it('clears the saved active encounter when recording a resolved encounter', () => {
    const { storage } = createMemoryStorage();

    saveEncounterRun('run:apple-seed-01', storage, createEncounterRun());
    saveActiveEncounter('run:apple-seed-01', storage, {
      encounter: ENCOUNTERS[0],
      game: createTestGame(),
      statusMessage: 'Ready to finish the fight.',
      log: ['Started encounter: Cinder Raider.'],
    });

    const advancedRun = completeSavedEncounter('run:apple-seed-01', storage, 'won');

    expect(advancedRun.currentEncounter.id).toBe(ENCOUNTERS[1].id);
    expect(loadSavedActiveEncounter('run:apple-seed-01', storage)).toBeNull();
  });

  it('keeps the same ladder node on a loss and clears the active encounter save', () => {
    const { storage } = createMemoryStorage();

    saveEncounterRun('run:apple-seed-01', storage, createEncounterRun());
    saveActiveEncounter('run:apple-seed-01', storage, {
      encounter: ENCOUNTERS[0],
      game: createTestGame(),
      statusMessage: 'The enemy has lethal on board.',
      log: ['Started encounter: Cinder Raider.'],
    });

    const runAfterLoss = completeSavedEncounter('run:apple-seed-01', storage, 'lost');

    expect(runAfterLoss).toEqual(createEncounterRun());
    expect(loadSavedActiveEncounter('run:apple-seed-01', storage)).toBeNull();
  });

  it('resets the saved ladder progress back to a fresh run and clears any active encounter', () => {
    const { storage } = createMemoryStorage();

    saveEncounterRun('run:apple-seed-01', storage, advanceEncounter(createEncounterRun(), 'won'));
    saveActiveEncounter('run:apple-seed-01', storage, {
      encounter: ENCOUNTERS[1],
      game: createTestGame(),
      statusMessage: 'Saved mid-run.',
      log: ['Started encounter: Grove Warden.'],
    });

    const resetRun = resetSavedEncounterProgress('run:apple-seed-01', storage);

    expect(resetRun).toEqual(createEncounterRun());
    expect(loadSavedEncounterRun('run:apple-seed-01', storage)).toEqual(createEncounterRun());
    expect(loadSavedActiveEncounter('run:apple-seed-01', storage)).toBeNull();
  });
});
