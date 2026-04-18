import { useEffect, useState } from 'preact/hooks';

import { getCardsByFaction, getFactionSummaries } from './app/card-catalog';
import { createPlayPageLayout } from './app/play-page';
import { ladderSteps, rulesSections } from './app/rules-content';
import { createGameSession, getPersistenceKey } from './game/engine';

type RouteKey = '/' | '/play' | '/rules' | '/cards';

const lastRouteStorageKey = 'duel-tcg:last-route';
const runId = 'apple-seed-01';

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

function getSavedRoute(): Exclude<RouteKey, '/'> | null {
  const savedRoute = globalThis.localStorage?.getItem(lastRouteStorageKey);
  if (savedRoute === '/play' || savedRoute === '/rules' || savedRoute === '/cards') {
    return savedRoute;
  }
  return null;
}

function clearSavedRoute() {
  globalThis.localStorage?.removeItem(lastRouteStorageKey);
}

function clearSavedDuel() {
  globalThis.localStorage?.removeItem(getPersistenceKey(runId));
}

function getSavedDuelEncounterId() {
  const rawState = globalThis.localStorage?.getItem(getPersistenceKey(runId));

  if (!rawState) {
    return null;
  }

  try {
    const parsedState = JSON.parse(rawState) as { encounter?: { id?: unknown } };
    return typeof parsedState.encounter?.id === 'string' ? parsedState.encounter.id : null;
  } catch {
    return null;
  }
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(globalThis.location?.hash ?? ''));
  const [savedRoute, setSavedRoute] = useState<Exclude<RouteKey, '/'> | null>(() => getSavedRoute());
  const [savedDuelEncounterId, setSavedDuelEncounterId] = useState(() => getSavedDuelEncounterId());

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(globalThis.location.hash));
    };

    globalThis.addEventListener('hashchange', onHashChange);
    return () => globalThis.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (route === '/') {
      return;
    }

    globalThis.localStorage?.setItem(lastRouteStorageKey, route);
    setSavedRoute(route);
  }, [route]);

  const page = routes[route];
  const openingSession = route === '/play' ? createGameSession({ encounterId: 'encounter-1' }) : null;
  const playPageLayout = route === '/play' ? createPlayPageLayout() : null;
  const factionSummaries = route === '/cards' ? getFactionSummaries() : [];
  const isRulesRoute = route === '/rules';
  const resumeRoute = route === '/' ? savedRoute : null;
  const resumeTitle = resumeRoute ? routes[resumeRoute].title : null;

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

        {route === '/' && savedDuelEncounterId ? (
          <div className="saved-duel-actions">
            <p className="save-indicator">Saved duel available - {savedDuelEncounterId}</p>
            <a className="saved-duel-link" href="#/play">
              Continue saved duel
            </a>
            <button
              className="saved-duel-clear"
              type="button"
              onClick={() => {
                clearSavedDuel();
                setSavedDuelEncounterId(null);
                if (savedRoute === '/play') {
                  clearSavedRoute();
                  setSavedRoute(null);
                }
              }}
            >
              Clear saved duel
            </button>
          </div>
        ) : null}

        {resumeRoute && resumeTitle ? (
          <div className="resume-actions">
            <a className="resume-link" href={`#${resumeRoute}`}>
              Resume {resumeTitle}
            </a>
            <button
              className="resume-clear"
              type="button"
              onClick={() => {
                clearSavedRoute();
                setSavedRoute(null);
              }}
            >
              Clear saved route
            </button>
          </div>
        ) : null}

        {isRulesRoute ? (
          <div className="rules-layout">
            <div className="rules-grid" aria-label="Rules sections">
              {rulesSections.map((section) => (
                <section key={section.title} className="rules-card">
                  <p className="section-label">Rule Section</p>
                  <h3>{section.title}</h3>
                  <p>{section.intro}</p>
                  <ul className="rules-points">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
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
          <div className="rules-layout">
            <div className="session-summary" aria-label="Opening encounter summary">
              <p className="section-label">Encounter</p>
              <h3>{openingSession.encounter.opponentName}</h3>
              <p>
                Opening duel state: {openingSession.players.player.health} health, {openingSession.players.player.hand.length} cards in hand, turn {openingSession.turn.number}.
              </p>
            </div>

            {playPageLayout ? (
              <section className="session-summary" aria-label="Deterministic play surface summary">
                <p className="section-label">Combat lane</p>
                <h3>{playPageLayout.zones.find((zone) => zone.id === 'shared-battlefield')?.value}</h3>
                <p>{playPageLayout.encounterSummary}</p>
                <ul className="ladder-list">
                  {playPageLayout.turnControls.map((control) => (
                    <li key={control.label}>
                      <strong>{control.label}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {route === '/cards' ? (
          <div className="catalog-grid" aria-label="Card catalog by faction">
            {factionSummaries.map((summary) => (
              <section className="catalog-panel" key={summary.faction}>
                <p className="section-label">Faction</p>
                <h3>{summary.faction}</h3>
                <p>{summary.blurb}</p>
                <p className="catalog-meta">
                  {summary.creatureCount} creatures - {summary.spellCount} spells
                </p>
                <ul className="catalog-list">
                  {getCardsByFaction(summary.faction).map((card) => (
                    <li key={card.name}>
                      <span>{card.name}</span>
                      <span>{card.cost}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
