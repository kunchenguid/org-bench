import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from './app';

describe('App scaffold', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('renders a readable duel board shell on the play route', () => {
    window.location.hash = '#/play';

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /play/i })).toBeInTheDocument();
    expect(screen.getByText(/turn 6 - player attack/i)).toBeInTheDocument();
    expect(screen.getByText(/north battlefield/i)).toBeInTheDocument();
    expect(screen.getByText(/south battlefield/i)).toBeInTheDocument();
    expect(screen.getByText(/player hand/i)).toBeInTheDocument();
    expect(screen.getByText(/deck: 18/i)).toBeInTheDocument();
    expect(screen.getByText(/discard: 4/i)).toBeInTheDocument();
    expect(screen.getByText(/health 18/i)).toBeInTheDocument();
    expect(screen.getByText(/aether 6\/8/i)).toBeInTheDocument();
    expect(screen.getByText(/ember archivist/i)).toBeInTheDocument();
    expect(screen.getAllByText(/solari/i).length).toBeGreaterThan(0);
  });

  it('keeps navigation stable when moving into and out of the play route', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /duel of embers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^play$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /^play$/i }));
    expect(window.location.hash).toBe('#/play');
    expect(screen.getByText(/player hand/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /^rules$/i }));
    expect(window.location.hash).toBe('#/rules');
    expect(screen.getByRole('heading', { level: 1, name: /how to play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /^cards$/i }));
    expect(window.location.hash).toBe('#/cards');
    expect(screen.getByRole('heading', { level: 1, name: /card gallery/i })).toBeInTheDocument();
  });
});
