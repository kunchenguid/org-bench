import { describe, expect, it } from 'vitest';

import { getRouteFromHash } from './router';

describe('getRouteFromHash', () => {
  it('maps known hashes to routes and falls back home', () => {
    expect(getRouteFromHash('#/play')).toBe('play');
    expect(getRouteFromHash('#/rules')).toBe('rules');
    expect(getRouteFromHash('#/cards')).toBe('cards');
    expect(getRouteFromHash('')).toBe('home');
    expect(getRouteFromHash('#/missing')).toBe('home');
  });
});
