import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

type Route = 'home' | 'play' | 'rules' | 'cards';

const routeMap: Record<string, Route> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards',
};

function getRoute(): Route {
  return routeMap[window.location.hash] ?? 'home';
}

export function App() {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRoute());
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="shell">
      <header className="site-header">
        <RouteLink className="brand" href="#/" route="home" onNavigate={setRoute}>
          Duel Academy
        </RouteLink>
        <nav aria-label="Primary">
          <RouteLink href="#/play" route="play" onNavigate={setRoute}>
            Play
          </RouteLink>
          <RouteLink href="#/rules" route="rules" onNavigate={setRoute}>
            Rules
          </RouteLink>
          <RouteLink href="#/cards" route="cards" onNavigate={setRoute}>
            Cards
          </RouteLink>
        </nav>
      </header>
      <main className="page">{renderRoute(route)}</main>
    </div>
  );
}

function renderRoute(route: Route) {
  switch (route) {
    case 'play':
      return <PlayPage />;
    case 'rules':
      return <RulesPage />;
    case 'cards':
      return <CardsPage />;
    case 'home':
    default:
      return <HomePage />;
  }
}

function HomePage() {
  return (
    <section className="hero">
      <p className="eyebrow">Single-player duel card game</p>
      <h1>Duel Academy</h1>
      <p>
        Train with a starter deck, learn the rules, and prepare for a browser-based
        campaign ladder.
      </p>
      <div className="hero-actions">
        <a className="button primary" href="#/play">
          Start Playing
        </a>
        <a className="button" href="#/rules">
          Learn the Rules
        </a>
      </div>
    </section>
  );
}

type RouteLinkProps = {
  children: ComponentChildren;
  className?: string;
  href: string;
  route: Route;
  onNavigate: (route: Route) => void;
};

function RouteLink({ children, className, href, route, onNavigate }: RouteLinkProps) {
  return (
    <a className={className} href={href} onClick={() => onNavigate(route)}>
      {children}
    </a>
  );
}

function PlayPage() {
  return (
    <section>
      <p className="eyebrow">Play</p>
      <h1>Play Duel</h1>
      <p>
        Encounter flow, AI turns, decks, battlefield zones, and persistence will land
        on top of this scaffold.
      </p>
    </section>
  );
}

function RulesPage() {
  return (
    <section>
      <p className="eyebrow">Rules</p>
      <h1>How to Play</h1>
      <p>
        This page will teach the turn flow, resources, card types, and victory
        conditions.
      </p>
    </section>
  );
}

function CardsPage() {
  return (
    <section>
      <p className="eyebrow">Reference</p>
      <h1>Card Gallery</h1>
      <p>
        Card entries and faction reference content will be added onto this shared
        shell.
      </p>
    </section>
  );
}
