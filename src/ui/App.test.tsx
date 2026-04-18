import { h } from 'preact';
import renderToString from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the selected tactical board with readable card presentation', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Division B tactical board');
    expect(html).toContain('Pilot brief');
    expect(html).toContain('Frontline cards');
    expect(html).toContain('Combat readout');
    expect(html).toContain('Preconstructed deck');
  });

  it('adds live combat state underneath the chosen board', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Turn state');
    expect(html).toContain('Player action');
    expect(html).toContain('Player rig');
    expect(html).toContain('Rogue AI core');
    expect(html).toContain('Strike for 6');
    expect(html).toContain('Bank shield');
    expect(html).toContain('Combat log');
  });

  it('renders concrete AI rival reads for the opening encounter', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Rogue AI');
    expect(html).toContain('Opening gambit');
    expect(html).toContain('Counter window');
    expect(html).toContain('Weak side');
  });
});
