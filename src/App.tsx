import { useEffect, useState } from 'preact/hooks';

import { ladderSteps, rulesSections } from './app/rules-content';
import { createGameSession } from './game/engine';

type RouteKey = '/' | '/play' | '/rules' | '/cards';

const navItems: Array<{ href: `#${RouteKey}`; label: string; route: RouteKey }> = [
  { href: '#/', label: 'Home', route: '/' },
  { href: '#/play', label: 'Play', route: '/play' },
  { href: '#/rules', label: 'Rules', route: '/rules' },
  { href: '#/cards', label: 'Cards', route: '/cards' },
];

const routes: Record<RouteKey, { title: string; description: string }> = {
  '/': {
    title: 'Duel TCG',
    description: 'A polished single-player card duel with campaign encounters and browser persistence is coming together here.',
  },
  '/play': {
    title: 'Play',
    description: 'The playable duel board lands on this route. The scaffold keeps the path and layout stable for game integration.',
  },
  '/rules': {
    title: 'Rules',
    description: 'Turn flow, mana, creatures, spells, and victory rules will be documented here for first-time players.',
  },
  '/cards': {
    title: 'Cards',
    description: 'This page will hold the card reference and faction overview for the shipped card pool.',
  },
};

function getRouteFromHash(hash: string): RouteKey {
  const normalizedPath = (hash.replace(/^#/, '').split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (normalizedPath === '/play' || normalizedPath === '/rules' || normalizedPath === '/cards') {
    return normalizedPath;
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
  const openingSession = route === '/play' ? createGameSession({ encounterId: 'encounter-1' }) : null;
  const isRulesRoute = route === '/rules';

  useEffect(() => {
    document.title = route === '/' ? 'Duel TCG' : `${page.title} - Duel TCG`;
  }, [page.title, route]);

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Static Browser Game</p>
        <h1>Duel TCG</h1>
        <p className="lede">A compact fantasy duel game site built for a nested deployment path and ready for the gameplay layer.</p>
      </header>

      <nav aria-label="Primary" className="nav">
        {navItems.map((item) => (
          <a
            key={item.route}
            href={item.href}
            className={route === item.route ? 'is-active' : undefined}
            aria-current={route === item.route ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <main className="panel">
        <p className="section-label">{route === '/' ? 'Overview' : 'Scaffold Route'}</p>
        <h2>{page.title}</h2>
        <p>{page.description}</p>

        {isRulesRoute ? (
          <div className="rules-layout">
            <div className="rules-grid" aria-label="Rules sections">
              {rulesSections.map((section) => (
                <section key={section.title} className="rules-card">
                  <p className="section-label">Rule Section</p>
                  <h3>{section.title}</h3>
                  <p>{section.intro}</p>
                </section>
              ))}
            </div>

            <section className="session-summary" aria-label="Ladder progression guidance">
              <p className="section-label">Ladder</p>
              <h3>Progression Goals</h3>
              <ul className="ladder-list">
                {ladderSteps.map((step) => (
                  <li key={step.name}>
                    <strong>{step.name}</strong>
                    <span>{step.goal}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}

        {openingSession ? (
          <div className="session-summary" aria-label="Opening encounter summary">
            <p className="section-label">Encounter</p>
            <h3>{openingSession.encounter.opponentName}</h3>
            <p>
              Opening duel state: {openingSession.players.player.health} health, {openingSession.players.player.hand.length} cards in hand, turn {openingSession.turn.number}.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
