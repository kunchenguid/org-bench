import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import renderToString from 'preact-render-to-string';
import { HomePage } from './App';

describe('HomePage', () => {
  it('renders a publishable landing page with hero, CTAs, factions, and encounter teaser', () => {
    const html = renderToString(h(HomePage, {}));

    expect(html).toContain('Auric Reach');
    expect(html).toContain('Step into the gilded frontier.');
    expect(html).toContain('Play Now');
    expect(html).toContain('Read Rules');
    expect(html).toContain('View Gallery');
    expect(html).toContain('Factions of the Reach');
    expect(html).toContain('Encounters on the Horizon');
  });
});
