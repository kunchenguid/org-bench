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
});
