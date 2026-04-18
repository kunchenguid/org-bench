import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';
type Faction = 'solari' | 'umbra' | 'verdant';

type CardSpec = {
  name: string;
  faction: Faction;
  cost: number;
  type: string;
  text: string;
  power?: string;
};

const routes: Record<RouteKey, { hash: string; label: string }> = {
  home: { hash: '#/', label: 'Home' },
  play: { hash: '#/play', label: 'Play' },
  rules: { hash: '#/rules', label: 'Rules' },
  cards: { hash: '#/cards', label: 'Cards' },
};

const resolveRoute = (hash: string): RouteKey => {
  const match = (Object.entries(routes) as Array<[RouteKey, { hash: string }]>).find(([, route]) => route.hash === hash);
  return match?.[0] ?? 'home';
};

const pageCopy: Record<RouteKey, { title: string; eyebrow: string; body: string }> = {
  home: {
    title: 'Duel of Embers',
    eyebrow: 'Single-player tactical card duels',
    body: 'Lead the Ashfall Houses against the Tidebound Conclave in a browser-first tactical duel where every lane matters.',
  },
  play: {
    title: 'Play',
    eyebrow: 'Encounter board',
    body: 'The playable duel board now has a stable shell for turn status, battlefield lanes, and player resources.',
  },
  rules: {
    title: 'How to Play',
    eyebrow: 'Rules reference',
    body: 'Learn the round structure, resources, card types, and victory conditions before stepping into the arena.',
  },
  cards: {
    title: 'Card Gallery',
    eyebrow: 'Faction archive',
    body: 'Preview the faction language and card frame treatment that the duel board uses in play.',
  },
};

const boardState = {
  turn: 'Turn 6 - Player attack',
  enemy: { name: 'North commander', health: 12, aether: '5/7', deck: 11, discard: 6 },
  player: { name: 'South commander', health: 18, aether: '6/8', deck: 18, discard: 4 },
};

const enemyBoard: CardSpec[] = [
  { name: 'Nightglass Hexer', faction: 'umbra', cost: 4, type: 'Caster', text: 'Veil the front line and punish exposed relics.', power: '4/5' },
  { name: 'Ashcoil Drake', faction: 'solari', cost: 6, type: 'Beast', text: 'Dive over blockers to pressure the resource lane.', power: '6/4' },
];

const playerBoard: CardSpec[] = [
  { name: 'Ember Archivist', faction: 'solari', cost: 3, type: 'Scholar', text: 'Archive sparks to convert spent cards into next-turn tempo.', power: '2/4' },
  { name: 'Rootline Warden', faction: 'verdant', cost: 5, type: 'Guardian', text: 'Anchor the lane and grant cover to the backline hand engine.', power: '5/7' },
];

const playerHand: CardSpec[] = [
  { name: 'Sunforge Volley', faction: 'solari', cost: 2, type: 'Spell', text: 'Deal 2 to a unit. If empowered, ready a relic.' },
  { name: 'Gloam Pact', faction: 'umbra', cost: 1, type: 'Spell', text: 'Trade 2 life for a fresh card and a shadow sigil.' },
  { name: 'Canopy Relay', faction: 'verdant', cost: 4, type: 'Relic', text: 'Store 1 aether each round, then burst it into summons.' },
];

const galleryCards: CardSpec[] = [playerBoard[0], enemyBoard[0], playerHand[2]];

const factionLabels: Record<Faction, string> = {
  solari: 'Solari',
  umbra: 'Umbra',
  verdant: 'Verdant',
};

function CardFrame({ card, compact = false }: { card: CardSpec; compact?: boolean }) {
  return (
    <article className={`card-frame faction-${card.faction}${compact ? ' compact' : ''}`}>
      <div className="card-frame-top">
        <span className="card-chip">{factionLabels[card.faction]}</span>
        <span className="card-cost">{card.cost}</span>
      </div>
      <div className="card-art" aria-hidden="true">
        <span>{card.type}</span>
      </div>
      <div className="card-copy">
        <h3>{card.name}</h3>
        <p>{card.text}</p>
      </div>
      {card.power ? <div className="card-power">{card.power}</div> : null}
    </article>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-pill">
      <strong>{`${label} ${value}`}</strong>
    </div>
  );
}

function HomePage() {
  return (
    <section className="stack-lg">
      <div className="cta-row">
        <a className="button button-primary" href="#/play">Enter the Arena</a>
        <a className="button button-secondary" href="#/rules">Gameplay Guide</a>
        <a className="button button-ghost" href="#/cards">Meet the Factions</a>
      </div>
      <div className="feature-grid">
        <article className="feature-card feature-card-accent">
          <p className="feature-label">Featured encounter</p>
          <h2>Featured encounter: The Glass Harbor Breach</h2>
          <p>Storm-lit relic barges crash into the harbor walls while both sides race to seize the final ember channel.</p>
        </article>
        <article className="feature-card">
          <p className="feature-label">Board promise</p>
          <p>Readable lanes, illustrated cards, and stable route scaffolding so mechanics can land without rewriting the page shell.</p>
        </article>
      </div>
      <div className="faction-grid">
        <article className="faction-card">
          <p className="feature-label">Faction spotlight</p>
          <h2>Ashfall Houses</h2>
          <p>Pressure-first nobles and forgebound champions that turn tempo into explosive lane swings.</p>
        </article>
        <article className="faction-card">
          <p className="feature-label">Faction spotlight</p>
          <h2>Tidebound Conclave</h2>
          <p>Adaptive mages and harbor tacticians that outlast open attacks with layered spell pressure.</p>
        </article>
      </div>
    </section>
  );
}

