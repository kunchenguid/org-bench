import { render, screen } from '@testing-library/preact';

import { App } from './App';

describe('App shell', () => {
  beforeEach(() => {
    globalThis.location.hash = '#/';
  });

  it('shows navigation for all required pages', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '#/');
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '#/play');
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('href', '#/rules');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', '#/cards');
    expect(screen.getByRole('heading', { level: 1, name: 'Duel TCG' })).toBeInTheDocument();
  });

  it('marks the current route in navigation', () => {
    globalThis.location.hash = '#/play';

    render(<App />);

    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('shows starter deck references on the cards route', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByRole('heading', { level: 3, name: 'Sunsteel Vanguard' })).toBeInTheDocument();
    expect(screen.getByText('Lantern Squire')).toBeInTheDocument();
    expect(screen.getByText('Aegis Burst')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Ashen Vanguard' })).toBeInTheDocument();
    expect(screen.getByText('Cinder Familiar')).toBeInTheDocument();
    expect(screen.getByText('Inferno Drake')).toBeInTheDocument();
  });
});
