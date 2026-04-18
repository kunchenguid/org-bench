import { fireEvent, render, screen } from '@testing-library/preact';

import { App } from './App';
import { getPersistenceKey } from './game/engine';

describe('App shell', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.location.hash = '#/';
  });

  it('shows navigation for all required pages', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '#/');
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '#/play');
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('href', '#/rules');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', '#/cards');
    expect(screen.getByRole('heading', { level: 1, name: 'Duel TCG' })).toBeInTheDocument();
  });

  it('marks the active route in primary navigation', () => {
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

  it('renders the shared card catalog on the cards route', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByRole('heading', { level: 3, name: 'Skyforge' })).toBeInTheDocument();
    expect(screen.getByText('disciplined tempo and formation combat')).toBeInTheDocument();
    expect(screen.getByText('Skyforge Squire')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Wildroot' })).toBeInTheDocument();
    expect(screen.getByText('growth, healing, and oversized bodies')).toBeInTheDocument();
    expect(screen.getByText('Canopy Elder')).toBeInTheDocument();
  });

  it('renders authored rules sections on the rules route', () => {
    globalThis.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByText('Turn Flow')).toBeInTheDocument();
    expect(screen.getByText('Keywords')).toBeInTheDocument();
    expect(screen.getByText('Rookie Table')).toBeInTheDocument();
    expect(screen.getByText('Draw one card at the start of your turn.')).toBeInTheDocument();
  });

  it('persists the last non-home route for future resume', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(globalThis.localStorage.getItem('duel-tcg:last-route')).toBe('/cards');
  });

  it('shows a resume link on home when a saved route exists', () => {
    globalThis.localStorage.setItem('duel-tcg:last-route', '/play');

    render(<App />);

    expect(screen.getByRole('link', { name: 'Resume Play' })).toHaveAttribute('href', '#/play');
  });

  it('clears the saved route from home', () => {
    globalThis.localStorage.setItem('duel-tcg:last-route', '/play');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved route' }));

    expect(globalThis.localStorage.getItem('duel-tcg:last-route')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Resume Play' })).toBeNull();
  });

  it('surfaces when a saved duel exists for this run', () => {
    globalThis.localStorage.setItem(getPersistenceKey('apple-seed-01'), JSON.stringify({ encounter: { id: 'encounter-1' } }));

    render(<App />);

    expect(screen.getByText('Saved duel available - encounter-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue saved duel' })).toHaveAttribute('href', '#/play');
  });

  it('clears the saved duel state from home', () => {
    globalThis.localStorage.setItem('duel-tcg:last-route', '/play');
    globalThis.localStorage.setItem(getPersistenceKey('apple-seed-01'), JSON.stringify({ encounter: { id: 'encounter-1' } }));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved duel' }));

    expect(globalThis.localStorage.getItem(getPersistenceKey('apple-seed-01'))).toBeNull();
    expect(globalThis.localStorage.getItem('duel-tcg:last-route')).toBeNull();
    expect(screen.queryByText(/Saved duel available/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Resume Play' })).toBeNull();
  });

  it('ignores malformed saved duel state', () => {
    globalThis.localStorage.setItem(getPersistenceKey('apple-seed-01'), '{bad json');

    render(<App />);

    expect(screen.queryByText(/Saved duel available/)).toBeNull();
  });
});
