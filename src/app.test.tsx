import { render, screen } from '@testing-library/preact';
import { App } from './app';

describe('App shell', () => {
  it('renders the scaffold navigation and page sections', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /shardbound duel/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /rules/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByText(/prototype map/i)).toBeInTheDocument();
  });
});
