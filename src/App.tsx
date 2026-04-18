import { useEffect, useState } from 'preact/hooks';

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

        <section className="preview-grid" aria-label={route === 'rules' ? 'Rules Reference' : 'Scaffold Preview'}>
          {previewSections.map((section) => (
            <article key={section.title} className={`preview-card ${section.tone}`}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
