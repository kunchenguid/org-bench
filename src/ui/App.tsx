import { useEffect, useState } from 'preact/hooks';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routeMap: Record<string, RouteKey> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards',
};

const encounterSteps = ['Play first card', 'Commit attack lane', 'Bank shield charge'];

const rivalReads = [
  {
    label: 'Opening gambit',
    detail: 'Rogue AI floods the left lane first to force an early shield spend.',
  },
  {
    label: 'Counter window',
    detail: 'Punish the turn after it banks energy instead of pressing damage.',
  },
  {
    label: 'Weak side',
    detail: 'Its right lane stays under-defended until the second combat cycle.',
  },
];

const routeCopy: Record<RouteKey, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Prototype map',
    title: 'Division A playtest scaffold',
    body: 'Shared shell for home, play, rules, and cards so both divisions can branch from one stable Vite + Preact baseline.',
  },
  play: {
    eyebrow: 'Encounter ladder',
    title: 'Combat loop placeholder',
    body: 'This contested surface will become the final duel board. For now it exposes the primary pillars and a stable mount point.',
  },
  rules: {
    eyebrow: 'Rules reference',
    title: 'Learning surface placeholder',
    body: 'Use the linked rules document as the interim teaching page while the full integrated rules experience is built.',
  },
  cards: {
    eyebrow: 'Card archive',
    title: 'Gallery placeholder',
    body: 'The final card wall will live here with faction frames, art treatments, and full rules text.',
  },
};

function getRoute(): RouteKey {
  if (typeof window === 'undefined') {
    return 'home';
  }

  return routeMap[window.location.hash] ?? 'home';
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const copy = routeCopy[route];

  return (
    <div class="app-shell">
      <header class="hero">
        <p class="eyebrow">Signal Clash</p>
        <h1>Signal Clash</h1>
        <p class="hero-copy">
          A browser-first duel TCG scaffold with AI rival reads, nested-path-safe assets, and page slots ready for both divisions.
        </p>
        <nav aria-label="Primary">
          <a href="#/">Home</a>
          <a href="#/play">Play</a>
          <a href="#/rules">Rules</a>
          <a href="#/cards">Cards</a>
        </nav>
      </header>

      <main class="layout">
        <section class="panel panel-primary">
          <p class="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </section>

        <section class="panel">
          <h2>Division A playtest</h2>
          <p>Initial combat-forward board beats that downstream branches can replace without reworking the app shell.</p>
          <ul>
            {encounterSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        <section class="panel">
          <h2>Encounter ladder</h2>
          <p>Starter duel against the Rogue AI, followed by harder rematches once card content and encounter logic land.</p>
        </section>

        <section class="panel">
          <h2>AI rival reads</h2>
          <p>Rogue AI</p>
          <ul>
            {rivalReads.map((read) => (
              <li key={read.label}>
                <strong>{read.label}</strong>: {read.detail}
              </li>
            ))}
          </ul>
        </section>

        <section class="panel panel-links">
          <a href="./rules.html">Open standalone rules page</a>
        </section>
      </main>
    </div>
  );
}
