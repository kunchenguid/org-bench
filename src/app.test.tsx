import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
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
    expect(
      screen.getByText('See a real session rendered from the engine contract, then take a legal action and watch the turn state update.')
    ).toBeInTheDocument();
  });

  it('gives the home route customer-ready product framing', () => {
    window.history.replaceState({}, '', '/');

    render(<App />);

    expect(screen.getByText('Three lanes. One rival. Ten-minute runs.')).toBeInTheDocument();
    expect(screen.getByText('Read the board in seconds')).toBeInTheDocument();
    expect(screen.getByText('Start every run on even footing')).toBeInTheDocument();
    expect(screen.getByText('Learn without opening another tab')).toBeInTheDocument();
  });

  it('renders the live opening session and lets the player pass into the ai turn', () => {
    window.history.replaceState({}, '', '/play');

    render(<App />);

    expect(screen.getByText('Turn 1 - Player action')).toBeInTheDocument();
    expect(screen.getByText('Ashen Vanguard')).toBeInTheDocument();
    expect(screen.getByText('Active player Player')).toBeInTheDocument();
    expect(screen.getByText('Player health')).toBeInTheDocument();
    expect(screen.getByText('Enemy health')).toBeInTheDocument();
    expect(screen.getByText('Player nexus 20')).toBeInTheDocument();
    expect(screen.getByText('Enemy nexus 20')).toBeInTheDocument();
    expect(screen.getByText('Energy 1/1')).toBeInTheDocument();
    expect(screen.getByText('Cards in hand 3')).toBeInTheDocument();
    expect(screen.getByText('Deck 3')).toBeInTheDocument();
    expect(screen.getByText('Discard 0')).toBeInTheDocument();
    expect(screen.getByText('Enemy energy 0/0')).toBeInTheDocument();
    expect(screen.getByText('Frontline')).toBeInTheDocument();
    expect(screen.getByText('Support lane')).toBeInTheDocument();
    expect(screen.getByText('Backline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Lantern Squire to Frontline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass with 1 energy unspent' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Encounter log' })).toBeInTheDocument();
    expect(screen.getByText('Opening session from the engine contract: both players begin at 20 health and the player acts first.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pass with 1 energy unspent' }));

    expect(screen.getByText('Turn 2 - AI action')).toBeInTheDocument();
    expect(screen.getByText('Active player AI')).toBeInTheDocument();
    expect(screen.getByText('Energy 1/1')).toBeInTheDocument();
    expect(screen.getByText('Player energy 1/1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass turn' })).toBeInTheDocument();
  });

  it('loads a saved encounter on the play route and lets the customer start over', async () => {
    const { createGameSession, createGameStorage, playCard } = await import('./game/engine');

    window.localStorage.clear();
    window.history.replaceState({}, '', '/play');

    const gameStorage = createGameStorage(window.localStorage, 'amazon-seed-01');
    const firstRender = render(<App />);

    expect(screen.getByText('No saved encounter yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save encounter' }));

    expect(screen.getByText('Saved current encounter')).toBeInTheDocument();

    const resumedSession = playCard(createGameSession({ encounterId: 'encounter-1' }), {
      cardId: 'p-1',
      lane: 'frontline',
      type: 'play_unit'
    });

    gameStorage.save(resumedSession);
    firstRender.unmount();
    cleanup();

    render(<App />);

    expect(screen.getByText('Energy 0/1')).toBeInTheDocument();
    expect(screen.getByText('Cards in hand 2')).toBeInTheDocument();
    expect(screen.getByText('Allied: Lantern Squire')).toBeInTheDocument();
    expect(screen.getByText('Saved encounter loaded')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(screen.getByText('Started a fresh encounter')).toBeInTheDocument();
    expect(screen.getByText('Energy 1/1')).toBeInTheDocument();
    expect(screen.getByText('Cards in hand 3')).toBeInTheDocument();
    expect(screen.getAllByText('Allied: Empty')).toHaveLength(3);
    expect(gameStorage.load()).toBeNull();
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
