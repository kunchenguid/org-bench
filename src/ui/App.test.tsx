import { render, screen } from '@testing-library/preact';
import { App } from './App';

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = '#/play';
    window.localStorage.clear();
    window.__DUEL_TCG_STORAGE_NAMESPACE__ = 'test-run:';
  });

  it('renders primary navigation and tracks the namespaced route', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How to Play' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Play' })).toBeInTheDocument();
    expect(window.localStorage.getItem('test-run:last-route')).toBe('play');
  });
});
