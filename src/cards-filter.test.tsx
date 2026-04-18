import { fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';

import { App } from './app';

describe('cards page filters', () => {
  afterEach(() => {
    window.location.hash = '#/';
  });

  test('lets players narrow the archive to one faction', () => {
    window.location.hash = '#/cards';

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /graveglass syndicate/i }));

    expect(screen.getByText(/mirror cryptkeeper/i)).toBeInTheDocument();
    expect(screen.getByText(/debt collector/i)).toBeInTheDocument();
    expect(screen.queryByText(/ashen duelist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/skybreak adept/i)).not.toBeInTheDocument();
  });
});
