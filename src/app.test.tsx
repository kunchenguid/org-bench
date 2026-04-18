import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('renders the primary routes in the shell', () => {
    const html = render(<App />);

    expect(html).toContain('Duel TCG');
    expect(html).toContain('Home');
    expect(html).toContain('Play');
    expect(html).toContain('Rules');
    expect(html).toContain('Cards');
  });
});
