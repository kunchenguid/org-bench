import type { EncounterState } from './engine';

export function serializeEncounter(state: EncounterState): string {
  return JSON.stringify(state);
}

export function deserializeEncounter(serialized: string): EncounterState {
  return JSON.parse(serialized) as EncounterState;
}
