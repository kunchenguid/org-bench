import { describe, expect, it } from 'vitest';

import { ladderSteps, rulesSections } from './rules-content';

describe('rules content', () => {
  it('covers the key systems a new player needs to learn', () => {
    expect(rulesSections.map((section) => section.title)).toEqual([
      'Turn Flow',
      'Resources',
      'Card Types',
      'Combat',
      'Victory',
      'Keywords',
    ]);

    expect(rulesSections.find((section) => section.title === 'Turn Flow')?.items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/draw/i),
        expect.stringMatching(/resource/i),
        expect.stringMatching(/play/i),
        expect.stringMatching(/combat/i),
      ]),
    );

    expect(rulesSections.find((section) => section.title === 'Combat')?.items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/attack/i),
        expect.stringMatching(/block/i),
        expect.stringMatching(/damage/i),
      ]),
    );

    expect(rulesSections.find((section) => section.title === 'Victory')?.items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/zero health/i),
        expect.stringMatching(/empty deck/i),
      ]),
    );
  });

  it('defines ladder progression guidance from tutorial to champion', () => {
    expect(ladderSteps).toHaveLength(4);
    expect(ladderSteps[0].name).toMatch(/initiate|rookie|tutorial/i);
    expect(ladderSteps[ladderSteps.length - 1]?.name).toMatch(/champion|boss|final/i);
    expect(ladderSteps.every((step) => step.goal.length > 0)).toBe(true);
  });
});
