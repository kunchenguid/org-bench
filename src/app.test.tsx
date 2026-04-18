import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from './App';

describe('App scaffold', () => {
  it('renders navigation and switches between placeholder pages', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /shards of the veil/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/prototype home page/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /play/i }));
    expect(screen.getByRole('heading', { name: /play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /rules/i }));
    expect(screen.getByRole('heading', { name: /rules/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /cards/i }));
    expect(screen.getByRole('heading', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(12);
    expect(screen.getByText(/cinder scout/i)).toBeInTheDocument();
    expect(screen.getByText(/glass current/i)).toBeInTheDocument();
  });
});
