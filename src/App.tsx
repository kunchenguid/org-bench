import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

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

const feedbackPatterns = [
  {
    name: 'Card Play Lift',
    tone: 'play',
    className: 'fx-card-play',
    body: 'Use for cards leaving hand and settling onto the board with a short upward lift and glow.'
  },
  {
    name: 'Attack Lunge',
    tone: 'attack',
    className: 'fx-attack-lunge',
    body: 'Use on attackers to sell forward momentum before they snap back into their lane.'
  },
  {
    name: 'Damage Flash',
    tone: 'damage',
    className: 'fx-damage-flash',
    body: 'Use when units or heroes take damage to pair a red pulse with a quick shake.'
  },
  {
    name: 'Turn Sweep',
    tone: 'turn',
    className: 'fx-turn-sweep',
    body: 'Use for turn transitions to sweep focus across the active side of the board.'
  },
  {
    name: 'Victory-Loss Overlay',
    tone: 'outcome',
    className: 'fx-outcome-rise',
    body: 'Use for win or loss overlays so results rise in with a soft backdrop bloom.'
  }
] as const;

function getRouteFromHash(hash: string): RouteKey {
  const value = hash.replace(/^#\/?/, '');
  return value in routes ? (value as RouteKey) : 'home';
}

function getHashForRoute(route: RouteKey) {
  return `#/${route}`;
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(window.location.hash));

  useLayoutEffect(() => {
    const normalizedHash = getHashForRoute(route);

    if (window.location.hash !== normalizedHash) {
      window.location.hash = normalizedHash;
    }
  }, [route]);

  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = getRouteFromHash(window.location.hash);

      setRoute(nextRoute);
    };

    window.addEventListener('hashchange', onHashChange);

    onHashChange();

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const page = routes[route];

  useLayoutEffect(() => {
    document.title = `${page.title} | Duel of Ash and Aether`;
  }, [page.title]);

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
              href={getHashForRoute(key as RouteKey)}
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

        <section className="feedback-kit" aria-labelledby="feedback-kit-title">
          <div className="section-copy">
            <p className="eyebrow">Visual Feedback Primitives</p>
            <h2 id="feedback-kit-title">Combat Feedback Kit</h2>
            <p>
              Reusable motion and overlay patterns for card play, attacks, damage hits, turn swaps,
              and match resolution.
            </p>
          </div>

          <div className="feedback-grid">
            {feedbackPatterns.map((pattern) => (
              <article key={pattern.name} className={`feedback-card tone-${pattern.tone}`}>
                <div className={`feedback-demo ${pattern.className}`} aria-hidden="true">
                  <span className="feedback-chip">Demo</span>
                </div>
                <h3>{pattern.name}</h3>
                <p>{pattern.body}</p>
                <code>{pattern.className}</code>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