function PlayBoard() {
  return (
    <section className="play-layout" aria-label="Play board">
      <div className="board-banner">
        <p className="eyebrow">Live duel shell</p>
        <div className="board-banner-row">
          <h2>Battlefield overview</h2>
          <span className="turn-pill">{boardState.turn}</span>
        </div>
        <p className="board-copy">Shared visual primitives for lanes, card frames, and player HUD. Game state can plug into these surfaces without changing route structure.</p>
      </div>
      <div className="hud-grid">
        <section className="hud-card" aria-label="Opponent status">
          <p className="eyebrow">North commander</p>
          <h3>{boardState.enemy.name}</h3>
          <div className="stat-grid">
            <StatPill label="Health" value={boardState.enemy.health} />
            <StatPill label="Aether" value={boardState.enemy.aether} />
            <StatPill label="Deck" value={boardState.enemy.deck} />
            <StatPill label="Discard" value={boardState.enemy.discard} />
          </div>
        </section>
        <section className="hud-card" aria-label="Player status">
          <p className="eyebrow">South commander</p>
          <h3>{boardState.player.name}</h3>
          <div className="stat-grid">
            <StatPill label="Health" value={boardState.player.health} />
            <StatPill label="Aether" value={boardState.player.aether} />
            <StatPill label="Deck" value={boardState.player.deck} />
            <StatPill label="Discard" value={boardState.player.discard} />
          </div>
        </section>
      </div>
      <section className="zone-card" aria-label="North battlefield">
        <div className="zone-header">
          <div>
            <p className="eyebrow">Enemy lane</p>
            <h3>North battlefield</h3>
          </div>
          <span className="zone-tag">Pressure front</span>
        </div>
        <div className="zone-row">
          {enemyBoard.map((card) => (
            <CardFrame key={card.name} card={card} />
          ))}
        </div>
      </section>
      <section className="resource-strip" aria-label="Shared duel zones">
        <div className="resource-card">
          <span>Deck: {boardState.player.deck}</span>
          <strong>Player draw stack</strong>
        </div>
        <div className="resource-card emphasis">
          <span>Player attack window</span>
          <strong>Turn indicator</strong>
        </div>
        <div className="resource-card">
          <span>Discard: {boardState.player.discard}</span>
          <strong>Spent card zone</strong>
        </div>
      </section>
      <section className="zone-card" aria-label="South battlefield">
        <div className="zone-header">
          <div>
            <p className="eyebrow">Player lane</p>
            <h3>South battlefield</h3>
          </div>
          <span className="zone-tag">Stabilize board</span>
        </div>
        <div className="zone-row">
          {playerBoard.map((card) => (
            <CardFrame key={card.name} card={card} />
          ))}
        </div>
      </section>
      <section className="zone-card" aria-label="Player hand">
        <div className="zone-header">
          <div>
            <p className="eyebrow">Decision space</p>
            <h3>Player hand</h3>
          </div>
          <span className="zone-tag">3 cards ready</span>
        </div>
        <div className="hand-row">
          {playerHand.map((card) => (
            <CardFrame key={card.name} card={card} compact />
          ))}
        </div>
      </section>
    </section>
  );
}

function RulesPage() {
  return (
    <section className="rules-grid">
      <article className="feature-card"><h2>Turn flow</h2><p>Start, draw, deploy, clash, end.</p></article>
      <article className="feature-card"><h2>Resources</h2><p>You gain 1 ember at the start of every turn, then spend it to deploy units, relics, and tactics.</p></article>
      <article className="feature-card"><h2>Card types</h2><p>Champions hold lanes, tactics resolve once, relics stay in play.</p></article>
      <article className="feature-card"><h2>Combat</h2><p>Unblocked attackers strike the opposing vanguard after lane defenders trade damage.</p></article>
      <article className="feature-card"><h2>Victory</h2><p>Reduce the enemy vanguard from 20 resolve to 0.</p></article>
    </section>
  );
}

function CardsPage() {
  return (
    <section className="stack-lg">
      <div className="board-banner">
        <p className="feature-label">Faction archive</p>
        <h2>Card Gallery</h2>
        <p>Shared card rendering primitives with faction styling for Solari, Umbra, and Verdant decks.</p>
      </div>
      <div className="hand-row">
        {galleryCards.map((card) => (
          <CardFrame key={card.name} card={card} compact />
        ))}
      </div>
    </section>
  );
}

function renderPageContent(route: RouteKey): JSX.Element {
  if (route === 'home') return <HomePage />;
  if (route === 'play') return <PlayBoard />;
  if (route === 'rules') return <RulesPage />;
  return <CardsPage />;
}

export function App() {
  const [hash, setHash] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const route = useMemo(() => resolveRoute(hash), [hash]);
  const page = pageCopy[route];

  const navigateTo = (nextHash: string) => {
    window.location.hash = nextHash;
    setHash(nextHash);
  };

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p className="body-copy">{page.body}</p>
        </div>
        <div className="hero-card" aria-hidden="true">
          <div className="hero-sigil">DE</div>
          <div className="hero-ribbon">Scaffold</div>
        </div>
      </header>
      <nav className="nav" aria-label="Primary">
        {(Object.entries(routes) as Array<[RouteKey, { hash: string; label: string }]>).map(([key, value]) => (
          <a key={key} className={route === key ? 'nav-link active' : 'nav-link'} aria-current={route === key ? 'page' : undefined} href={value.hash} onClick={() => navigateTo(value.hash)}>
            {value.label}
          </a>
        ))}
      </nav>
      <main className={`panel ${route === 'play' ? 'panel-play' : ''}`}>{renderPageContent(route)}</main>
    </div>
  );
}
