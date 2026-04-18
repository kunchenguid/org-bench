import { h } from 'preact';
import renderToString from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders visible board zones and encounter feedback on the play route', () => {
    const previousWindow = globalThis.window;
    Object.assign(globalThis, {
      window: {
        location: { hash: '#/play' },
        addEventListener() {},
        removeEventListener() {},
      },
    });

    const html = renderToString(h(App, {}));

    expect(html).toContain('Player board');
    expect(html).toContain('Enemy board');
    expect(html).toContain('Static Broker');
    expect(html).toContain('Rogue AI pressure: left lane overloaded');
    expect(html).toContain('Turn 1 - Your move');

    Object.assign(globalThis, { window: previousWindow });
  });

  it('renders the divB play page with battlefield readability and card presentation', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Signal Clash');
    expect(html).toContain('Division A playtest');
    expect(html).toContain('Division B tactical board');
    expect(html).toContain('Pilot brief');
    expect(html).toContain('Frontline cards');
    expect(html).toContain('Combat readout');
    expect(html).toContain('Preconstructed deck');
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

  it('renders the divB card archive when the cards route is active', () => {
    const previousWindow = globalThis.window;
    Object.assign(globalThis, {
      window: {
        location: { hash: '#/cards' },
        addEventListener() {},
        removeEventListener() {},
      },
    });

    const html = renderToString(h(App, {}));

    expect(html).toContain('Starter card archive');
    expect(html).toContain('Static Broker');
    expect(html).toContain('Glasswall Sentry');
    expect(html).toContain('Signal - Finisher');

    Object.assign(globalThis, { window: previousWindow });
  });
});
