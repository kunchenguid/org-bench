import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App';

afterEach(() => {
  cleanup();
  window.location.hash = '';
  document.title = '';
  window.localStorage.clear();
});

describe('App shell', () => {
  it('normalizes an unsupported hash back to the home route', () => {
    window.location.hash = '#/missing';

    render(<App />);

    expect(window.location.hash).toBe('#/home');
    expect(screen.getByRole('heading', { name: /duel of ash and aether/i })).toBeInTheDocument();
  });

  it('renders primary navigation and scaffold pages', () => {
    window.location.hash = '#/home';

    render(<App />);

    const nav = screen.getByRole('navigation', { name: /primary/i });

    expect(within(nav).getByRole('link', { name: /^home$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^play$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^rules$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^cards$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /duel of ash and aether/i })).toBeInTheDocument();
  });

  it('updates the document title for the active page', () => {
    window.location.hash = '#/cards';

    render(<App />);

    expect(document.title).toBe('Card Gallery | Duel of Ash and Aether');
  });

  it('renders the play board shell with core duel zones', () => {
    window.location.hash = '#/play';

    render(<App />);

    expect(screen.getByRole('heading', { name: /live duel board/i })).toBeInTheDocument();
    expect(screen.getByText(/turn 1 - cinder bridge ambush/i)).toBeInTheDocument();
    expect(screen.getByText(/player health/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy health/i)).toBeInTheDocument();
    expect(screen.getByText(/hand dock/i)).toBeInTheDocument();
    expect(screen.getByText(/front lane/i)).toBeInTheDocument();
    expect(screen.getByText(/back lane/i)).toBeInTheDocument();
    expect(screen.getByText(/^deck$/i)).toBeInTheDocument();
    expect(screen.getByText(/^discard$/i)).toBeInTheDocument();
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
