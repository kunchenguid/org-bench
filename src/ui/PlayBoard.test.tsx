import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'preact-render-to-string';
import { PlayBoard } from './App';

describe('PlayBoard', () => {
  it('renders the duel board shell with core zones and action surfaces', () => {
    const markup = renderToString(h(PlayBoard, {}));

    expect(markup).toContain('Live duel board');
    expect(markup).toContain('Your turn');
    expect(markup).toContain('Enemy battlefield');
    expect(markup).toContain('Enemy hand');
    expect(markup).toContain('Enemy deck');
    expect(markup).toContain('Enemy discard');
    expect(markup).toContain('Enemy resources');
    expect(markup).toContain('Your battlefield');
    expect(markup).toContain('Your hand');
    expect(markup).toContain('Your deck');
    expect(markup).toContain('Your discard pile');
    expect(markup).toContain('Your resources');
    expect(markup).toContain('Play selected card');
    expect(markup).toContain('End turn');
    expect(markup).toContain('Selection tray');
    expect(markup).toContain('Cinder Archivist');
    expect(markup).toContain('Target: Enemy battlefield');
  });
});
