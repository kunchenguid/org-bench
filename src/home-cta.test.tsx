import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, test } from 'vitest';

import { App } from './app';

describe('home page CTA', () => {
  test('sends a player from home straight to play', async () => {
    window.location.hash = '#/';

    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: /start the first duel/i }));

    expect(window.location.hash).toBe('#/play');
    expect(await screen.findByRole('heading', { name: /play the first duel/i })).toBeInTheDocument();
  });
});
