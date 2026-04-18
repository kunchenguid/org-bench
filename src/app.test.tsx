import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from './app';

describe('App scaffold', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('marks the active nav item and updates the location hash', () => {
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

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));
    expect(screen.getByRole('heading', { level: 2, name: /card gallery/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /ember covenant/i })).toBeInTheDocument();
  });
});
