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

  it('renders three ladder encounters with deterministic ai plans on the play route', () => {
    window.location.hash = '#/play';

    render(<App />);

    expect(screen.getByRole('heading', { name: /cinder bridge ambush/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /skyrail siege/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /the glass throne/i })).toBeInTheDocument();
    expect(screen.getByText(/play the cheapest pressure unit first/i)).toBeInTheDocument();
    expect(screen.getByText(/if lethal burn is available, cast it before developing/i)).toBeInTheDocument();
  });
});
