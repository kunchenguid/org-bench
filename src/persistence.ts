export type EncounterSnapshot = {
  runId: string;
  encounterId: string;
  encounterName: string;
  playerFaction: string;
  rivalFaction: string;
  step: string;
  updatedAt: string;
};

const STORAGE_PREFIX = 'duel-of-ash-and-aether';

export function createEncounterStorageKey(runId: string) {
  return `${STORAGE_PREFIX}:${runId}:encounter`;
}

export function loadEncounterSnapshot(storage: Storage, runId: string): EncounterSnapshot | null {
  const value = storage.getItem(createEncounterStorageKey(runId));

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as EncounterSnapshot;
  } catch {
    return null;
  }
}

export function saveEncounterSnapshot(
  storage: Storage,
  runId: string,
  snapshot: EncounterSnapshot
) {
  storage.setItem(createEncounterStorageKey(runId), JSON.stringify(snapshot));
}

export function clearEncounterSnapshot(storage: Storage, runId: string) {
  storage.removeItem(createEncounterStorageKey(runId));
}
