import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from './app';

describe('App scaffold', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('renders the home page and navigates to placeholder routes', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /duel of embers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /rules/i }));
    expect(screen.getByRole('heading', { level: 1, name: /how to play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));
    expect(screen.getByRole('heading', { level: 1, name: /card gallery/i })).toBeInTheDocument();
  });
});
