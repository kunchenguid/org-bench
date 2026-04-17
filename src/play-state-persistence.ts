import type { GameState } from './duel-engine';
import { ENCOUNTERS, advanceEncounter, createEncounterRun, type Encounter, type EncounterOutcome, type EncounterRun } from './encounters';
import { createNamespacedLocalStore, type StorageLike } from './persistence';

type PersistedEncounterRun = {
  currentEncounterId: string;
  completedEncounterIds: string[];
  isComplete: boolean;
};

type PersistedActiveEncounter = {
  encounterId: string;
  game: GameState;
  statusMessage: string;
  log: string[];
};

type SavedActiveEncounter = {
  encounter: Encounter;
  game: GameState;
  statusMessage: string;
  log: string[];
};

const ENCOUNTER_RUN_KEY = 'encounter-run';
const ACTIVE_ENCOUNTER_KEY = 'active-encounter';

function getEncounterById(encounterId: string): Encounter | null {
  return ENCOUNTERS.find((encounter) => encounter.id === encounterId) ?? null;
}

export function saveEncounterRun(namespace: string, storage: StorageLike, run: EncounterRun): void {
  const store = createNamespacedLocalStore(namespace, storage);
  const persistedRun: PersistedEncounterRun = {
    currentEncounterId: run.currentEncounter.id,
    completedEncounterIds: [...run.completedEncounterIds],
    isComplete: run.isComplete,
  };

  store.save(ENCOUNTER_RUN_KEY, persistedRun);
}

export function loadSavedEncounterRun(namespace: string, storage: StorageLike): EncounterRun {
  const store = createNamespacedLocalStore(namespace, storage);
  const fallback = createEncounterRun();
  const persistedRun = store.load<Partial<PersistedEncounterRun> | null>(ENCOUNTER_RUN_KEY, null);

  if (!persistedRun?.currentEncounterId) {
    return fallback;
  }

  const currentEncounter = getEncounterById(persistedRun.currentEncounterId);

  if (!currentEncounter) {
    return fallback;
  }

  const completedEncounterIds = Array.isArray(persistedRun.completedEncounterIds)
    ? persistedRun.completedEncounterIds.filter((encounterId) => getEncounterById(encounterId))
    : [];

  return {
    currentEncounter,
    completedEncounterIds,
    isComplete: persistedRun.isComplete === true,
  };
}

export function advanceSavedEncounterRun(
  namespace: string,
  storage: StorageLike,
  outcome: EncounterOutcome,
): EncounterRun {
  const currentRun = loadSavedEncounterRun(namespace, storage);
  const nextRun = advanceEncounter(currentRun, outcome);

  saveEncounterRun(namespace, storage, nextRun);

  return nextRun;
}

export function completeSavedEncounter(namespace: string, storage: StorageLike, outcome: EncounterOutcome): EncounterRun {
  const nextRun = advanceSavedEncounterRun(namespace, storage, outcome);

  clearSavedActiveEncounter(namespace, storage);

  return nextRun;
}

export function resetSavedEncounterProgress(namespace: string, storage: StorageLike): EncounterRun {
  const freshRun = createEncounterRun();

  saveEncounterRun(namespace, storage, freshRun);
  clearSavedActiveEncounter(namespace, storage);

  return freshRun;
}

export function saveActiveEncounter(namespace: string, storage: StorageLike, encounter: SavedActiveEncounter): void {
  const store = createNamespacedLocalStore(namespace, storage);
  const persistedEncounter: PersistedActiveEncounter = {
    encounterId: encounter.encounter.id,
    game: encounter.game,
    statusMessage: encounter.statusMessage,
    log: [...encounter.log],
  };

  store.save(ACTIVE_ENCOUNTER_KEY, persistedEncounter);
}

export function loadSavedActiveEncounter(namespace: string, storage: StorageLike): SavedActiveEncounter | null {
  const store = createNamespacedLocalStore(namespace, storage);
  const persistedEncounter = store.load<Partial<PersistedActiveEncounter> | null>(ACTIVE_ENCOUNTER_KEY, null);

  if (
    !persistedEncounter?.encounterId ||
    !persistedEncounter.game ||
    typeof persistedEncounter.statusMessage !== 'string' ||
    !Array.isArray(persistedEncounter.log)
  ) {
    return null;
  }

  const encounter = getEncounterById(persistedEncounter.encounterId);

  if (!encounter) {
    return null;
  }

  return {
    encounter,
    game: persistedEncounter.game,
    statusMessage: persistedEncounter.statusMessage,
    log: persistedEncounter.log,
  };
}

export function clearSavedActiveEncounter(namespace: string, storage: StorageLike): void {
  const store = createNamespacedLocalStore(namespace, storage);
  store.remove(ACTIVE_ENCOUNTER_KEY);
}

export { type SavedActiveEncounter };
