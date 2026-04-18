import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App';

afterEach(() => {
  cleanup();
  window.location.hash = '';
  document.title = '';
});

describe('App shell routing', () => {
  it('normalizes an unsupported hash back to the home route', () => {
    window.location.hash = '#/missing';

    render(<App />);

    expect(window.location.hash).toBe('#/home');
    expect(screen.getByRole('heading', { name: /duel of ash and aether/i })).toBeInTheDocument();
  });

  it('renders primary navigation links', () => {
    window.location.hash = '#/home';

    render(<App />);

    const nav = screen.getByRole('navigation', { name: /primary/i });

    expect(within(nav).getByRole('link', { name: /^home$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^play$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^rules$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^cards$/i })).toBeInTheDocument();
  });

  it('updates the document title for the active page', () => {
    window.location.hash = '#/cards';

    render(<App />);

    expect(document.title).toBe('Card Gallery | Duel of Ash and Aether');
  });

  it('renders a polished home page with faction and encounter previews', () => {
    window.location.hash = '#/home';

    render(<App />);

    expect(screen.getByText(/choose a side in a shattered sky war/i)).toBeInTheDocument();
    expect(screen.getByText(/3-step gauntlet/i)).toBeInTheDocument();
    expect(screen.getByText(/12 signature cards/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /enter the gauntlet/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /study both factions/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /faction previews/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /emberfire vanguard/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /aether covenant/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /encounter path/i })).toBeInTheDocument();
    expect(screen.getByText(/gate of cinders/i)).toBeInTheDocument();
    expect(screen.getByText(/glassgarden crossing/i)).toBeInTheDocument();
    expect(screen.getByText(/the zenith prism/i)).toBeInTheDocument();
  });
});
