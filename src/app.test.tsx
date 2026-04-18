import { render, screen } from '@testing-library/preact';
import { App } from './app';

describe('App shell', () => {
  it('updates the document title to match the active route', () => {
    window.location.hash = '#/rules';

    render(<App />);

    expect(document.title).toBe('Rules Primer - Duel of Ash and Aether');
  });

  it('renders the placeholder navigation and home content', () => {
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Duel of Ash and Aether' })).toBeInTheDocument();
  });

  it('renders a rules primer when the rules route is active', () => {
    window.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: 'Rules Primer' })).toBeInTheDocument();
    expect(screen.getByText('Reach 10 renown before your rival does, or leave them with no cards left to draw at the start of their turn.')).toBeInTheDocument();
    expect(screen.getByText('Each turn has four beats: ready, draw, main, and clash. Ready refreshes your exhausted cards, draw refills your hand, main lets you deploy allies and relics, and clash sends your front line into combat.')).toBeInTheDocument();
  });
});
