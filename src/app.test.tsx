import { render, screen } from '@testing-library/preact';

import { App } from './App';

describe('App shell', () => {
  beforeEach(() => {
    globalThis.location.hash = '#/';
    document.title = 'Duel TCG';
  });

  it('shows navigation for all required pages', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '#/');
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '#/play');
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('href', '#/rules');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', '#/cards');
    expect(screen.getByRole('heading', { level: 1, name: 'Duel TCG' })).toBeInTheDocument();
  });

  it('marks the current route in navigation', () => {
    globalThis.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('updates the document title for the active route', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(document.title).toBe('Cards - Duel TCG');
  });

  it('shows the opening encounter on the play route', () => {
    globalThis.location.hash = '#/play';

    render(<App />);

    expect(screen.getByText('Ashen Vanguard')).toBeInTheDocument();
    expect(screen.getByText(/20 health/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('keeps the intended route when the hash includes a trailing slash or query string', () => {
    globalThis.location.hash = '#/rules/?ref=nav';

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the opening encounter summary on the play route', () => {
    globalThis.location.hash = '#/play';

    render(<App />);

    expect(screen.getByText(/Opponent: Ashen Vanguard/)).toBeInTheDocument();
    expect(screen.getByText(/Opening hand: 3 cards/)).toBeInTheDocument();
    expect(screen.getByText(/Starting mana: 1/)).toBeInTheDocument();
  });

  it('updates the browser title for the active route', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(document.title).toBe('Cards - Duel TCG');
  });

  it('renders the authored rules content on the rules route', () => {
    globalThis.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByText('Turn Flow')).toBeInTheDocument();
    expect(screen.getByText(/Every round follows the same order/)).toBeInTheDocument();
    expect(screen.getByText('Rookie Table')).toBeInTheDocument();
  });

  it('shows a deterministic card preview on the cards route', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByText('Lantern Squire')).toBeInTheDocument();
    expect(screen.getByText('Signal Flare')).toBeInTheDocument();
    expect(screen.getByText(/Player deck: 3 cards in hand, 3 in draw pile/)).toBeInTheDocument();
  });
});
