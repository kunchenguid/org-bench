import { describe, expect, it } from 'vitest';

import { getRouteByHash, routes } from './routes';

describe('routes', () => {
  it('defines the four required top-level pages', () => {
    expect(routes.map((route) => route.id)).toEqual(['home', 'play', 'rules', 'cards']);
  });

  it('falls back to the home page for unknown hashes', () => {
    expect(getRouteByHash('#/unknown').id).toBe('home');
  });
});
