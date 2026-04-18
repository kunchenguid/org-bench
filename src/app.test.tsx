import { render, screen } from '@testing-library/preact';
import { expect, test, describe } from 'vitest';
import { App } from './app';

describe('App scaffold', () => {
  test('shows the home page by default', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Duel TCG' })).toBeTruthy();
    expect(screen.getAllByText('A fast single-player card battler built for the browser.').length).toBeGreaterThan(0);
  });

  test('renders the placeholder play page when the hash is set', () => {
    window.location.hash = '#play';

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Play' })).toBeTruthy();
    expect(screen.getAllByText('The playable duel board and encounter ladder will be built here.').length).toBeGreaterThan(0);
  });
});
