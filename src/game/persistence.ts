import { getStorageKey } from '../lib/storage';

import type { GameState } from './state';

const GAME_STATE_STORAGE_KEY = 'game-state';

export function saveGameState(state: GameState): void {
  localStorage.setItem(getStorageKey(GAME_STATE_STORAGE_KEY), JSON.stringify(state));
}

export function loadSavedGameState(): GameState | null {
  const serializedState = localStorage.getItem(getStorageKey(GAME_STATE_STORAGE_KEY));

  if (!serializedState) {
    return null;
  }

  try {
    return JSON.parse(serializedState) as GameState;
  } catch {
    return null;
  }
}

export function clearSavedGameState(): void {
  localStorage.removeItem(getStorageKey(GAME_STATE_STORAGE_KEY));
}
