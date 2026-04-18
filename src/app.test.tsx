import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App scaffold', () => {
  it('renders navigation and swaps pages from the hash route', async () => {
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByRole('heading', { name: /duel of the fading embers/i })).toBeInTheDocument();
    window.location.hash = '#/rules';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: /how to play/i })).toBeInTheDocument();
    window.location.hash = '#/cards';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: /card gallery/i })).toBeInTheDocument();
    window.location.hash = '#/play';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: /choose an encounter/i })).toBeInTheDocument();
  });
});
