import { render, screen } from '@testing-library/preact';

import { App } from '../src/app';

describe('Content pages', () => {
  test('renders a teachable rules page for new players', () => {
    window.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: /how to play/i })).toBeInTheDocument();
    expect(screen.getByText(/each turn follows the same rhythm:/i)).toBeInTheDocument();
    expect(screen.getByText(/gain 1 mana crystal/i)).toBeInTheDocument();
    expect(screen.getByText(/creatures stay on the board/i)).toBeInTheDocument();
    expect(screen.getByText(/reduce the enemy champion from 20 health to 0/i)).toBeInTheDocument();
  });

  test('renders a card gallery with card pool and deck lists', () => {
    window.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: /card gallery/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /starter card pool/i })).toBeInTheDocument();
    expect(screen.getByText(/^emberblade knight$/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /starter decks/i })).toBeInTheDocument();
    expect(screen.getByText(/solar vanguard/i)).toBeInTheDocument();
    expect(screen.getByText(/grave bloom/i)).toBeInTheDocument();
  });
});
