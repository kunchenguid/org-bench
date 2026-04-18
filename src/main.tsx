import { render } from 'preact';
import { App } from './app';
import './styles.css';

function mount() {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Missing app mount element');
  }

  render(<App />, container);
}

mount();

globalThis.addEventListener('hashchange', mount);
