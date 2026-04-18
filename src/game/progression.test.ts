import { describe, expect, test } from 'vitest';

import { advanceEncounter, createCampaignProgress, markEncounterFailed } from './progression';

describe('campaign progression', () => {
  test('advanceEncounter marks the current encounter cleared and moves to the next one', () => {
    const progress = createCampaignProgress(['gate', 'spire', 'crown']);

    const nextProgress = advanceEncounter(progress);

    expect(nextProgress.currentEncounterId).toBe('spire');
    expect(nextProgress.clearedEncounterIds).toEqual(['gate']);
    expect(nextProgress.status).toBe('in_progress');
  });

  test('advanceEncounter marks the campaign complete after the final encounter', () => {
    const progress = {
      ...createCampaignProgress(['gate', 'spire']),
      clearedEncounterIds: ['gate'],
      currentEncounterId: 'spire',
    };

    const nextProgress = advanceEncounter(progress);

    expect(nextProgress.currentEncounterId).toBeNull();
    expect(nextProgress.clearedEncounterIds).toEqual(['gate', 'spire']);
    expect(nextProgress.status).toBe('won');
  });

  test('markEncounterFailed leaves the encounter in place and marks the campaign lost', () => {
    const progress = createCampaignProgress(['gate', 'spire']);

    const nextProgress = markEncounterFailed(progress);

    expect(nextProgress.currentEncounterId).toBe('gate');
    expect(nextProgress.clearedEncounterIds).toEqual([]);
    expect(nextProgress.status).toBe('lost');
  });
});
