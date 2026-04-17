import { describe, expect, it } from 'vitest';

import { cardGroups, keywordGlossary } from './card-reference';

describe('card reference data', () => {
  it('organizes the launch card pool into themed groups with readable entries', () => {
    expect(cardGroups).toHaveLength(2);
    expect(cardGroups.map((group) => group.title)).toEqual(['Ember Vanguard', 'Tide Anchor']);
    expect(cardGroups.every((group) => group.cards.length >= 8)).toBe(true);

    const allCards = cardGroups.flatMap((group) => group.cards);
    expect(allCards).toHaveLength(16);
    expect(allCards[0]).toMatchObject({
      name: expect.any(String),
      type: expect.any(String),
      cost: expect.any(Number),
      text: expect.any(String),
    });
  });

  it('keeps keyword explanations available for rules-consistent reference copy', () => {
    expect(keywordGlossary.map((entry) => entry.keyword)).toEqual([
      'Guard',
      'Charge',
      'Swift',
      'Burn',
      'Flow',
      'Shield',
    ]);
    expect(keywordGlossary.every((entry) => entry.explanation.length > 10)).toBe(true);
  });
});
