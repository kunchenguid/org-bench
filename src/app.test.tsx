import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from './app';
import { cardLibrary } from './cards';

describe('App scaffold', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('marks the active nav item as the route changes', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /play/i })).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));

    expect(screen.getByRole('link', { name: /cards/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  it('renders the home page and navigates to placeholder routes', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /duel of embers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /rules/i }));
    expect(screen.getByRole('heading', { level: 1, name: /how to play/i })).toBeInTheDocument();
    expect(screen.getByText(/each turn gives you 1 more ember until you reach 6/i)).toBeInTheDocument();
    expect(screen.getByText(/play creature cards onto your battlefield row/i)).toBeInTheDocument();
    expect(screen.getByText(/win the campaign by defeating all 4 encounters in order/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));
    expect(screen.getByRole('heading', { level: 1, name: /card gallery/i })).toBeInTheDocument();
    expect(screen.getAllByText(/12 illustrated cards across two factions/i)).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: /ember covenant/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /tidemark circle/i })).toBeInTheDocument();
    expect(screen.getByText(/ashen battlemage/i)).toBeInTheDocument();
    expect(screen.getByText(/tidal archivist/i)).toBeInTheDocument();
  });

  it('exposes a reusable 12-card library for the rest of the game', () => {
    expect(cardLibrary).toHaveLength(12);
    expect(cardLibrary.map((card) => card.name)).toContain('Ashen Battlemage');
    expect(cardLibrary.map((card) => card.name)).toContain('Tidal Archivist');
    expect(new Set(cardLibrary.map((card) => card.faction))).toEqual(new Set(['Ember Covenant', 'Tidemark Circle']));
  });

  it('normalizes unsupported hashes back to the home route', () => {
    window.location.hash = '#/unknown-route';

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /duel of embers/i })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
  });
});
