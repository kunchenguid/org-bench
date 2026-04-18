import { useEffect, useState } from 'preact/hooks';

import { IllustratedCard } from './components/IllustratedCard';
import { cardPool, factions } from './data/cards';

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
    body: 'Pilot a compact duel surface with an opening hand preview built from the same card frames used in the gallery.'
  },
  rules: {
    label: 'Rules',
    title: 'Rules',
    body: 'Learn turn flow, mana growth, creatures, spells, and the ladder structure here as the rules reference fills in.'
  },
  cards: {
    label: 'Cards',
    title: 'Card Gallery',
    body: 'Browse the opening card pool, compare faction identities, and inspect the reusable illustrated frame for each card.'
  }
};

const openingHand = [cardPool[0], cardPool[3], cardPool[1]];

function renderRouteSection(route: RouteKey) {
  if (route === 'cards') {
    return (
      <>
        <section className="faction-grid" aria-label="Faction Identities">
          {factions.map((faction) => (
            <article key={faction.id} className={`faction-card ${faction.id}`}>
              <p className="faction-kicker">Faction identity</p>
              <h2>{faction.name}</h2>
              <p>{faction.epithet}</p>
              <p>{faction.identity}</p>
            </article>
          ))}
        </section>

        <section className="card-gallery" aria-label="Initial Card Pool">
          {cardPool.map((card) => (
            <IllustratedCard key={card.id} card={card} surface="gallery" />
          ))}
        </section>
      </>
    );
  }

  if (route === 'play') {
    return (
      <section className="play-surface" aria-label="Play Surface Preview">
        <div className="play-copy">
          <h2>Opening Hand</h2>
          <p>Opening hand previews the same illustrated card frame used in the gallery.</p>
        </div>
        <div className="play-hand">
          {openingHand.map((card) => (
            <IllustratedCard key={card.id} card={card} surface="play" />
          ))}
        </div>
      </section>
    );
  }

  return (
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
  );
}

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

        {renderRouteSection(route)}
      </main>
    </div>
  );
}
