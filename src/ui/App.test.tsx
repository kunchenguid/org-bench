import { h } from 'preact';
import renderToString from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the divB play page with battlefield readability and card presentation', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Division B tactical board');
    expect(html).toContain('Pilot brief');
    expect(html).toContain('Frontline cards');
    expect(html).toContain('Combat readout');
    expect(html).toContain('Preconstructed deck');
  });

  it('renders the division A combat-forward play page shell', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Signal Clash');
    expect(html).toContain('Division A playtest');
    expect(html).toContain('Encounter ladder');
    expect(html).toContain('Turn state');
    expect(html).toContain('Player action');
    expect(html).toContain('Player rig');
    expect(html).toContain('Rogue AI core');
    expect(html).toContain('Heavy counter queued');
    expect(html).toContain('AI rival reads');
    expect(html).toContain('Play first card');
    expect(html).toContain('Commit attack lane');
    expect(html).toContain('Bank shield charge');
    expect(html).toContain('Strike for 6');
    expect(html).toContain('Bank shield');
    expect(html).toContain('Save checkpoint');
    expect(html).toContain('Advance encounter');
  });

  it('renders concrete AI rival reads for the opening encounter', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Rogue AI');
    expect(html).toContain('Opening gambit');
    expect(html).toContain('Counter window');
    expect(html).toContain('Weak side');
  });
});
