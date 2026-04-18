import { render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';

import { App } from './app';

describe('rules page', () => {
  afterEach(() => {
    window.location.hash = '#/';
  });

  test('teaches the turn flow and victory condition', () => {
    window.location.hash = '#/rules';

    render(<App />);

    expect(screen.getByRole('heading', { name: /quick duel flow/i })).toBeInTheDocument();
    expect(screen.getByText(/1\. spark/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. deploy/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. clash/i)).toBeInTheDocument();
    expect(screen.getByText(/reduce the rival binder to 0 ember/i)).toBeInTheDocument();
  });
});
