import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App';

afterEach(() => {
  cleanup();
  window.location.hash = '';
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

  it('renders faction identities and the initial card pool on the cards route', () => {
    window.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByRole('heading', { name: /card gallery/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /emberfire syndicate/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /aether covenant/i })).toBeInTheDocument();
    expect(screen.getByText(/cinder tactician/i)).toBeInTheDocument();
    expect(screen.getByText(/sky archive lens/i)).toBeInTheDocument();
  });

  it('uses illustrated cards in the play surface opening hand preview', () => {
    window.location.hash = '#/play';

    render(<App />);

    expect(screen.getByRole('heading', { name: /opening hand/i })).toBeInTheDocument();
    expect(screen.getByText(/opening hand previews the same illustrated card frame/i)).toBeInTheDocument();
    expect(screen.getByText(/ashmarked scout/i)).toBeInTheDocument();
    expect(screen.getByText(/ward current/i)).toBeInTheDocument();
  });
});
