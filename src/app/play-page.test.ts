import { describe, expect, it } from 'vitest';

import { createPlayPageLayout } from './play-page';

describe('playPageLayout', () => {
  const playPageLayout = createPlayPageLayout();

  it('defines visible hero health for both sides', () => {
    expect(playPageLayout.heroes.map((hero) => hero.id)).toEqual(['enemy', 'player']);
    expect(playPageLayout.heroes.every((hero) => hero.health >= 0)).toBe(true);
    expect(playPageLayout.heroes.every((hero) => hero.detail.length > 0)).toBe(true);
  });

  it('lists the core duel zones players need to read the table', () => {
    expect(playPageLayout.zones.map((zone) => zone.id)).toEqual([
      'enemy-deck',
      'enemy-hand',
      'enemy-battlefield',
      'shared-battlefield',
      'player-battlefield',
      'player-hand',
      'player-resources',
      'player-discard',
      'player-deck',
    ]);
  });

  it('provides obvious turn controls for the current round', () => {
    expect(playPageLayout.turnControls.map((control) => control.label)).toEqual([
      'Draw and charge',
      'Play legal cards',
      'Attack and pass',
    ]);
  });

  it('exposes a readable encounter summary and turn log', () => {
    expect(playPageLayout.encounterSummary).toContain('deterministic turns');
    expect(playPageLayout.encounterLog.length).toBeGreaterThan(0);
    expect(playPageLayout.encounterLog.every((turn) => turn.actions.length > 0)).toBe(true);
  });

  it('can generate a fresh layout for replayable encounters', () => {
    const replayLayout = createPlayPageLayout();

    expect(replayLayout.zones.map((zone) => zone.id)).toEqual(playPageLayout.zones.map((zone) => zone.id));
    expect(replayLayout.encounterLog.length).toBeGreaterThan(0);
  });
});
