import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { advanceTurn, createDuelState } from './game/state';

describe('Play persistence entry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = '#/home';
  });

  it('shows resume and new run actions when a saved encounter exists', () => {
    const duelState = advanceTurn(
      createDuelState({
        playerDeck: ['p1', 'p2', 'p3', 'p4'],
        opponentDeck: ['o1', 'o2', 'o3', 'o4'],
        openingHandSize: 2
      })
    );

    window.localStorage.setItem(
      'duel-of-ash-and-aether:facebook-seed-01:encounter',
      JSON.stringify({
        runId: 'facebook-seed-01',
        encounterId: 'ember-watch',
        encounterName: 'Ember Watch',
        playerFaction: 'Ember Guild',
        rivalFaction: 'Aether Covenant',
        step: 'mid-duel',
        duelState,
        updatedAt: '2026-04-18T12:00:00.000Z'
      })
    );
    window.location.hash = '#/play';

    render(<App />);

    expect(screen.getByText(/saved encounter: ember watch/i)).toBeInTheDocument();
    expect(screen.getByText(/turn 1 - opponent turn/i)).toBeInTheDocument();
    expect(screen.getByText(/player health 20 - opponent health 20/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume encounter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start new run/i })).toBeInTheDocument();
  });

  it('clears the saved encounter when starting a new run', () => {
    const duelState = advanceTurn(
      createDuelState({
        playerDeck: ['p1', 'p2', 'p3', 'p4'],
        opponentDeck: ['o1', 'o2', 'o3', 'o4'],
        openingHandSize: 2
      })
    );

    window.localStorage.setItem(
      'duel-of-ash-and-aether:facebook-seed-01:encounter',
      JSON.stringify({
        runId: 'facebook-seed-01',
        encounterId: 'ember-watch',
        encounterName: 'Ember Watch',
        playerFaction: 'Ember Guild',
        rivalFaction: 'Aether Covenant',
        step: 'mid-duel',
        duelState,
        updatedAt: '2026-04-18T12:00:00.000Z'
      })
    );
    window.location.hash = '#/play';

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start new run/i }));

    expect(window.localStorage.getItem('duel-of-ash-and-aether:facebook-seed-01:encounter')).toBeNull();
    expect(screen.getByText(/no active encounter saved for this run/i)).toBeInTheDocument();
  });
});
