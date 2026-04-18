import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(() => {
  cleanup();
});

describe('App shell', () => {
  it('shows primary navigation and the selected page content', () => {
    window.history.replaceState({}, '', '/play');

    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', './');
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', './play');
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('href', './rules');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', './cards');
    expect(screen.getByRole('heading', { name: 'Play Duel TCG' })).toBeInTheDocument();
    expect(screen.getByText('Read the battlefield state, choose a line, and understand the full turn at a glance.')).toBeInTheDocument();
  });

  it('gives the home route customer-ready product framing', () => {
    window.history.replaceState({}, '', '/');

    render(<App />);

    expect(screen.getByText('Three lanes. One rival. Ten-minute runs.')).toBeInTheDocument();
    expect(screen.getByText('Read the board in seconds')).toBeInTheDocument();
    expect(screen.getByText('Start every run on even footing')).toBeInTheDocument();
    expect(screen.getByText('Learn without opening another tab')).toBeInTheDocument();
  });

  it('shows a publish-ready single-player encounter mock on the play route', () => {
    window.history.replaceState({}, '', '/play');

    render(<App />);

    expect(screen.getByText('Player health')).toBeInTheDocument();
    expect(screen.getByText('Enemy health')).toBeInTheDocument();
    expect(screen.getByText('Turn 1 - Player action')).toBeInTheDocument();
    expect(screen.getByText('Player nexus 20')).toBeInTheDocument();
    expect(screen.getByText('Enemy nexus 20')).toBeInTheDocument();
    expect(screen.getByText('Energy 1/1')).toBeInTheDocument();
    expect(screen.getByText('Cards in hand 3')).toBeInTheDocument();
    expect(screen.getByText('Enemy energy 0/0')).toBeInTheDocument();
    expect(screen.getByText('Frontline')).toBeInTheDocument();
    expect(screen.getByText('Support lane')).toBeInTheDocument();
    expect(screen.getByText('Backline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Lantern Squire to Frontline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Copper Scout to Support lane' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass with 1 energy unspent' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Encounter log' })).toBeInTheDocument();
    expect(screen.getByText('Opening session from the engine contract: both players begin at 20 health and the player acts first.')).toBeInTheDocument();
  });

  it('updates document metadata for the active route', () => {
    document.head.innerHTML = '<meta name="description" content="" />';
    window.history.replaceState({}, '', '/rules');

    render(<App />);

    expect(document.title).toBe('How to Play - Duel TCG');
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Start with three cards and one energy, learn the lane-based turn flow, and understand how Duel TCG resolves combat.'
    );
  });

  it('sets cards metadata for the reference route', () => {
    document.head.innerHTML = '<meta name="description" content="" />';
    window.history.replaceState({}, '', '/cards');

    render(<App />);

    expect(document.title).toBe('Card Gallery - Duel TCG');
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Browse the starter factions, creature lineup, and support spells.'
    );
  });

  it('shows a usable rules guide on the rules route', () => {
    window.history.replaceState({}, '', '/rules');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'How to Play' })).toBeInTheDocument();
    expect(screen.getByText('Set up')).toBeInTheDocument();
    expect(
      screen.getByText('Both players begin at 20 nexus health and three cards in hand. You open with one energy while the AI starts at zero.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Win by reducing the rival nexus from 20 health to 0 before they do the same to you.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Each turn you draw a card, gain 1 energy, play units or tactics, then attack across three lanes.')
    ).toBeInTheDocument();
    expect(screen.getByText('Unblocked attackers deal their power directly to the enemy nexus.')).toBeInTheDocument();
    expect(screen.getByText('Deck rhythm')).toBeInTheDocument();
    expect(screen.getByText('Runs are designed around short matches, so mulligan for a one-cost play and your first clean attack lane.')).toBeInTheDocument();
  });

  it('turns the cards route into a useful reference page', () => {
    window.history.replaceState({}, '', '/cards');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Card Gallery' })).toBeInTheDocument();
    expect(
      screen.getByText('Browse the starter factions, creature lineup, and support spells.')
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Starter factions and archetypes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Representative cards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card anatomy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sunforge Vanguard' })).toBeInTheDocument();
    expect(screen.getByText('Sky Armada')).toBeInTheDocument();
    expect(screen.getByText('Vanguard - Frontline')).toBeInTheDocument();
    expect(screen.getByText('When this unit survives combat, gain 1 energy next turn.')).toBeInTheDocument();
    expect(screen.getByText('Cost controls how early you can deploy a card.')).toBeInTheDocument();
    expect(screen.getByText('Traits hint at faction synergies and deckbuilding hooks.')).toBeInTheDocument();
  });
});
