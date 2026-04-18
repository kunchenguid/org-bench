import { fireEvent, render, screen } from '@testing-library/preact';

import { App } from './App';
import { getPersistenceKey } from './game/engine';

describe('App shell', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.location.hash = '';
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

    globalThis.location.hash = '';
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
