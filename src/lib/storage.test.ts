import { describe, expect, it } from 'vitest';
import { buildStorageKey, loadJson, saveJson } from './storage';

describe('storage helpers', () => {
  it('prefixes persisted keys with the run namespace', () => {
    expect(buildStorageKey('run-42', 'game-state')).toBe('run-42:game-state');
  });

  it('round-trips JSON through localStorage', () => {
    saveJson('run-42', 'game-state', { turn: 3, playerHp: 18 });

    expect(loadJson('run-42', 'game-state')).toEqual({ turn: 3, playerHp: 18 });
  });

  it('returns null for missing or invalid data', () => {
    localStorage.setItem('run-42:broken', '{bad json');

    expect(loadJson('run-42', 'missing')).toBeNull();
    expect(loadJson('run-42', 'broken')).toBeNull();
  });
});
