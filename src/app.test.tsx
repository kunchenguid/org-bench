import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from './App';

describe('App scaffold', () => {
  it('renders navigation and switches between placeholder pages', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(document.title).toBe('Shards of the Veil');

    expect(
      screen.getByRole('heading', { name: /shards of the veil/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/prototype home page/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /play/i }));
    expect(screen.getByRole('link', { name: /play/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(document.title).toBe('Play - Shards of the Veil');
    expect(screen.getByRole('heading', { name: /play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /rules/i }));
    expect(screen.getByRole('link', { name: /rules/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(document.title).toBe('Rules - Shards of the Veil');
    expect(screen.getByRole('heading', { name: /rules/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));
    expect(screen.getByRole('link', { name: /cards/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(document.title).toBe('Cards - Shards of the Veil');
    expect(screen.getByRole('heading', { name: /cards/i })).toBeInTheDocument();
  });
});
