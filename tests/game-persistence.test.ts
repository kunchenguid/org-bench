import { afterEach, describe, expect, test } from 'vitest';

import { getStorageKey } from '../src/lib/storage';
import { clearSavedGameState, loadSavedGameState, saveGameState } from '../src/game/persistence';
import { createInitialGameState, startTurn } from '../src/game/state';

describe('game state persistence', () => {
  afterEach(() => {
    localStorage.clear();
    delete globalThis.__DUEL_TCG_STORAGE_NAMESPACE__;
  });

  test('saves and restores game state under the run-scoped storage key', () => {
    globalThis.__DUEL_TCG_STORAGE_NAMESPACE__ = 'oracle-seed-01:e1';
    const state = startTurn(createInitialGameState());

    saveGameState(state);

    expect(localStorage.getItem(getStorageKey('game-state'))).toBeTruthy();
    expect(loadSavedGameState()).toEqual(state);
  });

  test('returns null for missing or invalid saved state and can clear persisted state', () => {
    expect(loadSavedGameState()).toBeNull();

    localStorage.setItem(getStorageKey('game-state'), '{not-valid-json');
    expect(loadSavedGameState()).toBeNull();

    saveGameState(createInitialGameState());
    clearSavedGameState();
    expect(localStorage.getItem(getStorageKey('game-state'))).toBeNull();
  });
});
