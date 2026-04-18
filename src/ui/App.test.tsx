import { fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App card gallery route', () => {
  const originalHash = window.location.hash;

  beforeEach(() => {
    window.location.hash = '#/cards';
  });

  afterEach(() => {
    window.location.hash = originalHash;
    document.body.innerHTML = '';
  });

  it('renders faction filters, card tiles, and reveals rules text on selection', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Card Gallery' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All factions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ashfall Covenant' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verdant Loom' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gloam Syndicate' })).toBeTruthy();

    const cards = screen.getAllByRole('article');
    expect(cards.length).toBeGreaterThanOrEqual(6);

    fireEvent.click(screen.getByRole('button', { name: 'Reveal Emberstrike Apprentice rules' }));

    expect(
      screen.getByText(/When Emberstrike Apprentice attacks alone, it gains \+2 power this turn\./),
    ).toBeTruthy();
  });
});
