import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

type PageSection = {
  title: string;
  body: string;
};

type PageConfig = {
  label: string;
  title: string;
  body: string;
  sections?: PageSection[];
};

const routes: Record<RouteKey, PageConfig> = {
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
    body: 'Each duel is a race to reduce the opposing champion from 20 health to 0 before your own front line collapses.',
    sections: [
      {
        title: 'Turn Flow',
        body:
          'Ready your exhausted cards, draw 1 card, then gain 1 Ember before you play units, cast tactics, and choose attackers for the combat step.'
      },
      {
        title: 'Resources and Board',
        body:
          'Banked Ember carries over between turns, but unspent Aether fades at the end of combat. Units enter one of your three board slots and can guard your champion or swing at the rival line.'
      },
      {
        title: 'Card Types',
        body:
          'Champions lead your deck, units stay in play to attack or guard, and tactics resolve once before going to the discard.'
      },
      {
        title: 'Victory and Campaign Flow',
        body:
          'Win three encounters in a row to clear the gauntlet. Between fights you keep your surviving champion, refill your deck, and carry forward any relic rewards the encounter grants.'
      }
    ]
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
      setRoute(getRouteFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    onHashChange();

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const page = routes[route];
  const previewSections =
    route === 'rules'
      ? (page.sections ?? []).map((section) => ({ ...section, tone: 'rules' }))
      : [
          {
            title: 'Ember Guild',
            body: 'A fast pressure faction built around sparks, burn, and battlefield momentum.',
            tone: 'ember'
          },
          {
            title: 'Aether Covenant',
            body: 'A tempo faction that manipulates energy, shields, and tactical positioning.',
            tone: 'aether'
          },
          {
            title: 'Encounter Ladder',
            body: 'Round 1 scaffold leaves room for a three-fight gauntlet with persistent progress.',
            tone: 'ladder'
          }
        ];

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

        <section className="preview-grid" aria-label={route === 'rules' ? 'Rules Reference' : 'Scaffold Preview'}>
          {previewSections.map((section) => (
            <article key={section.title} className={`preview-card ${section.tone}`}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        {route === 'play' ? (
          <section className="board-shell" aria-labelledby="board-shell-title">
            <div className="board-shell-header">
              <div>
                <p className="eyebrow">Encounter Snapshot</p>
                <h2 id="board-shell-title">Live Duel Board</h2>
              </div>
              <p className="board-turn">Turn 4 - Ember Guild attack</p>
            </div>

            <div className="board-status-grid">
              <article className="status-card enemy-status">
                <h3>Enemy Health</h3>
                <p>16 / 20</p>
              </article>
              <article className="status-card player-status">
                <h3>Player Health</h3>
                <p>18 / 20</p>
              </article>
              <article className="status-card hand-status">
                <h3>Hand Dock</h3>
                <p>4 cards ready to deploy</p>
              </article>
            </div>

            <div className="lane-grid">
              <section className="lane-card front-lane">
                <h3>Front Lane</h3>
                <p>Pressure units clash here first.</p>
              </section>
              <section className="lane-card back-lane">
                <h3>Back Lane</h3>
                <p>Support units and relics stay protected here.</p>
              </section>
            </div>

            <div className="resource-row" aria-label="Deck and discard piles">
              <article className="resource-card">
                <h3>Deck</h3>
                <p>18 cards</p>
              </article>
              <article className="resource-card">
                <h3>Discard</h3>
                <p>5 cards</p>
              </article>
            </div>
          </section>
        ) : null}

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
