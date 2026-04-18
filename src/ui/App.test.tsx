import { h } from 'preact';
import renderToString from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the division A combat-forward play page shell', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Signal Clash');
    expect(html).toContain('Division A playtest');
    expect(html).toContain('Encounter ladder');
    expect(html).toContain('AI rival reads');
    expect(html).toContain('Play first card');
    expect(html).toContain('Commit attack lane');
    expect(html).toContain('Bank shield charge');
  });

  it('renders concrete AI rival reads for the opening encounter', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Rogue AI');
    expect(html).toContain('Opening gambit');
    expect(html).toContain('Counter window');
    expect(html).toContain('Weak side');
  });
});
