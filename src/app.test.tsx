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

    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('shows route-specific section labels outside the home page', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByText('Card Library')).toBeInTheDocument();
    expect(screen.queryByText('Scaffold Route')).not.toBeInTheDocument();
  });

  it('shows a compact rules summary on the rules route', () => {
    globalThis.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByText('Reduce the rival to 0 life before they do the same to you.')).toBeInTheDocument();
    expect(screen.getByText('Each turn, refill mana, draw a card, and take up to two actions.')).toBeInTheDocument();
    expect(screen.getByText('Creatures stay in play, while spells resolve once and go to the discard pile.')).toBeInTheDocument();
  });
});
