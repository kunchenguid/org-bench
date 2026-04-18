import { fireEvent, render, screen } from '@testing-library/preact';
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App card gallery route', () => {
  const originalHash = window.location.hash;

  beforeEach(() => {
    window.location.hash = '#/cards';
    window.localStorage.clear();
  });

  afterEach(() => {
    window.location.hash = originalHash;
    window.localStorage.clear();
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

  it('restores the last selected faction and card from persisted gallery state', () => {
    const firstRender = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Verdant Loom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal Canopy Warden rules' }));

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText(/When Canopy Warden enters play, restore 2 health to your nexus\./)).toBeTruthy();

    firstRender.unmount();
    render(<App />);

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText(/When Canopy Warden enters play, restore 2 health to your nexus\./)).toBeTruthy();
  });

  it('reveals a card when its keyboard control receives focus', () => {
    render(<App />);

    fireEvent.focus(screen.getByRole('button', { name: 'Reveal Cinder Oath rules' }));

    expect(
      screen.getByText(/Deal 3 damage to a unit\. If that unit leaves play this turn, draw a card\./),
    ).toBeTruthy();
  });

  it('shows an updated visible card count for the active faction filter', () => {
    render(<App />);

    expect(screen.getByText('Showing 6 cards')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gloam Syndicate' }));

    expect(screen.getByText('Showing 2 cards')).toBeTruthy();
  });
});
