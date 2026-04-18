import { render, screen } from '@testing-library/preact';

import { App } from './App';

describe('App shell', () => {
  beforeEach(() => {
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

  it('marks the current route in navigation', () => {
    globalThis.location.hash = '#/play';

    render(<App />);

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
});
