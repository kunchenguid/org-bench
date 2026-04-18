import { describe, expect, it, vi } from 'vitest';

import { getStorageKey, getStorageNamespace } from '../src/lib/storage';

describe('storage namespace', () => {
  it('prefers the injected run-scoped namespace', () => {
    vi.stubGlobal('__DUEL_TCG_STORAGE_NAMESPACE__', 'run-123');

    expect(getStorageNamespace()).toBe('run-123');
    expect(getStorageKey('save')).toBe('run-123:save');
  });

  it('falls back to a local namespace for development', () => {
    vi.unstubAllGlobals();

    expect(getStorageNamespace()).toBe('duel-tcg');
    expect(getStorageKey('save')).toBe('duel-tcg:save');
  });
});
