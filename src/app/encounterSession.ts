export const HARNESS_STORAGE_PREFIX = 'org-bench:facebook-seed-01';
export const ACTIVE_ENCOUNTER_KEY = `${HARNESS_STORAGE_PREFIX}:play:active-encounter`;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type EncounterDraft = {
  encounterId: string;
  notes: string;
};

export type EncounterSession = {
  draft: EncounterDraft;
  resumed: boolean;
};

export function getEncounterDraftKey(encounterId: string): string {
  return `${HARNESS_STORAGE_PREFIX}:play:encounter:${encounterId}`;
}

export function createEncounterDraft(encounterId: string): EncounterDraft {
  return {
    encounterId,
    notes: '',
  };
}

export function saveEncounterDraft(storage: StorageLike, draft: EncounterDraft): void {
  storage.setItem(getEncounterDraftKey(draft.encounterId), JSON.stringify(draft));
  storage.setItem(ACTIVE_ENCOUNTER_KEY, draft.encounterId);
}

export function loadEncounterDraft(storage: Pick<StorageLike, 'getItem'>, encounterId: string): EncounterDraft | null {
  const rawValue = storage.getItem(getEncounterDraftKey(encounterId));

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<EncounterDraft>;

    if (parsed.encounterId === encounterId && typeof parsed.notes === 'string') {
      return {
        encounterId: parsed.encounterId,
        notes: parsed.notes,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function restoreEncounterDraft(storage: Pick<StorageLike, 'getItem'>, encounterId: string): EncounterSession {
  const draft = loadEncounterDraft(storage, encounterId);

  return {
    draft: draft ?? createEncounterDraft(encounterId),
    resumed: draft !== null,
  };
}

export function restorePlaySession(storage: Pick<StorageLike, 'getItem'>, fallbackEncounterId: string): EncounterSession {
  const encounterId = storage.getItem(ACTIVE_ENCOUNTER_KEY) ?? fallbackEncounterId;
  return restoreEncounterDraft(storage, encounterId);
}
