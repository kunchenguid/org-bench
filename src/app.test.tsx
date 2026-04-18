import { render, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App shell', () => {
  it('renders primary navigation and scaffold pages', () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /primary/i });

    expect(within(nav).getByRole('link', { name: /^home$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^play$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^rules$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^cards$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /duel of ash and aether/i })).toBeInTheDocument();
  });
});
