import { useEffect, useState } from 'preact/hooks';

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

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
        <p>{page.content}</p>
      </main>
    </div>
  );
}
