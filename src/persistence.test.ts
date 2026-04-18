import { describe, expect, it } from 'vitest';

import { advanceTurn, createDuelState } from './game/state';

import {
  clearEncounterSnapshot,
  createEncounterStorageKey,
  loadEncounterSnapshot,
  saveEncounterSnapshot,
  type EncounterSnapshot
} from './persistence';

describe('persistence helpers', () => {
  it('creates a run-scoped storage key', () => {
    expect(createEncounterStorageKey('facebook-seed-01')).toBe(
      'duel-of-ash-and-aether:facebook-seed-01:encounter'
    );
  });

  it('loads and saves the persisted encounter snapshot shape', () => {
    const duelState = advanceTurn(
      createDuelState({
        playerDeck: ['p1', 'p2', 'p3', 'p4'],
        opponentDeck: ['o1', 'o2', 'o3', 'o4'],
        openingHandSize: 2
      })
    );

    const snapshot: EncounterSnapshot = {
      runId: 'facebook-seed-01',
      encounterId: 'ember-watch',
      encounterName: 'Ember Watch',
      playerFaction: 'Ember Guild',
      rivalFaction: 'Aether Covenant',
      step: 'mid-duel',
      duelState,
      updatedAt: '2026-04-18T12:00:00.000Z'
    };

    saveEncounterSnapshot(window.localStorage, snapshot.runId, snapshot);

    expect(loadEncounterSnapshot(window.localStorage, snapshot.runId)).toEqual(snapshot);
  });

  it('clears the persisted encounter snapshot for a run', () => {
    const runId = 'facebook-seed-01';

    window.localStorage.setItem(createEncounterStorageKey(runId), '{"runId":"facebook-seed-01"}');

    clearEncounterSnapshot(window.localStorage, runId);

    expect(loadEncounterSnapshot(window.localStorage, runId)).toBeNull();
  });

  it('drops invalid persisted duel state data', () => {
    const runId = 'facebook-seed-01';

    window.localStorage.setItem(
      createEncounterStorageKey(runId),
      JSON.stringify({
        runId,
        encounterId: 'ember-watch',
        encounterName: 'Ember Watch',
        playerFaction: 'Ember Guild',
        rivalFaction: 'Aether Covenant',
        step: 'mid-duel',
        duelState: { activePlayer: 'nobody' },
        updatedAt: '2026-04-18T12:00:00.000Z'
      })
    );

    expect(loadEncounterSnapshot(window.localStorage, runId)).toBeNull();
  });
});
