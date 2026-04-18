import { render, screen } from '@testing-library/preact';
import { describe, expect, test } from 'vitest';

import { App } from './app';

describe('App', () => {
  test('shows the primary navigation and page title', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /duel of embers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /rules/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cards/i })).toBeInTheDocument();
  });

  test('offers a direct call to start the first duel from the hero', () => {
    render(<App />);

    const [heroCallToAction] = screen.getAllByRole('link', { name: /start first duel/i });

    expect(heroCallToAction).toHaveAttribute('href', '#/play');
  });
});
