import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { App } from './app';

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.location.hash = '#/';
    window.localStorage.clear();
  });

  test('shows the primary navigation and page title', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /duel of embers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /rules/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cards/i })).toBeInTheDocument();
  });

  test('offers a direct call to start the first duel from the hero', () => {
    render(<App />);

    const [heroCallToAction] = screen.getAllByRole('link', { name: /start first duel/i });

    expect(heroCallToAction).toHaveAttribute('href', '#/play');
  });

  test('shows publishable home-page teaching and faction surfaces', () => {
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByText(/three rival factions/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /learn one duel, read every board/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /aggressive fire duels/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /calculated attrition/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /tempo and positioning/i })).toBeInTheDocument();
  });

  test('renders the cards page as a real card gallery', () => {
    window.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByRole('heading', { name: /card archive/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /starter archive/i })).toBeInTheDocument();
    expect(screen.getByText(/same frames as play/i)).toBeInTheDocument();
    expect(screen.getByText(/ashen duelist/i)).toBeInTheDocument();
    expect(screen.getByText(/cinder volley/i)).toBeInTheDocument();
  });

  test('restores and clears saved progress from a namespaced key', () => {
    window.localStorage.setItem(
      'run-amazon-seed-01:duel-of-embers:app',
      JSON.stringify({ currentPage: 'play' }),
    );

    render(<App storageNamespace="run-amazon-seed-01" />);

    expect(screen.getByRole('heading', { name: /play the first duel/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear saved progress/i }));

    expect(window.localStorage.getItem('run-amazon-seed-01:duel-of-embers:app')).toBeNull();
    expect(screen.getByText(/no local save yet/i)).toBeInTheDocument();
  });
});
