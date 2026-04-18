import { fireEvent, render, screen } from '@testing-library/preact';

import { App } from '../src/app';

describe('Play progression surface', () => {
  test('shows the encounter ladder and namespaced storage plan before the duel starts', () => {
    window.location.hash = '#/play';
    window.localStorage.clear();

    render(<App />);

    expect(screen.getByRole('heading', { level: 3, name: /encounter ladder/i })).toBeInTheDocument();
    expect(screen.getByText(/act 1: ember ridge/i)).toBeInTheDocument();
    expect(screen.getByText(/resume data is stored under/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume encounter/i })).not.toBeInTheDocument();
  });

  test('offers a resume affordance after an encounter has been saved', () => {
    window.location.hash = '#/play';
    window.localStorage.clear();

    const firstView = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start ember ridge encounter/i }));

    firstView.unmount();
    render(<App />);

    expect(screen.getByRole('button', { name: /resume encounter/i })).toBeInTheDocument();
    expect(screen.getByText(/saved run: ember ridge on turn 1/i)).toBeInTheDocument();
    expect(screen.getByText(/current checkpoint/i)).toBeInTheDocument();
  });

  test('ignores and clears a corrupted saved encounter payload', () => {
    window.location.hash = '#/play';
    window.localStorage.clear();
    window.localStorage.setItem('/duel-tcg:active-encounter', '{not valid json');

    render(<App />);

    expect(screen.queryByRole('button', { name: /resume encounter/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('/duel-tcg:active-encounter')).toBeNull();
  });

  test('lets the player clear a saved checkpoint from the play surface', () => {
    window.location.hash = '#/play';
    window.localStorage.clear();

    const firstView = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start ember ridge encounter/i }));

    firstView.unmount();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /clear saved run/i }));

    expect(screen.queryByRole('button', { name: /resume encounter/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/saved run: ember ridge on turn 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/current checkpoint/i)).not.toBeInTheDocument();
  });

  test('resumes a saved encounter back into the active duel view', () => {
    window.location.hash = '#/play';
    window.localStorage.clear();

    const firstView = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start ember ridge encounter/i }));

    firstView.unmount();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /resume encounter/i }));

    expect(screen.getByRole('heading', { level: 2, name: /ember ridge/i })).toBeInTheDocument();
    expect(screen.getByText(/turn 1 - your turn/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy health: 20/i)).toBeInTheDocument();
  });
});
