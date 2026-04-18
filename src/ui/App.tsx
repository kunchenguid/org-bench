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

const frontlineCards = [
  {
    name: 'Static Broker',
    role: 'Unit - Opener',
    text: 'Preconstructed deck opener that converts early energy into a safe first lane.',
  },
  {
    name: 'Glasswall Sentry',
    role: 'Unit - Defender',
    text: 'Defender body that buys a full turn against the Rogue AI burst line.',
  },
  {
    name: 'Backline Surge',
    role: 'Signal - Finisher',
    text: 'Signal finisher that flips stored shield charge into a clean lethal push.',
  },
];

const routeCopy: Record<RouteKey, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Prototype map',
    title: 'Division A playtest scaffold',
    body: 'Shared shell for home, play, rules, and cards so both divisions can branch from one stable Vite + Preact baseline.',
  },
  play: {
    eyebrow: 'Division B vision',
    title: 'Division B tactical board',
    body: 'Lead with readability: show the pilot plan, the frontline cards that matter this turn, and the combat readout the moment pressure shifts.',
  },
  rules: {
    eyebrow: 'Rules reference',
    title: 'Learning surface placeholder',
    body: 'Use the linked rules document as the interim teaching page while the full integrated rules experience is built.',
  },
  cards: {
    eyebrow: 'Card archive',
    title: 'Starter card archive',
    body: 'Use the opening roster to learn each lane role fast: opener, defender, and finisher.',
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
  const isCardsRoute = route === 'cards';
  const isPlayRoute = route === 'play';

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

        {isPlayRoute ? (
          <>
            <section class="panel battle-status">
              <h2>Turn 1 - Your move</h2>
              <p>Rogue AI pressure: left lane overloaded</p>
              <p>Commit Glasswall Sentry left, then swing Static Broker into the open right lane.</p>
            </section>

            <section class="panel battle-board">
              <div>
                <h2>Enemy board</h2>
                <div class="zone-grid">
                  <article class="card-tile">
                    <p class="eyebrow">Left lane</p>
                    <h3>Scrap Harrier</h3>
                    <p>2 attack pressure unit forcing the early shield question.</p>
                  </article>
                  <article class="card-tile">
                    <p class="eyebrow">Right lane</p>
                    <h3>Signal Snare</h3>
                    <p>Banked punish effect if you overcommit before scouting the weak side.</p>
                  </article>
                </div>
              </div>

              <div>
                <h2>Player board</h2>
                <div class="zone-grid">
                  <article class="card-tile">
                    <p class="eyebrow">Left lane</p>
                    <h3>Glasswall Sentry</h3>
                    <p>Defender that catches the overloaded lane and buys your pivot turn.</p>
                  </article>
                  <article class="card-tile">
                    <p class="eyebrow">Right lane</p>
                    <h3>Static Broker</h3>
                    <p>Tempo opener ready to convert the safe lane into first damage.</p>
                  </article>
                </div>
              </div>
            </section>
          </>
        ) : null}

        <section class="panel">
          <h2>{isCardsRoute ? 'Starter card archive' : 'Division B tactical board'}</h2>
          <p>
            {isCardsRoute
              ? 'Each starter card calls out its exact battlefield job so players can map the preconstructed deck before their first turn.'
              : 'Division A playtest scaffold retained the shell. DivB turns it into a readable board where new players can see the sequence before they commit.'}
          </p>
          <ul>
            {encounterSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        <section class="panel">
          <h2>{isCardsRoute ? 'Deck roles' : 'Pilot brief'}</h2>
          <p>
            {isCardsRoute
              ? 'Preconstructed deck mapping keeps the first skim simple: opener for tempo, defender for stabilization, finisher for the close.'
              : 'Preconstructed deck: Midrange Voltage. Encounter ladder starts with the Rogue AI and teaches one clean attack pattern before adding harder reads.'}
          </p>
          <p>
            {isCardsRoute
              ? 'Read the card archive left to right and you get the whole first-game plan without opening the standalone rules page.'
              : 'Plan your first cycle around a single defended lane, then pivot once the AI spends its banked response.'}
          </p>
        </section>

        <section class="panel">
          <h2>{isCardsRoute ? 'Starter card notes' : 'Combat readout'}</h2>
          <p>{isCardsRoute ? 'Reference text' : 'AI rival reads - Rogue AI'}</p>
          <ul>
            {rivalReads.map((read) => (
              <li key={read.label}>
                <strong>{read.label}</strong>: {read.detail}
              </li>
            ))}
          </ul>
        </section>

        <section class="panel">
          <h2>Frontline cards</h2>
          <ul>
            {frontlineCards.map((card) => (
              <li key={card.name}>
                <strong>{card.name}</strong>: {card.role}. {card.text}
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
