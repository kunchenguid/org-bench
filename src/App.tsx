import { useEffect, useState } from 'preact/hooks';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

type PageDefinition = {
  key: RouteKey;
  href: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  description: string;
};

const pages: PageDefinition[] = [
  {
    key: 'home',
    href: './',
    navLabel: 'Home',
    eyebrow: 'Single-player browser TCG',
    title: 'Duel TCG',
    description:
      'Challenge an AI rival in a compact lane-based card duel built for fast browser play.'
  },
  {
    key: 'play',
    href: './play',
    navLabel: 'Play',
    eyebrow: 'Encounter ladder',
    title: 'Play Duel TCG',
    description: 'Encounter gameplay scaffold coming in the next round.'
  },
  {
    key: 'rules',
    href: './rules',
    navLabel: 'Rules',
    eyebrow: 'Learn the basics',
    title: 'How to Play',
    description:
      'Rules, turn structure, resources, and victory conditions will be documented here.'
  },
  {
    key: 'cards',
    href: './cards',
    navLabel: 'Cards',
    eyebrow: 'Reference gallery',
    title: 'Card Gallery',
    description: 'Browse the starter factions, creature lineup, and support spells.'
  }
];

function getRouteFromPath(pathname: string): RouteKey {
  const normalizedPath = pathname.replace(/\/+$/, '');
  const pathParts = normalizedPath.split('/').filter(Boolean);
  const leaf = pathParts[pathParts.length - 1];

  if (leaf === 'play' || leaf === 'rules' || leaf === 'cards') {
    return leaf;
  }

  return 'home';
}

function useRoute(): RouteKey {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromPath(window.location.pathname));

  useEffect(() => {
    const syncRoute = () => setRoute(getRouteFromPath(window.location.pathname));

    window.addEventListener('popstate', syncRoute);

    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  return route;
}

function ActivePage({ route }: { route: RouteKey }) {
  const page = pages.find((entry) => entry.key === route) ?? pages[0];

  return (
    <section className="panel hero-panel">
      <p className="eyebrow">{page.eyebrow}</p>
      <h1>{page.title}</h1>
      <p className="lede">{page.description}</p>
      {route === 'home' ? (
        <div className="feature-grid">
          <article className="panel inset-panel">
            <h2>Fast encounter flow</h2>
            <p>Prebuilt decks, visible zones, and deterministic turns keep the duel readable.</p>
          </article>
          <article className="panel inset-panel">
            <h2>Browser-first ladder</h2>
            <p>Play through a sequence of AI opponents with no login, backend, or downloads.</p>
          </article>
          <article className="panel inset-panel">
            <h2>Teach as you play</h2>
            <p>Rules and card reference stay one click away so players can learn without guessing.</p>
          </article>
        </div>
      ) : null}
    </section>
  );
}

export function App() {
  const route = useRoute();

  return (
    <div className="app-shell">
      <header className="site-header panel">
        <div>
          <p className="wordmark">Duel TCG</p>
          <p className="subhead">A polished static card battler for a nested-path deployment.</p>
        </div>
        <nav aria-label="Primary">
          <ul className="nav-list">
            {pages.map((page) => (
              <li key={page.key}>
                <a className={page.key === route ? 'nav-link active' : 'nav-link'} href={page.href}>
                  {page.navLabel}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        <ActivePage route={route} />
      </main>
    </div>
  );
}
