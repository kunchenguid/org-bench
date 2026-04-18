import { render } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';

import { App } from './app';

describe('hash routing', () => {
  afterEach(() => {
    window.location.hash = '#/';
  });

  test('rewrites invalid hashes back to home', () => {
    window.location.hash = '#/unknown-arena';

    render(<App />);

    expect(window.location.hash).toBe('#/');
  });

  test('rewrites shorthand page hashes to canonical routes', () => {
    window.location.hash = '#rules';

    render(<App />);

    expect(window.location.hash).toBe('#/rules');
  });
});
