import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('shows primary navigation and the selected page content', () => {
    window.history.replaceState({}, '', '/play');

    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', './');
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', './play');
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('href', './rules');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', './cards');
    expect(screen.getByRole('heading', { name: 'Play Duel TCG' })).toBeInTheDocument();
    expect(screen.getByText('Encounter gameplay scaffold coming in the next round.')).toBeInTheDocument();
  });
});
