import { useEffect, useState } from 'preact/hooks';
import { storageKey } from '../game/storage';
import { getCurrentRoute, getRouteHref, type RouteKey } from './router';

const pages: Record<RouteKey, { title: string; body: string }> = {
  home: {
    title: 'Campaign hub',
    body:
      'Choose a route to start the static site experience. The next round will wire this shell into the full duel campaign.',
  },
  play: {
    title: 'Play',
    body:
      'This scaffold reserves the play surface for the full browser duel board, encounter ladder, and save-resume flow.',
  },
  rules: {
    title: 'Rules',
    body:
      'Use this page to teach turn flow, mana, creatures, spells, and victory conditions once the core systems land.',
  },
  cards: {
    title: 'Card gallery',
    body:
      'This page will list the final card pool, keywords, and faction references for players who want to study decks.',
  },
};

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getCurrentRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = getCurrentRoute(window.location.hash);
      setRoute(nextRoute);
      localStorage.setItem(storageKey('last-route'), nextRoute);
    };

    window.addEventListener('hashchange', onHashChange);
    onHashChange();

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const page = pages[route];

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Duel TCG</p>
          <h1>Static campaign card battler</h1>
          <p className="lede">
            Built for browser play from a repository subpath, with room for a full single-player ladder and card ruleset.
          </p>
        </div>
        <nav aria-label="Primary">
          <a href={getRouteHref('home')}>Home</a>
          <a href={getRouteHref('play')}>Play</a>
          <a href={getRouteHref('rules')}>How to Play</a>
          <a href={getRouteHref('cards')}>Cards</a>
        </nav>
      </header>

      <main className="content">
        <section className="panel">
          <p className="panel-label">Current page</p>
          <h2>{page.title}</h2>
          <p>{page.body}</p>
        </section>

        <section className="panel grid">
          <article>
            <p className="panel-label">Technical baseline</p>
            <h3>What is already wired</h3>
            <ul>
              <li>Vite + TypeScript + Preact scaffold</li>
              <li>Hash navigation safe for nested publish paths</li>
              <li>Browser storage namespacing helper for run isolation</li>
              <li>Placeholder routes for home, play, rules, and cards</li>
            </ul>
          </article>
          <article>
            <p className="panel-label">Next build targets</p>
            <h3>What workers can layer in</h3>
            <ul>
              <li>Game state engine with deterministic turn flow</li>
              <li>Encounter ladder and AI deck definitions</li>
              <li>Rules copy and polished information architecture</li>
              <li>Card gallery and production-ready visual design</li>
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}
