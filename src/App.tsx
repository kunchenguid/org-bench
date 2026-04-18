import { useEffect, useState } from 'preact/hooks';

type RouteKey = '/' | '/play' | '/rules' | '/cards';

const routes: Record<RouteKey, { title: string; description: string }> = {
  '/': {
    title: 'Duel TCG',
    description: 'A polished single-player card duel with campaign encounters and browser persistence is coming together here.',
  },
  '/play': {
    title: 'Play',
    description: 'The playable duel board lands on this route. The scaffold keeps the path and layout stable for game integration.',
  },
  '/rules': {
    title: 'Rules',
    description: 'Turn flow, mana, creatures, spells, and victory rules will be documented here for first-time players.',
  },
  '/cards': {
    title: 'Cards',
    description: 'This page will hold the card reference and faction overview for the shipped card pool.',
  },
};

function getRouteFromHash(hash: string): RouteKey {
  const rawPath = hash.replace(/^#/, '') || '/';
  if (rawPath === '/play' || rawPath === '/rules' || rawPath === '/cards') {
    return rawPath;
  }
  return '/';
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(globalThis.location?.hash ?? ''));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(globalThis.location.hash));
    };

    globalThis.addEventListener('hashchange', onHashChange);
    return () => globalThis.removeEventListener('hashchange', onHashChange);
  }, []);

  const page = routes[route];

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Static Browser Game</p>
        <h1>Duel TCG</h1>
        <p className="lede">A compact fantasy duel game site built for a nested deployment path and ready for the gameplay layer.</p>
      </header>

      <nav aria-label="Primary" className="nav">
        <a aria-current={route === '/' ? 'page' : undefined} className={route === '/' ? 'is-active' : undefined} href="#/">
          Home
        </a>
        <a
          aria-current={route === '/play' ? 'page' : undefined}
          className={route === '/play' ? 'is-active' : undefined}
          href="#/play"
        >
          Play
        </a>
        <a
          aria-current={route === '/rules' ? 'page' : undefined}
          className={route === '/rules' ? 'is-active' : undefined}
          href="#/rules"
        >
          Rules
        </a>
        <a
          aria-current={route === '/cards' ? 'page' : undefined}
          className={route === '/cards' ? 'is-active' : undefined}
          href="#/cards"
        >
          Cards
        </a>
      </nav>

      <main className="panel">
        <p className="section-label">{route === '/' ? 'Overview' : 'Scaffold Route'}</p>
        <h2>{page.title}</h2>
        <p>{page.description}</p>
      </main>
    </div>
  );
}
