import { useEffect, useState } from 'preact/hooks';

const routes = [
  { hash: '#/', label: 'Home' },
  { hash: '#/play', label: 'Play' },
  { hash: '#/rules', label: 'Rules' },
  { hash: '#/cards', label: 'Cards' }
] as const;

const pageContent: Record<string, { eyebrow: string; title: string; body: string }> = {
  '#/': {
    eyebrow: 'Static site scaffold',
    title: 'Duel of Ash and Aether',
    body: 'A polished single-player duel TCG is taking shape here. The scaffold now includes navigation, route placeholders, and nested-path-safe builds so gameplay work can land on top.'
  },
  '#/play': {
    eyebrow: 'Play',
    title: 'Encounter Table',
    body: 'This page will host the full browser duel board, encounter ladder, and persistence-driven resume flow.'
  },
  '#/rules': {
    eyebrow: 'How to Play',
    title: 'Rules Primer',
    body: 'This placeholder will become the customer-facing rules page explaining turn flow, resources, card types, and victory.'
  },
  '#/cards': {
    eyebrow: 'Card Gallery',
    title: 'Field Archive',
    body: 'This gallery placeholder will be replaced by the illustrated card reference used across the site and in play.'
  }
};

const rulesSections = [
  {
    heading: 'Match Goal',
    body: 'Each duelist starts with 20 health. Reduce the rival to 0 health before they do the same to you.'
  },
  {
    heading: 'Turn Flow',
    body: 'Start of turn: gain 1 ember, draw 1 card, then play cards before sending your field into combat.'
  },
  {
    heading: 'Card Types',
    body: 'Creatures stay on the field to attack each turn, while spells resolve once and head straight to the discard pile.'
  }
] as const;

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
        {route === '#/rules' ? (
          <div class="rules-stack">
            <p>{currentPage.body}</p>
            {rulesSections.map((section) => (
              <section class="rules-card" key={section.heading}>
                <h3>{section.heading}</h3>
                <p>{section.body}</p>
              </section>
            ))}
          </div>
        ) : (
          <p>{currentPage.body}</p>
        )}
      </main>
    </div>
  );
}
