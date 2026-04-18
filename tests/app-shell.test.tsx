import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

import { App } from '../src/app';

describe('App shell', () => {
  it('renders navigation links for all top-level pages', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Duel TCG' })).toBeInTheDocument();
  });

  it('switches pages through hash navigation', () => {
    window.location.hash = '#/';
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: 'Play' }));

    expect(screen.getByRole('heading', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('Encounter ladder coming next round.')).toBeInTheDocument();
  });
});
