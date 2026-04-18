import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'preact-render-to-string';

import { CardGalleryPanel } from './App';

describe('CardGalleryPanel', () => {
  it('renders the shared showcase cards on the gallery route', () => {
    const markup = renderToString(h(CardGalleryPanel, {}));

    expect(markup).toContain('Vault Archive');
    expect(markup).toContain('Cinder Archivist');
    expect(markup).toContain('Rootwhisper Keeper');
    expect(markup).toContain('Ashfall Covenant');
    expect(markup).toContain('Verdant Loom');
    expect(markup).toContain('Fast pressure and direct damage');
    expect(markup).toContain('Resilience and attrition');
  });
});
