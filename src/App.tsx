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
  const previewSession = route === '/play' || route === '/cards' ? createGameSession({ encounterId: 'encounter-1' }) : null;

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(globalThis.location.hash));
    };

    globalThis.addEventListener('hashchange', onHashChange);
    return () => globalThis.removeEventListener('hashchange', onHashChange);
  }, []);

  const page = routes[route];

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
        {route === '/play' && previewSession ? (
          <div className="session-summary">
            <p className="section-label">Encounter</p>
            <h3>{previewSession.encounter.opponentName}</h3>
            <p>
              Opening duel state: {previewSession.players.player.health} health, {previewSession.players.player.hand.length} cards in hand, turn {previewSession.turn.number}.
            </p>
            <p>Opponent: {previewSession.encounter.opponentName}</p>
            <p>Opening hand: {previewSession.players.player.hand.length} cards</p>
            <p>Starting mana: {previewSession.players.player.resources.current}</p>
          </div>
        ) : null}
        {route === '/rules' ? (
          <div className="rules-layout">
            <div className="rules-sections">
              {rulesSections.map((section) => (
                <section className="rules-card" key={section.title}>
                  <h3>{section.title}</h3>
                  <p>{section.intro}</p>
                </section>
              ))}
            </div>

            <section className="rules-card ladder-card">
              <h3>Ladder Focus</h3>
              <ul>
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
        {route === '/cards' && previewSession ? (
          <section className="rules-card cards-preview">
            <h3>Opening Hand Preview</h3>
            <p>Player deck: {previewSession.players.player.hand.length} cards in hand, {previewSession.players.player.deck.length} in draw pile.</p>
            <ul>
              {previewSession.players.player.hand.map((card) => (
                <li key={card.id}>{card.name}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
