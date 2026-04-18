import { useEffect, useState } from 'preact/hooks';

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
        <p>Prototype play page for the duel board and encounter flow.</p>
      </section>
    );
  }

  if (props.route === 'rules') {
    return (
      <section class="panel">
        <h1>Rules</h1>
        <p>Prototype rules page for turn flow, resources, and card types.</p>
      </section>
    );
  }

  if (props.route === 'cards') {
    return (
      <section class="panel">
        <h1>Cards</h1>
        <p>Prototype card gallery for the shared card pool and factions.</p>
      </section>
    );
  }

  return (
    <section class="hero panel">
      <p class="eyebrow">Single-player tactical card duels</p>
      <h1>Shards of the Veil</h1>
      <p>Prototype home page for the public-facing duel TCG site scaffold.</p>
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
