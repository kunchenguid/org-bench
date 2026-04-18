import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'preact-render-to-string';

import { RulesPanel } from './App';

describe('RulesPanel', () => {
  it('renders the player-facing rules sections needed to learn a duel', () => {
    const markup = renderToString(h(RulesPanel, {}));

    expect(markup).toContain('How to play the Auric Reach campaign.');
    expect(markup).toContain('Turn flow');
    expect(markup).toContain('Resources');
    expect(markup).toContain('Creature cards and spell cards');
    expect(markup).toContain('Combat');
    expect(markup).toContain('Victory and defeat');
    expect(markup).toContain('Encounter progression');
    expect(markup).toContain('Save and resume');
  });
});
