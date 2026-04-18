import { useEffect, useState } from 'preact/hooks';

import { getPersistenceKey } from './game/engine';

type RouteKey = '/' | '/play' | '/rules' | '/cards';

const lastRouteStorageKey = 'duel-tcg:last-route';
const runId = 'apple-seed-01';

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

function getSavedRoute(): Exclude<RouteKey, '/'> | null {
  const savedRoute = globalThis.localStorage?.getItem(lastRouteStorageKey);
  if (savedRoute === '/play' || savedRoute === '/rules' || savedRoute === '/cards') {
    return savedRoute;
  }
  return null;
}

function clearSavedRoute() {
  globalThis.localStorage?.removeItem(lastRouteStorageKey);
}

function clearSavedDuel() {
  globalThis.localStorage?.removeItem(getPersistenceKey(runId));
}

function getSavedDuelEncounterId() {
  const rawState = globalThis.localStorage?.getItem(getPersistenceKey(runId));

  if (!rawState) {
    return null;
  }

  try {
    const parsedState = JSON.parse(rawState) as { encounter?: { id?: unknown } };
    return typeof parsedState.encounter?.id === 'string' ? parsedState.encounter.id : null;
  } catch {
    return null;
  }
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(globalThis.location?.hash ?? ''));
  const [savedRoute, setSavedRoute] = useState<Exclude<RouteKey, '/'> | null>(() => getSavedRoute());
  const [savedDuelEncounterId, setSavedDuelEncounterId] = useState(() => getSavedDuelEncounterId());

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(globalThis.location.hash));
    };

    globalThis.addEventListener('hashchange', onHashChange);
    return () => globalThis.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (route === '/') {
      return;
    }

    globalThis.localStorage?.setItem(lastRouteStorageKey, route);
    setSavedRoute(route);
  }, [route]);

  const page = routes[route];
  const resumeRoute = route === '/' ? savedRoute : null;
  const resumeTitle = resumeRoute ? routes[resumeRoute].title : null;

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Static Browser Game</p>
        <h1>Duel TCG</h1>
        <p className="lede">A compact fantasy duel game site built for a nested deployment path and ready for the gameplay layer.</p>
      </header>

      <nav aria-label="Primary" className="nav">
        <a aria-current={route === '/' ? 'page' : undefined} href="#/">Home</a>
        <a aria-current={route === '/play' ? 'page' : undefined} href="#/play">Play</a>
        <a aria-current={route === '/rules' ? 'page' : undefined} href="#/rules">Rules</a>
        <a aria-current={route === '/cards' ? 'page' : undefined} href="#/cards">Cards</a>
      </nav>

      <main className="panel">
        <p className="section-label">{route === '/' ? 'Overview' : 'Scaffold Route'}</p>
        <h2>{page.title}</h2>
        <p>{page.description}</p>
        {route === '/' && savedDuelEncounterId ? (
          <div className="saved-duel-actions">
            <p className="save-indicator">Saved duel available - {savedDuelEncounterId}</p>
            <a className="saved-duel-link" href="#/play">
              Continue saved duel
            </a>
            <button
              className="saved-duel-clear"
              type="button"
              onClick={() => {
                clearSavedDuel();
                setSavedDuelEncounterId(null);
                if (savedRoute === '/play') {
                  clearSavedRoute();
                  setSavedRoute(null);
                }
              }}
            >
              Clear saved duel
            </button>
          </div>
        ) : null}
        {resumeRoute && resumeTitle ? (
          <div className="resume-actions">
            <a className="resume-link" href={`#${resumeRoute}`}>
              Resume {resumeTitle}
            </a>
            <button
              className="resume-clear"
              type="button"
              onClick={() => {
                clearSavedRoute();
                setSavedRoute(null);
              }}
            >
              Clear saved route
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
