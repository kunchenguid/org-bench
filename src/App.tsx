import { useEffect, useState } from 'preact/hooks';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routes: Record<RouteKey, { hash: string; label: string }> = {
  home: { hash: '#/', label: 'Home' },
  play: { hash: '#/play', label: 'Play' },
  rules: { hash: '#/rules', label: 'Rules' },
  cards: { hash: '#/cards', label: 'Cards' },
};

function getRouteFromHash(hash: string): RouteKey {
  switch (hash) {
    case '#/play':
      return 'play';
    case '#/rules':
      return 'rules';
    case '#/cards':
      return 'cards';
    default:
      return 'home';
  }
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));

    if (!window.location.hash) {
      window.location.hash = routes.home.hash;
    }

    window.addEventListener('hashchange', onHashChange);
    onHashChange();

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Single-player card duels</p>
          <h1>Duel of the Fading Embers</h1>
        </div>
        <nav className="site-nav" aria-label="Primary">
          {Object.entries(routes).map(([key, value]) => (
            <a
              key={key}
              className={route === key ? 'active' : ''}
              href={value.hash}
            >
              {value.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="page-frame">{renderPage(route)}</main>
    </div>
  );
}

function renderPage(route: RouteKey) {
  if (route === 'play') {
    return (
      <section className="panel hero-panel">
        <p className="eyebrow">Play</p>
        <h2>Choose an encounter</h2>
        <p>
          The combat board, decks, persistence, and ladder will land on this page next.
        </p>
      </section>
    );
  }

  if (route === 'rules') {
    return (
      <section className="panel">
        <p className="eyebrow">Rules</p>
        <h2>How to Play</h2>
        <p>
          Each turn you gain ember, play creatures and spells, attack on your battle step,
          and try to reduce the rival champion to zero health.
        </p>
      </section>
    );
  }

  if (route === 'cards') {
    return (
      <section className="panel">
        <p className="eyebrow">Reference</p>
        <h2>Card Gallery</h2>
        <p>The full illustrated card set and hover details will be assembled here.</p>
      </section>
    );
  }

  return (
    <section className="hero-grid">
      <div className="panel hero-panel">
        <p className="eyebrow">Frontier fantasy TCG</p>
        <h2>Command emberbound hunters against crystalline invaders.</h2>
        <p>
          This shared scaffold establishes navigation, visual tone, and the route shell that
          later rounds will expand into a complete browser duel experience.
        </p>
        <div className="cta-row">
          <a className="button primary" href="#/play">
            Start Playing
          </a>
          <a className="button" href="#/cards">
            Browse Cards
          </a>
        </div>
      </div>

      <section className="panel preview-panel" aria-label="Faction preview">
        <div className="faction-card ember">
          <span className="sigil">E</span>
          <h3>Ember Court</h3>
          <p>Fast pressure, disciplined soldiers, controlled flame.</p>
        </div>
        <div className="faction-card prism">
          <span className="sigil">P</span>
          <h3>Prism Coven</h3>
          <p>Crystal growth, warded units, and reflective magic.</p>
        </div>
      </section>
    </section>
  );
}
