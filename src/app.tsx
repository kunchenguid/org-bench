type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routes: Record<RouteKey, { label: string; hash: string; heading: string; body: string }> = {
  home: {
    label: 'Home',
    hash: '#/',
    heading: 'Duel TCG',
    body: 'A single-player card dueling adventure is coming together here. Use the navigation to inspect the play surface, the rules, and the card reference.'
  },
  play: {
    label: 'Play',
    hash: '#/play',
    heading: 'Play',
    body: 'Encounter flow, the battlefield, and the playable duel UI will land on this shared surface next.'
  },
  rules: {
    label: 'Rules',
    hash: '#/rules',
    heading: 'Rules',
    body: 'This page will explain turn flow, resources, card types, and victory conditions in player-facing language.'
  },
  cards: {
    label: 'Cards',
    hash: '#/cards',
    heading: 'Cards',
    body: 'The card gallery and reference entries will be published here so players can learn each deck before a run.'
  }
};

function getRoute(hash: string): RouteKey {
  const normalized = hash || '#/';
  const match = (Object.entries(routes) as [RouteKey, (typeof routes)[RouteKey]][]).find(([, route]) => route.hash === normalized);
  return match?.[0] ?? 'home';
}

export function App() {
  const route = getRoute(globalThis.location?.hash ?? '#/');
  const current = routes[route];

  return (
    <div class="shell">
      <header class="hero">
        <p class="eyebrow">Static single-player card duel</p>
        <h1>{route === 'home' ? current.heading : 'Duel TCG'}</h1>
        <p class="lede">A polished scaffold for the benchmark site, wired for browser-only play and relative-path deployment.</p>
      </header>

      <nav aria-label="Primary" class="nav">
        {(Object.entries(routes) as [RouteKey, (typeof routes)[RouteKey]][]).map(([key, value]) => (
          <a class={key === route ? 'nav-link active' : 'nav-link'} href={value.hash} key={key}>
            {value.label}
          </a>
        ))}
      </nav>

      <main class="panel">
        <h2>{current.heading}</h2>
        <p>{current.body}</p>
      </main>
    </div>
  );
}
