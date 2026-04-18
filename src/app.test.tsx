import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App';

afterEach(() => {
  cleanup();
});

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

  it('renders a polished home page with faction and encounter previews', () => {
    render(<App />);

    expect(screen.getByText(/choose a side in a shattered sky war/i)).toBeInTheDocument();
    expect(screen.getByText(/3-step gauntlet/i)).toBeInTheDocument();
    expect(screen.getByText(/12 signature cards/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /enter the gauntlet/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /study both factions/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /faction previews/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /emberfire vanguard/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /aether covenant/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /encounter path/i })).toBeInTheDocument();
    expect(screen.getByText(/gate of cinders/i)).toBeInTheDocument();
    expect(screen.getByText(/glassgarden crossing/i)).toBeInTheDocument();
    expect(screen.getByText(/the zenith prism/i)).toBeInTheDocument();
  });
});
