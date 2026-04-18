import { useEffect, useMemo, useState } from 'preact/hooks';
import { cardLibrary, type CardDefinition } from './cards';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

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

const normalizeHash = (hash: string) => (resolveRoute(hash) === 'home' && hash !== routes.home.hash ? routes.home.hash : hash || routes.home.hash);

const pageCopy: Record<RouteKey, { title: string; eyebrow: string; body: string }> = {
  home: {
    title: 'Duel of Embers',
    eyebrow: 'Single-player tactical card duels',
    body: 'A polished browser card battler is taking shape here. Use the nav to reach the play board, learn the rules, or browse the card gallery.',
  },
  play: {
    title: 'Play',
    eyebrow: 'Encounter board',
    body: 'The playable duel board will live on this route. This scaffold keeps navigation and layout stable for the upcoming game systems.',
  },
  rules: {
    title: 'How to Play',
    eyebrow: 'Rules reference',
    body: 'This placeholder will become the player-facing rules page covering turns, mana, card types, attacks, and victory conditions.',
  },
  cards: {
    title: 'Card Gallery',
    eyebrow: 'Faction archive',
    body: '12 illustrated cards across two factions, built to become the shared visual language for encounters, rules, and the playable board.',
  },
};

const factionMeta = {
  'Ember Covenant': {
    sigil: 'Ember sigil',
    crest: 'EC',
    className: 'ember',
    summary: 'A militant flame order built around tempo, direct damage, and decisive finishers.',
  },
  'Tidemark Circle': {
    sigil: 'Tide sigil',
    crest: 'TC',
    className: 'tide',
    summary: 'Moonlit sea mages who outlast opponents with flow, defense, and card advantage.',
  },
} as const;

