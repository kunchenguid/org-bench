import { render, screen } from '@testing-library/preact';
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
});
