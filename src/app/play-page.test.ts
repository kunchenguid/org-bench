import { describe, expect, it } from 'vitest';

import { createPlayPageLayout } from './play-page';

describe('play page layout', () => {
  it('creates a deterministic lane summary for the play route', () => {
    const layout = createPlayPageLayout();

    expect(layout.zones.find((zone) => zone.id === 'shared-battlefield')?.value).toBe('Battlefield');
    expect(layout.encounterSummary).toContain('Ashen Vanguard');
    expect(layout.turnControls.map((control) => control.label)).toEqual(['Draw and charge', 'Attack and pass']);
  });
});
