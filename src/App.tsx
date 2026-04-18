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

const homeStats = [
  { value: '3-step gauntlet', label: 'Escalating encounters with carry-over pressure.' },
  { value: '12 signature cards', label: 'Faction-defining creatures, spells, and relics.' },
  { value: '8 minute runs', label: 'Fast browser sessions built for instant retries.' }
] as const;

const factions = [
  {
    name: 'Emberfire Vanguard',
    tone: 'Aggro pressure',
    description:
      'Rush the board with scorch hounds, reckless captains, and finishers that reward every point of chip damage.',
    cards: ['Cinder Pup', 'Forge Banner', 'Final Spark'],
    className: 'ember'
  },
  {
    name: 'Aether Covenant',
    tone: 'Tempo control',
    description:
      'Float between lanes with shield drones, delayed bursts, and precision tricks that flip losing turns.',
    cards: ['Static Warden', 'Slipstream Ward', 'Zenith Archive'],
    className: 'aether'
  }
] as const;

const encounters = [
  {
    name: 'Gate of Cinders',
    detail: 'Open against a redline swarm that teaches combat math under pressure.'
  },
  {
    name: 'Glassgarden Crossing',
    detail: 'Shift into a mirror-like midboss with shields, resets, and punishing counters.'
  },
  {
    name: 'The Zenith Prism',
    detail: 'Finish with a skyforge duel where one clean setup turn decides the run.'
  }
] as const;

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
  const isHome = route === 'home';

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
        {isHome ? (
          <>
            <section className="hero-panel hero-home">
              <div className="hero-copy">
                <p className="eyebrow">Static TCG Campaign</p>
                <h1>{page.title}</h1>
                <p className="hero-lede">Choose a side in a shattered sky war.</p>
                <p>{page.body}</p>
                <div className="hero-actions">
                  <a className="button primary strong" href="#/play">
                    Enter the Gauntlet
                  </a>
                  <a className="button secondary" href="#/cards">
                    Study Both Factions
                  </a>
                </div>
              </div>

              <aside className="hero-aside" aria-label="Run snapshot">
                <div className="hero-badge">Live preview</div>
                <ul className="hero-stats">
                  {homeStats.map((stat) => (
                    <li key={stat.value}>
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </section>

            <section className="section-block" aria-labelledby="faction-previews-title">
              <div className="section-heading">
                <p className="eyebrow">Faction previews</p>
                <h2 id="faction-previews-title">Faction Previews</h2>
              </div>

              <div className="preview-grid factions-grid">
                {factions.map((faction) => (
                  <article key={faction.name} className={`preview-card faction-card ${faction.className}`}>
                    <p className="card-kicker">{faction.tone}</p>
                    <h3>{faction.name}</h3>
                    <p>{faction.description}</p>
                    <ul className="card-chip-list" aria-label={`${faction.name} signature cards`}>
                      {faction.cards.map((card) => (
                        <li key={card}>{card}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <section className="section-block encounter-strip" aria-labelledby="encounter-path-title">
              <div className="section-heading">
                <p className="eyebrow">Boss route</p>
                <h2 id="encounter-path-title">Encounter Path</h2>
              </div>

              <div className="encounter-grid">
                {encounters.map((encounter, index) => (
                  <article key={encounter.name} className="encounter-card">
                    <span className="encounter-step">0{index + 1}</span>
                    <h3>{encounter.name}</h3>
                    <p>{encounter.detail}</p>
                  </article>
                ))}
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
          </>
        ) : (
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
        )}
      </main>
    </div>
  );
}
