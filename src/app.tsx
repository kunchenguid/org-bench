import { useEffect, useState } from 'preact/hooks';

const routes = [
  { hash: '#/', label: 'Home' },
  { hash: '#/play', label: 'Play' },
  { hash: '#/rules', label: 'Rules' },
  { hash: '#/cards', label: 'Cards' }
] as const;

const siteTitle = 'Duel of Ash and Aether';

const pageContent: Record<string, { eyebrow: string; title: string; body: string[] }> = {
  '#/': {
    eyebrow: 'Static site scaffold',
    title: siteTitle,
    body: ['A polished single-player duel TCG is taking shape here. The scaffold now includes navigation, route placeholders, and nested-path-safe builds so gameplay work can land on top.']
  },
  '#/play': {
    eyebrow: 'Play',
    title: 'Encounter Table',
    body: ['This page will host the full browser duel board, encounter ladder, and persistence-driven resume flow.']
  },
  '#/rules': {
    eyebrow: 'How to Play',
    title: 'Rules Primer',
    body: [
      'Reach 10 renown before your rival does, or leave them with no cards left to draw at the start of their turn.',
      'Each turn has four beats: ready, draw, main, and clash. Ready refreshes your exhausted cards, draw refills your hand, main lets you deploy allies and relics, and clash sends your front line into combat.'
    ]
  },
  '#/cards': {
    eyebrow: 'Card Gallery',
    title: 'Field Archive',
    body: ['This gallery placeholder will be replaced by the illustrated card reference used across the site and in play.']
  }
};

function getCurrentRoute() {
  if (typeof window === 'undefined') {
    return '#/';
  }

  return pageContent[window.location.hash] ? window.location.hash : '#/';
}

export function App() {
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    const syncRoute = () => setRoute(getCurrentRoute());
    window.addEventListener('hashchange', syncRoute);

    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    const currentPage = pageContent[route];
    document.title = route === '#/' ? siteTitle : `${currentPage.title} - ${siteTitle}`;
  }, [route]);

  const currentPage = pageContent[route];

  return (
    <div class="app-shell">
      <header class="site-header">
        <div>
          <p class="eyebrow">Bootstrap release</p>
          <h1>Duel of Ash and Aether</h1>
        </div>
        <nav aria-label="Primary">
          <ul class="nav-list">
            {routes.map((entry) => (
              <li key={entry.hash}>
                <a class={entry.hash === route ? 'nav-link active' : 'nav-link'} href={entry.hash}>
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main class="hero-panel">
        <p class="eyebrow">{currentPage.eyebrow}</p>
        <h2>{currentPage.title}</h2>
        {currentPage.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </main>
    </div>
  );
}
