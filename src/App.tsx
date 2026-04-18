import { useEffect, useState } from 'preact/hooks';
import {
  encounters,
  factions,
  keywordGlossary,
  starterDeck,
  uniqueCards
} from './content/gameData';

type Route = 'home' | 'play' | 'rules' | 'cards';

const routes: Record<string, Route> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards'
};

function getRoute(): Route {
  return routes[window.location.hash] ?? 'home';
}

function RouteLink(props: {
  href: string;
  children: string;
  onNavigate: (route: Route, href: string) => void;
}) {
  return (
    <a
      class="nav-link"
      href={props.href}
      onClick={(event) => {
        event.preventDefault();
        props.onNavigate(routes[props.href] ?? 'home', props.href);
      }}
    >
      {props.children}
    </a>
  );
}

function PageContent(props: { route: Route }) {
  if (props.route === 'play') {
    return (
      <section class="panel">
        <h1>Play</h1>
        <p>
          The board prototype will use the Solar Accord starter deck against a
          three-duel encounter ladder. The next round will replace this overview
          with the playable battlefield.
        </p>
        <p>
          Starter deck: {starterDeck.name} with {starterDeck.cards.length} cards.
          Ladder: {encounters.map((encounter) => encounter.name).join(', ')}.
        </p>
      </section>
    );
  }

  if (props.route === 'rules') {
    return (
      <section class="panel">
        <h1>Rules</h1>
        <p>
          Core keywords are already pinned down for the playable build:{' '}
          {keywordGlossary.map((entry) => entry.keyword).join(', ')}.
        </p>
        <p>
          Rules prototype for turn flow, resources, and card types. The public
          rules page will teach these mechanics in full next.
        </p>
      </section>
    );
  }

  if (props.route === 'cards') {
    return (
      <section class="panel">
        <h1>Cards</h1>
        <p>
          The shared card pool currently spans {uniqueCards.length} unique cards
          across {factions.map((faction) => faction.name).join(' and ')}.
        </p>
        <p>Prototype card gallery for the shared card pool and factions.</p>
      </section>
    );
  }

  return (
    <section class="hero panel">
      <p class="eyebrow">Single-player tactical card duels</p>
      <h1>Shards of the Veil</h1>
      <p>
        Prototype home page for the public-facing duel TCG site scaffold.
      </p>
      <p>
        Two factions, {uniqueCards.length} illustrated cards, and a three-step
        duel ladder are now defined in shared content data for the full site.
      </p>
    </section>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(getRoute());

  const navigate = (nextRoute: Route, href: string) => {
    window.history.pushState(null, '', href);
    setRoute(nextRoute);
  };

  useEffect(() => {
    if (!window.location.hash) {
      navigate('home', '#/');
    }

    const syncRoute = () => setRoute(getRoute());
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  return (
    <div class="app-shell">
      <header class="site-header">
        <a class="brand" href="#/">
          <span class="brand-mark">SV</span>
          <span>Shards of the Veil</span>
        </a>
        <nav class="site-nav" aria-label="Primary">
          <RouteLink href="#/" onNavigate={navigate}>Home</RouteLink>
          <RouteLink href="#/play" onNavigate={navigate}>Play</RouteLink>
          <RouteLink href="#/rules" onNavigate={navigate}>Rules</RouteLink>
          <RouteLink href="#/cards" onNavigate={navigate}>Cards</RouteLink>
        </nav>
      </header>
      <main class="site-main">
        <PageContent route={route} />
      </main>
    </div>
  );
}