function CardArt({ artSeed, faction }: { artSeed: CardDefinition['artSeed']; faction: CardDefinition['faction'] }) {
  const isEmber = faction === 'Ember Covenant';
  const palettes: Record<CardDefinition['artSeed'], { a: string; b: string; c: string }> = {
    flame: { a: '#ffb366', b: '#ff6847', c: '#62172c' },
    forge: { a: '#ffd878', b: '#db4d30', c: '#40151e' },
    phoenix: { a: '#ffe57b', b: '#ff6e4a', c: '#5b1535' },
    volcano: { a: '#ffb347', b: '#b92d2d', c: '#321018' },
    lantern: { a: '#ffe59b', b: '#ff9248', c: '#44203a' },
    ash: { a: '#f6c48d', b: '#c95a3d', c: '#47242f' },
    wave: { a: '#7ed7ff', b: '#4a8cff', c: '#0f2753' },
    moon: { a: '#d2e2ff', b: '#74bfff', c: '#1c3277' },
    shell: { a: '#b7f7ff', b: '#4ed0c4', c: '#14435f' },
    reef: { a: '#91f0d9', b: '#54a6ff', c: '#133857' },
    mist: { a: '#dff4ff', b: '#6cb9ff', c: '#324f7e' },
    current: { a: '#8ce0ff', b: '#2f81ff', c: '#0f245d' },
  };
  const palette = palettes[artSeed];

  return (
    <svg viewBox="0 0 240 160" className="card-art" role="img" aria-label={`${artSeed} illustration`}>
      <defs>
        <linearGradient id={`${artSeed}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color={palette.a} />
          <stop offset="55%" stop-color={palette.b} />
          <stop offset="100%" stop-color={palette.c} />
        </linearGradient>
      </defs>
      <rect width="240" height="160" rx="18" fill={`url(#${artSeed}-bg)`} />
      <circle cx="186" cy="38" r="24" fill="rgba(255,255,255,0.22)" />
      <path d={isEmber ? 'M50 132 C70 110, 95 78, 118 40 C122 64, 136 88, 170 132 Z' : 'M24 112 C64 88, 116 92, 154 68 C176 54, 190 44, 216 54 C208 96, 152 136, 74 136 Z'} fill="rgba(255,255,255,0.26)" />
      <path d={isEmber ? 'M118 16 C138 44, 130 66, 148 88 C133 86, 114 96, 104 118 C98 94, 82 78, 66 68 C86 62, 104 48, 118 16 Z' : 'M34 104 C72 62, 104 38, 154 34 C142 56, 152 84, 194 114 C128 132, 78 128, 34 104 Z'} fill="rgba(255,255,255,0.44)" />
      <circle cx={isEmber ? 78 : 150} cy={isEmber ? 46 : 56} r="16" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
}

function CardFace({ card }: { card: CardDefinition }) {
  const faction = factionMeta[card.faction];

  return (
    <article className={`card-face ${faction.className}`}>
      <div className="card-chrome">
        <div className="cost-pip" aria-label={`Cost ${card.cost}`}>
          {card.cost}
        </div>
        <div className="card-title-row">
          <div>
            <p className="card-faction">{card.faction}</p>
            <h3>{card.name}</h3>
          </div>
          <div className="faction-crest" aria-label={faction.sigil}>
            {faction.crest}
          </div>
        </div>
        <CardArt artSeed={card.artSeed} faction={card.faction} />
        <div className="type-line">
          <span>{card.type}</span>
          {card.stats ? <span>{card.stats.power}/{card.stats.health}</span> : <span>Spellcraft</span>}
        </div>
        <p className="rules-text">{card.rules}</p>
      </div>
    </article>
  );
}

function GalleryView() {
  const factions = ['Ember Covenant', 'Tidemark Circle'] as const;

  return (
    <section className="gallery-view">
      <div className="gallery-intro">
        <h2>Card Gallery</h2>
        <p>12 illustrated cards across two factions. This library is the source of truth for the duel board, rules examples, and encounter decks.</p>
      </div>
      {factions.map((factionName) => {
        const factionCards = cardLibrary.filter((card) => card.faction === factionName);
        const faction = factionMeta[factionName];

        return (
          <section key={factionName} className="faction-section">
            <div className="faction-header">
              <div className={`faction-badge ${faction.className}`}>{faction.crest}</div>
              <div>
                <h2>{factionName}</h2>
                <p>{faction.summary}</p>
              </div>
            </div>
            <div className="card-grid">
              {factionCards.map((card) => (
                <CardFace key={card.id} card={card} />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}

function RulesView() {
  return (
    <section className="rules-view">
      <div className="rules-intro">
        <h2>How to Play</h2>
        <p>Each turn gives you 1 more Ember until you reach 6. Spend that resource to deploy creatures and cast spells before sending your battlefield forward.</p>
      </div>

      <div className="rules-grid">
        <article className="rules-card">
          <h3>Turn Flow</h3>
          <p>Start of turn: ready your creatures, draw 1 card, and refill your Ember to the new limit.</p>
          <p>Main phase: play creature cards onto your battlefield row or cast spells from your hand.</p>
          <p>Attack phase: your ready creatures strike the enemy leader unless later rules add blockers or guards.</p>
        </article>

        <article className="rules-card">
          <h3>Card Types</h3>
          <p>Creatures stay on the battlefield and use their power and health values in combat.</p>
          <p>Spells resolve once for tempo swings, damage, card flow, or support effects, then go away.</p>
          <p>Use the gallery to learn each faction style before you start the campaign ladder.</p>
        </article>

        <article className="rules-card">
          <h3>Winning</h3>
          <p>Drop the opposing leader to 0 health to win the duel.</p>
          <p>Win the campaign by defeating all 4 encounters in order.</p>
          <p>If you reload mid-encounter, the browser save system should resume that run from the same battle state.</p>
        </article>
      </div>

      <div className="rules-grid">
        <article className="rules-card faction-callout ember-callout">
          <h3>Ember Covenant</h3>
          <p>Fast pressure, direct damage, and hard-closing finishers. Use them when you want to push tempo.</p>
        </article>
        <article className="rules-card faction-callout tide-callout">
          <h3>Tidemark Circle</h3>
          <p>Steady defense, card flow, and resilient late-game threats. Use them to outlast explosive starts.</p>
        </article>
      </div>
    </section>
  );
}

function DefaultView({ page }: { page: (typeof pageCopy)[RouteKey] }) {
  return (
    <section>
      <h2>{page.title}</h2>
      <p>{page.body}</p>
    </section>
  );
}

export function App() {
  const [hash, setHash] = useState(normalizeHash(window.location.hash || '#/'));

  useEffect(() => {
    const onHashChange = () => {
      const nextHash = normalizeHash(window.location.hash || '#/');
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
      setHash(nextHash);
    };

    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const route = useMemo(() => resolveRoute(hash), [hash]);
  const page = pageCopy[route];

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p className="body-copy">{page.body}</p>
        </div>
        <div className="hero-card" aria-hidden="true">
          <div className="hero-sigil">*</div>
          <div className="hero-ribbon">{route === 'cards' ? 'Archive Live' : 'Scaffold'}</div>
        </div>
      </header>
      <nav className="nav" aria-label="Primary">
        {(Object.entries(routes) as Array<[RouteKey, { hash: string; label: string }]>).map(([key, value]) => (
          <a
            key={key}
            className={route === key ? 'nav-link active' : 'nav-link'}
            href={value.hash}
            onClick={() => setHash(value.hash)}
          >
            {value.label}
          </a>
        ))}
      </nav>
      <main className="panel">
        {route === 'cards' ? <GalleryView /> : route === 'rules' ? <RulesView /> : <DefaultView page={page} />}
      </main>
    </div>
  );
}
