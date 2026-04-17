import { describe, expect, it } from 'vitest';

import { getPlayBoardZones } from './play-page';

describe('getPlayBoardZones', () => {
  it('returns the evaluator-facing board zones needed on the play page', () => {
    expect(getPlayBoardZones()).toEqual([
      'Enemy health',
      'Player health',
      'Resources',
      'Battlefield',
      'Hand',
      'Deck',
      'Discard',
      'Action controls',
      'Turn flow',
    ]);
  });
});
