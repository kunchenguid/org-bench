import { h } from 'preact';
import renderToString from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the division A playable combat board with encounter flow cues', () => {
    const html = renderToString(h(App, {}));

    expect(html).toContain('Signal Clash');
    expect(html).toContain('Division A playtest');
    expect(html).toContain('Rogue AI challenger');
    expect(html).toContain('Player rig');
    expect(html).toContain('Rogue AI core');
    expect(html).toContain('Turn state');
    expect(html).toContain('Player action');
    expect(html).toContain('Strike for 6');
    expect(html).toContain('Bank shield');
    expect(html).toContain('Encounter ladder');
    expect(html).toContain('AI rival reads');
    expect(html).toContain('Encounter flow');
    expect(html).toContain('Scout the opener');
    expect(html).toContain('Win the tempo pivot');
    expect(html).toContain('Secure the finisher');
  });
});
