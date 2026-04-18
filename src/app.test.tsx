import { render, screen } from '@testing-library/preact';
import { App } from './app';

describe('App shell', () => {
  it('renders the placeholder navigation and home content', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Duel of Ash and Aether' })).toBeInTheDocument();
  });

  it('turns the rules route into a readable primer', () => {
    window.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: 'Rules Primer' })).toBeInTheDocument();
    expect(screen.getByText(/Each duelist starts with 20 health/i)).toBeInTheDocument();
    expect(screen.getByText(/Start of turn: gain 1 ember/i)).toBeInTheDocument();
    expect(screen.getByText(/Creatures stay on the field to attack each turn/i)).toBeInTheDocument();
    expect(screen.getByText(/Reduce the rival to 0 health/i)).toBeInTheDocument();

    window.location.hash = '#/';
  });
});
