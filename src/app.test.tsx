import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App';

afterEach(() => {
  cleanup();
  window.location.hash = '';
  document.title = '';
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

    const board = screen.getByRole('region', { name: /live duel board/i });

    expect(within(board).getByRole('heading', { name: /live duel board/i })).toBeInTheDocument();
    expect(within(board).getByText(/turn 2 - player active/i)).toBeInTheDocument();
    expect(within(board).getByText(/player health/i)).toBeInTheDocument();
    expect(within(board).getByText(/enemy health/i)).toBeInTheDocument();
    expect(within(board).getByText(/hand dock/i)).toBeInTheDocument();
    expect(within(board).getByText(/front lane/i)).toBeInTheDocument();
    expect(within(board).getByText(/back lane/i)).toBeInTheDocument();
    expect(within(board).getByText(/^deck$/i)).toBeInTheDocument();
    expect(within(board).getByText(/^discard$/i)).toBeInTheDocument();
    expect(within(board).getByText(/^ashguard bruiser$/i)).toBeInTheDocument();
    expect(within(board).getByText(/^skyhook snare$/i)).toBeInTheDocument();
    expect(within(board).getByText(/resource 1/i)).toBeInTheDocument();
  });

  it('renders a deterministic action timeline tied to duel state transitions', () => {
    window.location.hash = '#/play';

    render(<App />);

    const timeline = screen.getByRole('region', { name: /action timeline/i });

    expect(within(timeline).getByRole('heading', { name: /action timeline/i })).toBeInTheDocument();
    expect(within(timeline).getByText(/^turn sweep$/i)).toBeInTheDocument();
    expect(within(timeline).getByText(/turn 2 - player initiative/i)).toBeInTheDocument();
    expect(within(timeline).getByText(/^card play lift$/i)).toBeInTheDocument();
    expect(within(timeline).getByText(/player deploys ashguard bruiser to the battlefield/i)).toBeInTheDocument();
    expect(within(timeline).getByText(/^damage flash$/i)).toBeInTheDocument();
    expect(within(timeline).getByText(/opponent takes 4 damage and drops to 16 health/i)).toBeInTheDocument();
  });
});
