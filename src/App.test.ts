import { describe, expect, it } from 'vitest';

import { pageCopy, rulesSections } from './App';

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
  });
});
