import { render, screen } from '@testing-library/preact';

import { App } from './App';

describe('App shell', () => {
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
});
