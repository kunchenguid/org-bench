import { describe, expect, it } from 'vitest';

import { navLinks, pageCopy, rulesSections } from './App';

describe('rules page copy', () => {
  it('covers the full first-time-player rules topics', () => {
    expect(pageCopy.rules.body).toMatch(/setup/i);
    expect(pageCopy.rules.body).toMatch(/turn flow/i);
    expect(pageCopy.rules.body).toMatch(/combat/i);
    expect(pageCopy.rules.body).toMatch(/encounter ladder/i);

    expect(rulesSections.map((section) => section.title)).toEqual([
      '1. Setup',
      '2. Turn Structure',
      '3. Resources',
      '4. Creatures And Spells',
      '5. Combat',
      '6. Keywords',
      '7. Victory And Defeat',
      '8. Encounter Ladder',
    ]);

    const keywordCopy = rulesSections.find((section) => section.title === '6. Keywords')?.body.join(' ');
    expect(keywordCopy).toMatch(/Guard/);
    expect(keywordCopy).toMatch(/Charge/);
    expect(keywordCopy).toMatch(/Swift/);
    expect(keywordCopy).toMatch(/Burn/);
    expect(keywordCopy).toMatch(/Flow/);
    expect(keywordCopy).toMatch(/Shield/);

    const setupCopy = rulesSections.find((section) => section.title === '1. Setup')?.body.join(' ');
    expect(setupCopy).toMatch(/Ember Vanguard/);
    expect(setupCopy).toMatch(/Tide Anchor/);
  });
});

describe('primary navigation copy', () => {
  it('gives each route a distinct action-oriented summary', () => {
    expect(navLinks).toEqual([
      {
        href: './#/',
        label: 'Home',
        route: 'home',
        description: 'Overview, release status, and next milestones.',
      },
      {
        href: './#/play',
        label: 'Play',
        route: 'play',
        description: 'Board layout, encounter flow, and turn controls.',
      },
      {
        href: './#/rules',
        label: 'Rules',
        route: 'rules',
        description: 'First-time setup, turn order, keywords, and victory.',
      },
      {
        href: './#/cards',
        label: 'Cards',
        route: 'cards',
        description: 'Starter decks, factions, and searchable card roles.',
      },
    ]);
  });
});
