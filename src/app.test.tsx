import { render, screen } from '@testing-library/preact';

import { App } from './App';

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
});
