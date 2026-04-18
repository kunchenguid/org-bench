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
    globalThis.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('updates the document title for the active route', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(document.title).toBe('Cards - Duel TCG');
  });

  it('shows the opening encounter on the play route', () => {
    globalThis.location.hash = '#/play';

    render(<App />);

    expect(screen.getByText('Ashen Vanguard')).toBeInTheDocument();
    expect(screen.getByText(/20 health/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('keeps the intended route when the hash includes a trailing slash or query string', () => {
    globalThis.location.hash = '#/rules/?ref=nav';

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders authored rules sections on the rules route', () => {
    globalThis.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByText('Turn Flow')).toBeInTheDocument();
    expect(screen.getByText('Keywords')).toBeInTheDocument();
    expect(screen.getByText('Rookie Table')).toBeInTheDocument();
    expect(screen.getByText('Draw one card at the start of your turn.')).toBeInTheDocument();
  });

  it('renders the shared card catalog on the cards route', () => {
    globalThis.location.hash = '#/cards';

    render(<App />);

    expect(screen.getByText('Skyforge')).toBeInTheDocument();
    expect(screen.getByText('Wildroot')).toBeInTheDocument();
    expect(screen.getByText('Skyforge Squire')).toBeInTheDocument();
    expect(screen.getByText('Canopy Elder')).toBeInTheDocument();
  });
});
