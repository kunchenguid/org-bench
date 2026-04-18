import { describe, expect, it } from 'vitest';

import {
  ACTIVE_ENCOUNTER_KEY,
  createEncounterDraft,
  getEncounterDraftKey,
  loadEncounterDraft,
  restoreEncounterDraft,
  restorePlaySession,
  saveEncounterDraft,
} from './encounterSession';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function createStorage(seed: Record<string, string> = {}): MemoryStorage {
  const values = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('encounter session persistence', () => {
  it('prefixes encounter storage keys with the harness namespace', () => {
    expect(getEncounterDraftKey('arena-gate')).toBe('org-bench:facebook-seed-01:play:encounter:arena-gate');
    expect(ACTIVE_ENCOUNTER_KEY).toBe('org-bench:facebook-seed-01:play:active-encounter');
  });

  it('saves drafts and marks the last active encounter', () => {
    const storage = createStorage();
    const draft = { encounterId: 'arena-gate', notes: 'Hold removal for the second wave.' };

    saveEncounterDraft(storage, draft);

    expect(storage.getItem(getEncounterDraftKey('arena-gate'))).toBe(JSON.stringify(draft));
    expect(storage.getItem(ACTIVE_ENCOUNTER_KEY)).toBe('arena-gate');
    expect(loadEncounterDraft(storage, 'arena-gate')).toEqual(draft);
  });

  it('restores the last in-progress encounter after reload', () => {
    const draft = { encounterId: 'mirror-knight', notes: 'Keep one blocker back for the counterattack.' };
    const storage = createStorage({
      [ACTIVE_ENCOUNTER_KEY]: 'mirror-knight',
      [getEncounterDraftKey('mirror-knight')]: JSON.stringify(draft),
    });

    expect(restorePlaySession(storage, 'arena-gate')).toEqual({ draft, resumed: true });
  });

  it('falls back to a fresh draft when saved data is missing or invalid', () => {
    const invalidStorage = createStorage({
      [getEncounterDraftKey('arena-gate')]: '{bad json',
    });

    expect(loadEncounterDraft(invalidStorage, 'arena-gate')).toBeNull();
    expect(restoreEncounterDraft(invalidStorage, 'arena-gate')).toEqual({
      draft: createEncounterDraft('arena-gate'),
      resumed: false,
    });
  });
});
