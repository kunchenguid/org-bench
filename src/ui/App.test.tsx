import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import renderToString from 'preact-render-to-string';
import { HomePage } from './App';

describe('HomePage', () => {
  it('stays within the final two-faction home scope', () => {
    const html = renderToString(h(HomePage, {}));

    expect(html).toContain('Auric Reach');
    expect(html).toContain('Step into the gilded frontier.');
    expect(html).toContain('Play Now');
    expect(html).toContain('Read Rules');
    expect(html).toContain('View Gallery');
    expect(html).toContain('Factions of the Reach');
    expect(html).toContain('Encounters on the Horizon');
    expect(html).toContain('Ashfall Covenant');
    expect(html).toContain('Verdant Loom');
    expect(html).not.toContain('Gloam Cartel');
    expect((html.match(/class="hero-card hero-card-/g) ?? []).length).toBe(2);
    expect((html.match(/class="encounter-card"/g) ?? []).length).toBe(2);
  });
});
