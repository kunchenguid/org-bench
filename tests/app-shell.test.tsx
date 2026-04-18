import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

import { App } from '../src/app';
import { saveGameState } from '../src/game/persistence';
import { createInitialGameState, startTurn } from '../src/game/state';

describe('App shell', () => {
  it('renders navigation links for all top-level pages', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Duel TCG' })).toBeInTheDocument();
  });

  it('switches pages through hash navigation', () => {
    window.location.hash = '#/';
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: 'Play' }));

    expect(screen.getByRole('heading', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Current match' })).toBeInTheDocument();
    expect(screen.getByText('Turn 1 - player to act')).toBeInTheDocument();
  });

  it('hydrates the play view from saved game state', () => {
    window.location.hash = '#/play';
    const savedState = startTurn(createInitialGameState());
    saveGameState(savedState);

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('Turn 1 - player to act')).toBeInTheDocument();
    expect(screen.getByText('You: 20 HP')).toBeInTheDocument();
    expect(screen.getByText('Opponent: 20 HP')).toBeInTheDocument();
    expect(screen.getByText('Hand: 4 cards')).toBeInTheDocument();
    expect(
      screen.getByText('This match auto-saves in your browser using localStorage.')
    ).toBeInTheDocument();
  });

  it('exposes a discoverable legal and contact route from the shipped UI', () => {
    window.location.hash = '#/';
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: 'Legal and Contact' }));

    expect(screen.getByRole('heading', { name: 'Legal and Contact' })).toBeInTheDocument();
    expect(screen.getByText(/All rights reserved\./)).toBeInTheDocument();
    expect(
      screen.getByText('Match progress is stored locally in your browser using localStorage.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact Vera' })).toHaveAttribute(
      'href',
      'mailto:vera@oracle-seed-01.local'
    );
  });
});
