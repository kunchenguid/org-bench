import type { DuelOutcome, DuelState, PlayerId, PlayerState, ResourceState } from './game/state';

export type EncounterSnapshot = {
  runId: string;
  encounterId: string;
  encounterName: string;
  playerFaction: string;
  rivalFaction: string;
  step: string;
  duelState: DuelState;
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
    const snapshot = JSON.parse(value) as EncounterSnapshot;

    return isEncounterSnapshot(snapshot) ? snapshot : null;
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

function isEncounterSnapshot(value: unknown): value is EncounterSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<EncounterSnapshot>;

  return (
    typeof snapshot.runId === 'string' &&
    typeof snapshot.encounterId === 'string' &&
    typeof snapshot.encounterName === 'string' &&
    typeof snapshot.playerFaction === 'string' &&
    typeof snapshot.rivalFaction === 'string' &&
    typeof snapshot.step === 'string' &&
    typeof snapshot.updatedAt === 'string' &&
    isDuelState(snapshot.duelState)
  );
}

function isDuelState(value: unknown): value is DuelState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const duelState = value as Partial<DuelState>;

  return (
    isPlayerId(duelState.activePlayer) &&
    typeof duelState.turn === 'number' &&
    isDuelOutcome(duelState.outcome) &&
    !!duelState.players &&
    isPlayerState(duelState.players.player) &&
    isPlayerState(duelState.players.opponent)
  );
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'player' || value === 'opponent';
}

function isDuelOutcome(value: unknown): value is DuelOutcome {
  return value === 'in_progress' || value === 'player_won' || value === 'opponent_won';
}

function isPlayerState(value: unknown): value is PlayerState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const player = value as Partial<PlayerState>;

  return (
    Array.isArray(player.deck) &&
    Array.isArray(player.hand) &&
    Array.isArray(player.discard) &&
    Array.isArray(player.battlefield) &&
    typeof player.health === 'number' &&
    isResourceState(player.resources)
  );
}

function isResourceState(value: unknown): value is ResourceState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const resources = value as Partial<ResourceState>;

  return typeof resources.current === 'number' && typeof resources.max === 'number';
}
