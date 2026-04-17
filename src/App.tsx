import { FunctionalComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { getRouteFromHash, type RouteKey } from './router';

type NavLink = {
  href: string;
  label: string;
  route: RouteKey;
};

const navLinks: NavLink[] = [
  { href: './#/', label: 'Home', route: 'home' },
  { href: './#/play', label: 'Play', route: 'play' },
  { href: './#/rules', label: 'Rules', route: 'rules' },
  { href: './#/cards', label: 'Cards', route: 'cards' },
];

const pageCopy: Record<RouteKey, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Single-player card battles',
    title: 'Duel TCG',
    body:
      'A polished browser-first card game is landing here. This scaffold sets up the published shell, navigation, and nested-path-safe routing for the full campaign and battle system.',
  },
  play: {
    eyebrow: 'Play page',
    title: 'Encounter Board',
    body:
      'The combat board, campaign ladder, and save-resume flow will attach here on top of the shared shell.',
  },
  rules: {
    eyebrow: 'Rules page',
    title: 'How To Play',
    body:
      'This route is reserved for the full player-facing rules reference covering turn flow, mana, creatures, spells, and victory conditions.',
  },
  cards: {
    eyebrow: 'Card gallery',
    title: 'Card Reference',
    body:
      'The launch card pool, factions, and keyword glossary will be presented here with readable card details.',
  },
};

const App: FunctionalComponent = () => {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    const updateRoute = () => setRoute(getRouteFromHash(window.location.hash));
    updateRoute();
    window.addEventListener('hashchange', updateRoute);

    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const currentPage = pageCopy[route];

  return (
    <div class="site-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">{currentPage.eyebrow}</p>
          <h1>{currentPage.title}</h1>
          <p class="lede">{currentPage.body}</p>
        </div>
        <nav aria-label="Primary navigation" class="nav-grid">
          {navLinks.map((link) => (
            <a class={route === link.route ? 'nav-card active' : 'nav-card'} href={link.href} key={link.route}>
              <span>{link.label}</span>
              <small>{route === link.route ? 'Current page' : 'Open page'}</small>
            </a>
          ))}
        </nav>
      </header>

      <main class="content-panel">
        <section class="panel">
          <h2>Project Status</h2>
          <p>
            Shared scaffold is in place with TypeScript, Vite, Preact, route-aware navigation, and a
            build output configured for nested-path static hosting.
          </p>
        </section>

        <section class="panel muted">
          <h2>Next Build Layer</h2>
          <p>
            Upcoming work will add the duel engine, AI encounters, persistent saves, campaign ladder,
            rules copy, and complete card gallery.
          </p>
        </section>
      </main>
    </div>
  );
};

export { App };
