import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { App } from './App';

describe('App scaffold', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders navigation and switches between placeholder pages', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /shards of the veil/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/prototype home page/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /play/i }));
    expect(screen.getByRole('heading', { name: /play/i })).toBeInTheDocument();
    expect(screen.getByText(/turn 1/i)).toBeInTheDocument();
    expect(screen.getByText(/your health/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy health/i)).toBeInTheDocument();
    expect(screen.getByText(/your hand/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy hand/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /play cinder scout/i })[0]);
    expect(screen.getByText(/your battlefield/i)).toBeInTheDocument();
    expect(screen.getByText(/resources: 0\/1/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /play cinder scout/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole('link', { name: /rules/i }));
    expect(screen.getByRole('heading', { name: /rules/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));
    expect(screen.getByRole('heading', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(12);
    expect(screen.getByText(/cinder scout/i)).toBeInTheDocument();
    expect(screen.getByText(/glass current/i)).toBeInTheDocument();
  });

  it('restores the in-progress duel from local storage after reload', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: /play/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /play cinder scout/i })[0]);

    cleanup();
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: /play/i }));
    expect(screen.getByText(/resources: 0\/1/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /play cinder scout/i })).toHaveLength(1);
  });
});
