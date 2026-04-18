import { render, screen } from '@testing-library/preact';
import { describe, expect, test } from 'vitest';

import { App } from './App';

describe('App', () => {
  test('shows the benchmark scaffold heading and worker cards', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /facebook benchmark scaffold/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /workers/i })).toBeInTheDocument();
    expect(screen.getByText(/nina/i)).toBeInTheDocument();
  });
});
