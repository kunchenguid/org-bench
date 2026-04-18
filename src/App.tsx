import { useEffect, useState } from 'preact/hooks';

import { ladderEncounters } from './campaign';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routes: Record<RouteKey, { label: string; title: string; body: string }> = {
  home: {
    label: 'Home',
    title: 'Duel of Ash and Aether',
    body: 'Challenge a sequence of browser-based card duels in a world split between Emberfire and skybound Aethercraft.'
  },
  play: {
    label: 'Play',
    title: 'Play',
    body: 'Scaffold play surface for the single-player duel flow. Encounter setup, board zones, and persistence hooks land next.'
  },
  rules: {
    label: 'Rules',
    title: 'Rules',
    body: 'Learn turn flow, mana growth, creatures, spells, and the ladder structure here as the rules reference fills in.'
  },
  cards: {
    label: 'Cards',
    title: 'Card Gallery',
    body: 'Browse the Ember and Aether card catalog here as the illustrated card pool is added.'
  }
};

function getRouteFromHash(hash: string): RouteKey {
  const value = hash.replace(/^#\/?/, '');
  return value in routes ? (value as RouteKey) : 'home';
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);

    if (!window.location.hash) {
      window.location.hash = '#/home';
    }

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const page = routes[route];
  const isPlayRoute = route === 'play';

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/home">
          <span className="brand-mark">A</span>
          <span>Duel of Ash and Aether</span>
        </a>
        <nav className="nav" aria-label="Primary">
          {Object.entries(routes).map(([key, item]) => (
            <a
              key={key}
              className={route === key ? 'nav-link active' : 'nav-link'}
              href={`#/${key}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="layout">
        <section className="hero-panel">
          <p className="eyebrow">Static TCG Campaign</p>
          <h1>{page.title}</h1>
          <p>{page.body}</p>
          <div className="hero-actions">
            <a className="button primary" href="#/play">
              Start Duel
            </a>
            <a className="button secondary" href="#/rules">
              Learn Rules
            </a>
          </div>
        </section>

        {isPlayRoute ? (
          <section className="preview-grid" aria-label="Encounter Ladder">
            {ladderEncounters.map((encounter) => (
              <article key={encounter.id} className="preview-card ladder encounter-card">
                <p className="eyebrow">{encounter.opponent}</p>
                <h2>{encounter.name}</h2>
                <p>{encounter.summary}</p>
                <p><strong>Player deck:</strong> {encounter.playerDeck.name}</p>
                <p><strong>Enemy deck:</strong> {encounter.enemyDeck.name}</p>
                <p><strong>AI plan:</strong></p>
                <ul className="ai-plan">
                  {encounter.aiPlan.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        ) : (
          <section className="preview-grid" aria-label="Scaffold Preview">
            <article className="preview-card ember">
              <h2>Ember Guild</h2>
              <p>A fast pressure faction built around sparks, burn, and battlefield momentum.</p>
            </article>
            <article className="preview-card aether">
              <h2>Aether Covenant</h2>
              <p>A tempo faction that manipulates energy, shields, and tactical positioning.</p>
            </article>
            <article className="preview-card ladder">
              <h2>Encounter Ladder</h2>
              <p>Round 1 scaffold leaves room for a three-fight gauntlet with persistent progress.</p>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
