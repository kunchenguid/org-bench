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

  it('shows first-time player rules guidance on the rules route', () => {
    window.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByRole('heading', { name: /^rules$/i })).toBeInTheDocument();
    expect(screen.getByText(/each duel is a race to reduce the opposing champion from 20 health to 0/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /turn flow/i })).toBeInTheDocument();
    expect(screen.getByText(/ready your exhausted cards, draw 1 card, then gain 1 ember/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /resources and board/i })).toBeInTheDocument();
    expect(screen.getByText(/banked ember carries over between turns, but unspent aether fades at the end of combat/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /card types/i })).toBeInTheDocument();
    expect(screen.getByText(/champions lead your deck, units stay in play to attack or guard, and tactics resolve once before going to the discard/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /victory and campaign flow/i })).toBeInTheDocument();
    expect(screen.getByText(/win three encounters in a row to clear the gauntlet/i)).toBeInTheDocument();
  });
});
