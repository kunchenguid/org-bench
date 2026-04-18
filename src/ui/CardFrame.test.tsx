import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'preact-render-to-string';
import { CardFrame } from './CardFrame';
import { showcaseCards } from './cardCatalog';

describe('CardFrame', () => {
  it('exports a reusable showcase catalog with both factions represented', () => {
    expect(showcaseCards).toHaveLength(2);
    expect(showcaseCards.map((card) => card.faction)).toEqual(['ember', 'verdant']);
  });

  it('renders the shared card chrome for ember faction cards', () => {
    const markup = renderToString(
      h(CardFrame, {
        faction: 'ember',
        title: 'Cinder Archivist',
        cost: 3,
        kind: 'Spellwright',
        attack: 4,
        health: 2,
        rules: 'When played, deal 1 ember damage to each opposing unit.',
      }),
    );

    expect(markup).toContain('Cinder Archivist');
    expect(markup).toContain('Spellwright');
    expect(markup).toContain('4');
    expect(markup).toContain('2');
    expect(markup).toContain('card-frame-ember');
    expect(markup).toContain('card-cost');
    expect(markup).toContain('card-rules');
    expect(markup).toContain('data-motif="ember"');
  });

  it('renders the verdant faction motif for growth cards', () => {
    const markup = renderToString(
      h(CardFrame, {
        faction: 'verdant',
        title: 'Rootwhisper Keeper',
        cost: 2,
        kind: 'Warden',
        attack: 1,
        health: 5,
        rules: 'At end of turn, restore 1 health to your champion.',
      }),
    );

    expect(markup).toContain('card-frame-verdant');
    expect(markup).toContain('data-motif="verdant"');
    expect(markup).toContain('Rootwhisper Keeper');
  });

  it('supports a compact presentation variant for dense surfaces', () => {
    const markup = renderToString(
      h(CardFrame, {
        faction: 'ember',
        title: 'Cinder Archivist',
        cost: 3,
        kind: 'Spellwright',
        attack: 4,
        health: 2,
        rules: 'When played, deal 1 ember damage to each opposing unit.',
        size: 'compact',
      }),
    );

    expect(markup).toContain('card-frame-compact');
  });
});
