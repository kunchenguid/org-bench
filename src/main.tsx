import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { getRouteByHash, routes, type RouteId } from './app/routes';
import './styles.css';

function App() {
  const [route, setRoute] = useState<RouteId>(() => getRouteByHash(window.location.hash).id);

  useEffect(() => {
    const syncRoute = () => {
      setRoute(getRouteByHash(window.location.hash).id);
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  return (
    <div class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Single-player campaign</p>
          <h1>Duel TCG</h1>
          <p class="hero-copy">
            A compact browser card battler with prebuilt decks, visible combat state, and a ladder of AI encounters.
          </p>
        </div>
        <nav class="nav" aria-label="Primary">
          {routes.map((item) => (
            <a class={item.id === route ? 'nav-link active' : 'nav-link'} href={item.hash}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main class="page">{renderPage(route)}</main>
    </div>
  );
}

function renderPage(route: RouteId) {
  switch (route) {
    case 'home':
      return <HomePage />;
    case 'play':
      return <PlayPage />;
    case 'rules':
      return <RulesPage />;
    case 'cards':
      return <CardsPage />;
  }
}

function HomePage() {
  return (
    <section class="panel stack-lg">
      <div class="stack-sm">
        <h2>Ready to climb the arena ladder</h2>
        <p>
          This scaffold ships the site structure now so the full campaign, card systems, and persistence can land in parallel.
        </p>
      </div>
      <div class="grid two-up">
        <article class="card-panel">
          <h3>Play</h3>
          <p>Battle AI opponents with a preconstructed deck and a visible turn flow.</p>
          <a class="button" href="#/play">
            Open the table
          </a>
        </article>
        <article class="card-panel">
          <h3>Learn</h3>
          <p>Read the rules and browse the card reference before the full encounter flow lands.</p>
          <div class="button-row">
            <a class="button secondary" href="#/rules">
              Rules
            </a>
            <a class="button secondary" href="#/cards">
              Card gallery
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}

function PlayPage() {
  return (
    <section class="panel stack-lg">
      <div class="stack-sm">
        <h2>Play</h2>
        <p>
          Encounter UI, duel state, and browser persistence land on this route. The shell is ready for workers to wire the game
          state and ladder flow into place.
        </p>
      </div>
      <div class="grid arena-preview">
        <section class="zone-panel">
          <h3>Enemy Side</h3>
          <p>Health, deck, hand intent, battlefield, and AI turn summary.</p>
        </section>
        <section class="zone-panel emphasis">
          <h3>Battlefield</h3>
          <p>Creature slots, combat results, and round prompts will render here.</p>
        </section>
        <section class="zone-panel">
          <h3>Player Side</h3>
          <p>Hand, resources, discard pile, draw pile, and action controls.</p>
        </section>
      </div>
    </section>
  );
}

function RulesPage() {
  return (
    <section class="panel stack-lg">
      <div class="stack-sm">
        <h2>Rules</h2>
        <p>
          Players and AI take alternating turns. Each turn grants resources to play creature and spell cards, then creatures attack
          automatically when legal.
        </p>
      </div>
      <div class="grid rules-grid">
        <article class="card-panel">
          <h3>Goal</h3>
          <p>Reduce the opposing hero to zero health before your own hero falls.</p>
        </article>
        <article class="card-panel">
          <h3>Turn Shape</h3>
          <p>Draw, gain resources, play cards from hand, resolve combat, then pass to the opponent.</p>
        </article>
        <article class="card-panel">
          <h3>Card Types</h3>
          <p>Creatures stay on the battlefield. Spells resolve once, then move to the discard pile.</p>
        </article>
        <article class="card-panel">
          <h3>Campaign</h3>
          <p>Clear a sequence of AI encounters with prebuilt decks and saved progress.</p>
        </article>
      </div>
    </section>
  );
}

function CardsPage() {
  return (
    <section class="panel stack-lg">
      <div class="stack-sm">
        <h2>Card Gallery</h2>
        <p>A compact two-faction card list will live here so players can inspect the full pool before dueling.</p>
      </div>
      <div class="grid three-up">
        <article class="card-panel">
          <p class="card-kicker">Creature</p>
          <h3>Placeholder Vanguard</h3>
          <p>Cost 2 - A frontline creature slot reserved for the initial card set.</p>
        </article>
        <article class="card-panel">
          <p class="card-kicker">Spell</p>
          <h3>Placeholder Volley</h3>
          <p>Cost 3 - A direct effect spell slot reserved for the initial card set.</p>
        </article>
        <article class="card-panel">
          <p class="card-kicker">Faction</p>
          <h3>Skyforge</h3>
          <p>One of the core themes planned for the first playable ladder.</p>
        </article>
      </div>
    </section>
  );
}

render(<App />, document.getElementById('app')!);
