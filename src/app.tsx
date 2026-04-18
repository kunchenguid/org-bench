type RouteKey = 'home' | 'play' | 'rules' | 'cards';

type Route = {
  key: RouteKey;
  title: string;
  href: string;
  eyebrow: string;
  heading: string;
  body: string;
};

const routes: Route[] = [
  {
    key: 'home',
    title: 'Home',
    href: '#/',
    eyebrow: 'Welcome',
    heading: 'Duel TCG',
    body: 'Single-player browser card duels are coming together here. Start from the home page, then head into Play, Rules, or Cards.',
  },
  {
    key: 'play',
    title: 'Play',
    href: '#/play',
    eyebrow: 'Play',
    heading: 'Encounter Table',
    body: 'The playable duel screen will live here, with encounter setup, battle zones, and turn controls.',
  },
  {
    key: 'rules',
    title: 'Rules',
    href: '#/rules',
    eyebrow: 'Rules',
    heading: 'How to Play',
    body: 'This rules page will explain turn flow, mana, creatures, spells, and how to win a duel.',
  },
  {
    key: 'cards',
    title: 'Cards',
    href: '#/cards',
    eyebrow: 'Cards',
    heading: 'Card Gallery',
    body: 'The full card reference and deck lists will be published here for players to browse before a match.',
  },
];

function getRouteFromHash(hash: string): Route {
  const normalized = hash.replace(/^#/, '') || '/';
  const match = routes.find((route) => route.href.replace(/^#/, '') === normalized);
  return match ?? routes[0];
}

export function App() {
  const route = getRouteFromHash(window.location.hash);

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Static Duel TCG</p>
        <h1>Duel TCG</h1>
        <p className="lede">
          A polished single-player card game site, built to run entirely in the browser.
        </p>
      </header>

      <nav aria-label="Primary" className="nav">
        {routes.map((item) => (
          <a
            className={item.key === route.key ? 'nav-link active' : 'nav-link'}
            href={item.href}
            key={item.key}
          >
            {item.title}
          </a>
        ))}
      </nav>

      <main className="panel">
        <p className="eyebrow">{route.eyebrow}</p>
        <h2>{route.heading}</h2>
        <p>{route.body}</p>
      </main>
    </div>
  );
}
