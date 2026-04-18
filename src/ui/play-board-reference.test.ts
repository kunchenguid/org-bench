import { describe, expect, it } from 'vitest';

import { buildPlayBoardReference } from './play-board-reference';

describe('buildPlayBoardReference', () => {
  it('derives the board headline and matchup labels from the designed decks and ladder', () => {
    const reference = buildPlayBoardReference();

    expect(reference.playerDeckName).toBe('Covenant Blitz');
    expect(reference.enemyDeckName).toBe('Loom Bastion');
    expect(reference.encounterTitle).toBe('Border Skirmish');
    expect(reference.encounterVariantName).toBe('Thicket Watch');
  });

  it('summarizes the current matchup using actual deck counts', () => {
    const reference = buildPlayBoardReference();

    expect(reference.playerDeckCount).toBe('20-card deck');
    expect(reference.enemyDeckCount).toBe('20-card deck');
    expect(reference.battlefieldLabel).toContain('Covenant Blitz');
    expect(reference.battlefieldLabel).toContain('Loom Bastion');
  });
});
