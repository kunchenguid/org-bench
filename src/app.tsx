import { useEffect, useState } from 'preact/hooks';

import { loadSavedGameState, saveGameState } from './game/persistence';
import { createInitialGameState } from './game/state';

const routes = {
  '/': {
    title: 'Home',
    content: 'A compact single-player card battler built for static hosting.'
  },
  '/play': {
    title: 'Play',
    content: 'Encounter ladder coming next round.'
  },
  '/rules': {
    title: 'Rules',
    content: 'Rules overview coming next round.'
  },
  '/cards': {
    title: 'Cards',
    content: 'Card gallery coming next round.'
  },
  '/legal': {
    title: 'Legal and Contact',
    content: 'All rights reserved.'
  }
} as const;

type RoutePath = keyof typeof routes;

function getRouteFromHash(hash: string): RoutePath {
  const normalized = hash.replace(/^#/, '') || '/';

  if (normalized in routes) {
    return normalized as RoutePath;
  }

  return '/';
}

export function App() {
  const [route, setRoute] = useState<RoutePath>(() => getRouteFromHash(window.location.hash));
  const [gameState] = useState(() => loadSavedGameState() ?? createInitialGameState());

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    saveGameState(gameState);
  }, [gameState]);

  const page = routes[route];
  const onNavigate = (nextRoute: RoutePath) => () => {
    window.location.hash = nextRoute;
    setRoute(nextRoute);
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">Static site scaffold</p>
        <h1>Duel TCG</h1>
        <p className="lede">Preact + Vite shell with static-safe hash routing.</p>
      </header>

      <nav aria-label="Primary" className="nav-bar">
        <a href="#/" onClick={onNavigate('/')}>
          Home
        </a>
        <a href="#/play" onClick={onNavigate('/play')}>
          Play
        </a>
        <a href="#/rules" onClick={onNavigate('/rules')}>
          Rules
        </a>
        <a href="#/cards" onClick={onNavigate('/cards')}>
          Cards
        </a>
      </nav>

      <main className="page-card">
        <h2>{page.title}</h2>
        {route === '/play' ? (
          <section aria-label="Current match">
            <p>{`Turn ${gameState.turn} - ${gameState.activePlayer} to act`}</p>
            <p>{`You: ${gameState.player.health} HP`}</p>
            <p>{`Opponent: ${gameState.opponent.health} HP`}</p>
            <p>{`Hand: ${gameState.player.hand.length} cards`}</p>
            <p>This match auto-saves in your browser using localStorage.</p>
          </section>
        ) : route === '/legal' ? (
          <section aria-label="Legal and contact">
            <p>All rights reserved.</p>
            <p>This benchmark build is provided for browser evaluation inside the oracle-seed-01 run.</p>
            <p>Match progress is stored locally in your browser using localStorage.</p>
            <p>
              Contact: <a href="mailto:vera@oracle-seed-01.local">Contact Vera</a>
            </p>
          </section>
        ) : (
          <p>{page.content}</p>
        )}
      </main>

      <footer className="footer-bar">
        <a href="#/legal" onClick={onNavigate('/legal')}>
          Legal and Contact
        </a>
      </footer>
    </div>
  );
}
