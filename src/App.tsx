import { useEffect, useState } from 'preact/hooks';

type RouteKey = '/' | '/play' | '/rules' | '/cards';

const navItems: Array<{ href: RouteKey; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/play', label: 'Play' },
  { href: '/rules', label: 'Rules' },
  { href: '/cards', label: 'Cards' },
];

const rulesSummary = [
  'Reduce the rival to 0 life before they do the same to you.',
  'Each turn, refill mana, draw a card, and take up to two actions.',
  'Creatures stay in play, while spells resolve once and go to the discard pile.',
];

const routes: Record<RouteKey, { title: string; sectionLabel: string; description: string }> = {
  '/': {
    title: 'Duel TCG',
    sectionLabel: 'Overview',
    description: 'A polished single-player card duel with campaign encounters and browser persistence is coming together here.',
  },
  '/play': {
    title: 'Play',
    sectionLabel: 'Battle Board',
    description: 'The playable duel board lands on this route. The scaffold keeps the path and layout stable for game integration.',
  },
  '/rules': {
    title: 'Rules',
    sectionLabel: 'Rulebook',
    description: 'Turn flow, mana, creatures, spells, and victory rules will be documented here for first-time players.',
  },
  '/cards': {
    title: 'Cards',
    sectionLabel: 'Card Library',
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

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(globalThis.location?.hash ?? ''));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(globalThis.location.hash));
    };

    globalThis.addEventListener('hashchange', onHashChange);
    return () => globalThis.removeEventListener('hashchange', onHashChange);
  }, []);

  const page = routes[route];

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Static Browser Game</p>
        <h1>Duel TCG</h1>
        <p className="lede">A compact fantasy duel game site built for a nested deployment path and ready for the gameplay layer.</p>
      </header>

      <nav aria-label="Primary" className="nav">
        {navItems.map((item) => {
          const isCurrent = route === item.href;

          return (
            <a aria-current={isCurrent ? 'page' : undefined} data-active={isCurrent} href={`#${item.href}`}>
              {item.label}
            </a>
          );
        })}
      </nav>

      <main className="panel">
        <p className="section-label">{page.sectionLabel}</p>
        <h2>{page.title}</h2>
        <p>{page.description}</p>
        {route === '/rules' ? (
          <ul className="panel-list">
            {rulesSummary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
