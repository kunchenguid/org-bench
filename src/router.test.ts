import { describe, expect, it } from 'vitest';

import { getRouteFromHash, getRouteHref } from './router';

describe('getRouteFromHash', () => {
  it('maps known hashes to routes and falls back home', () => {
    expect(getRouteFromHash('#/play')).toBe('play');
    expect(getRouteFromHash('#/rules')).toBe('rules');
    expect(getRouteFromHash('#/cards')).toBe('cards');
    expect(getRouteFromHash('')).toBe('home');
    expect(getRouteFromHash('#/missing')).toBe('home');
  });

  it('normalizes trailing slashes and ignores query strings', () => {
    expect(getRouteFromHash('#/play/')).toBe('play');
    expect(getRouteFromHash('#/rules?ref=nav')).toBe('rules');
    expect(getRouteFromHash('#/cards/?view=grid')).toBe('cards');
  });
});

describe('getRouteHref', () => {
  it('builds nested-path-safe relative hash links for known routes', () => {
    expect(getRouteHref('home')).toBe('./#/');
    expect(getRouteHref('play')).toBe('./#/play');
    expect(getRouteHref('rules')).toBe('./#/rules');
    expect(getRouteHref('cards')).toBe('./#/cards');
  });
});
