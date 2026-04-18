import { h } from 'preact';
import renderToString from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders visible board zones and combat-helper state on the play route', () => {
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
    expect(html).toContain('Turn 1 - Your move');
    expect(html).toContain('Player HP 30');
    expect(html).toContain('Enemy HP 24');
    expect(html).toContain('Shield Charge 1');
    expect(html).toContain('A rogue AI challenger enters the signal arena.');
    expect(html).toContain('Next punish: Signal Snare if you overcommit right now.');
    expect(html).toContain('Division B tactical board');
    expect(html).toContain('Pilot brief');

    Object.assign(globalThis, { window: previousWindow });
  });

  it('renders the divB shell and encounter cues on the home route', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Signal Clash');
    expect(html).toContain('Division A playtest');
    expect(html).toContain('Division B tactical board');
    expect(html).toContain('Pilot brief');
    expect(html).toContain('Combat readout');
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

  it('renders a visual starter roster on the cards route', () => {
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
    expect(html).toContain('Deck roles');
    expect(html).toContain('Unit - Opener');
    expect(html).toContain('Signal - Finisher');
    expect(html).toContain('Card gallery');
    expect(html).toContain('Gallery legend');
    expect(html).toContain('Ember - pressure lanes');
    expect(html).toContain('Mist - setup and signals');
    expect(html).toContain('Aerie - finishers and reach');

    Object.assign(globalThis, { window: previousWindow });
  });
});
