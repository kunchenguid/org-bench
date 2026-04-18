import { useEffect, useMemo, useState } from 'preact/hooks';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routes: Record<RouteKey, { hash: string; label: string }> = {
  home: { hash: '#/', label: 'Home' },
  play: { hash: '#/play', label: 'Play' },
  rules: { hash: '#/rules', label: 'Rules' },
  cards: { hash: '#/cards', label: 'Cards' },
};

const resolveRoute = (hash: string): RouteKey => {
  const match = (Object.entries(routes) as Array<[RouteKey, { hash: string }]>).find(([, route]) => route.hash === hash);
  return match?.[0] ?? 'home';
};

const pageCopy: Record<RouteKey, { title: string; eyebrow: string; body: string }> = {
  home: {
    title: 'Duel of Embers',
    eyebrow: 'Single-player tactical card duels',
    body: 'A polished browser card battler is taking shape here. Use the nav to reach the play board, learn the rules, or browse the card gallery.',
  },
  play: {
    title: 'Play',
    eyebrow: 'Encounter board',
    body: 'The playable duel board will live on this route. This scaffold keeps navigation and layout stable for the upcoming game systems.',
  },
  rules: {
    title: 'How to Play',
    eyebrow: 'Rules reference',
    body: 'This placeholder will become the player-facing rules page covering turns, mana, card types, attacks, and victory conditions.',
  },
  cards: {
    title: 'Card Gallery',
    eyebrow: 'Faction archive',
    body: 'The full illustrated card reference will be published here, using the same card frame language as the play board.',
  },
};

export function App() {
  const [hash, setHash] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const route = useMemo(() => resolveRoute(hash), [hash]);
  const page = pageCopy[route];

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p className="body-copy">{page.body}</p>
        </div>
        <div className="hero-card" aria-hidden="true">
          <div className="hero-sigil">*</div>
          <div className="hero-ribbon">Scaffold</div>
        </div>
      </header>
      <nav className="nav" aria-label="Primary">
        {(Object.entries(routes) as Array<[RouteKey, { hash: string; label: string }]>).map(([key, value]) => (
          <a
            key={key}
            className={route === key ? 'nav-link active' : 'nav-link'}
            href={value.hash}
            onClick={() => setHash(value.hash)}
          >
            {value.label}
          </a>
        ))}
      </nav>
      <main className="panel">
        <section>
          <h2>{page.title}</h2>
          <p>{page.body}</p>
        </section>
      </main>
    </div>
  );
}
