import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from '../src/app';

describe('App shell', () => {
  test('renders home navigation and content', () => {
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /duel tcg/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '#/');
    expect(screen.getByRole('link', { name: /play/i })).toHaveAttribute('href', '#/play');
    expect(screen.getByRole('link', { name: /rules/i })).toHaveAttribute('href', '#/rules');
    expect(screen.getByRole('link', { name: /cards/i })).toHaveAttribute('href', '#/cards');
    expect(screen.getByText(/single-player browser card duels/i)).toBeInTheDocument();
  });

  test('lets the player start an encounter, take a turn, and see the AI respond', () => {
    window.location.hash = '#/play';

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start ember ridge encounter/i }));

    expect(screen.getByText(/turn 1 - your turn/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy health: 20/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /play ash striker/i }));

    expect(screen.getByRole('heading', { level: 3, name: /^battlefield$/i })).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) => node?.textContent?.replace(/\s+/g, ' ').trim() === 'Ash Striker2/2')
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/mana 0\/1/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /end turn/i }));

    expect(screen.getAllByText(/turn 2 - your turn/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/enemy played stoneguard sentinel/i)).toBeInTheDocument();
    expect(screen.getByText(/your health: 18/i)).toBeInTheDocument();
  });
});
