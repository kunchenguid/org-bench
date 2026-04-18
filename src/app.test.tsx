import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './app';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('App shell routing', () => {
  it('renders the home page by default', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /duel academy/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /start playing/i }),
    ).toHaveAttribute('href', '#/play');
  });

  it('renders each placeholder page from the visible nav', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: /^play$/i }));
    expect(screen.getByRole('heading', { name: /play duel/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /rules/i }));
    expect(screen.getByRole('heading', { name: /how to play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));
    expect(screen.getByRole('heading', { name: /card gallery/i })).toBeInTheDocument();
  });
});
