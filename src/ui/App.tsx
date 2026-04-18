import { useEffect, useMemo, useState } from 'preact/hooks';

type Route = 'home' | 'play' | 'rules' | 'cards';
type Faction = 'Ashfall Covenant' | 'Verdant Loom' | 'Gloam Syndicate';

type Card = {
  id: string;
  name: string;
  faction: Faction;
  typeLine: string;
  cost: number;
  power?: number;
  guard?: number;
  rules: string;
  accent: 'ember' | 'verdant' | 'gloam';
};

type NavItem = {
  route: Route;
  label: string;
};

const navItems: NavItem[] = [
  { route: 'home', label: 'Home' },
  { route: 'play', label: 'Play' },
  { route: 'rules', label: 'How to Play' },
  { route: 'cards', label: 'Card Gallery' },
];

const cardLibrary: Card[] = [
  {
    id: 'emberstrike-apprentice',
    name: 'Emberstrike Apprentice',
    faction: 'Ashfall Covenant',
    typeLine: 'Creature - Duelist',
    cost: 2,
    power: 3,
    guard: 1,
    rules: 'When Emberstrike Apprentice attacks alone, it gains +2 power this turn.',
    accent: 'ember',
  },
  {
    id: 'cinder-oath',
    name: 'Cinder Oath',
    faction: 'Ashfall Covenant',
    typeLine: 'Spell - Burst',
    cost: 3,
    rules: 'Deal 3 damage to a unit. If that unit leaves play this turn, draw a card.',
    accent: 'ember',
  },
  {
    id: 'canopy-warden',
    name: 'Canopy Warden',
    faction: 'Verdant Loom',
    typeLine: 'Creature - Sentinel',
    cost: 4,
    power: 2,
    guard: 5,
    rules: 'When Canopy Warden enters play, restore 2 health to your nexus.',
    accent: 'verdant',
  },
  {
    id: 'graft-of-spring',
    name: 'Graft of Spring',
    faction: 'Verdant Loom',
    typeLine: 'Spell - Growth',
    cost: 2,
    rules: 'Give a creature +1/+3. Draw a card if it already had guard.',
    accent: 'verdant',
  },
  {
    id: 'veilbroker',
    name: 'Veilbroker Adept',
    faction: 'Gloam Syndicate',
    typeLine: 'Creature - Rogue',
    cost: 3,
    power: 2,
    guard: 2,
    rules: 'When Veilbroker Adept deals combat damage, look at the top two cards of your deck and keep one.',
    accent: 'gloam',
  },
  {
    id: 'midnight-contract',
    name: 'Midnight Contract',
    faction: 'Gloam Syndicate',
    typeLine: 'Spell - Scheme',
    cost: 1,
    rules: 'Sacrifice 1 health to reduce the next card you play this turn by 2.',
    accent: 'gloam',
  },
];

const factionFilters: Array<Faction | 'All factions'> = [
  'All factions',
  'Ashfall Covenant',
  'Verdant Loom',
  'Gloam Syndicate',
];

const routeContent: Record<Route, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Auric Reach // Prologue',
    title: 'A duel game scaffold with room for craft.',
    body:
      'This initial shell establishes the shared visual language, navigation, and deployment-safe routing for the full single-player card game.',
  },
  play: {
    eyebrow: 'Play Surface',
    title: 'Encounter board placeholder',
    body:
      'This route will host the full match UI: battlefield, hands, decks, health, resources, encounters, AI flow, and persistence.',
  },
  rules: {
    eyebrow: 'Field Manual',
    title: 'Rules page placeholder',
    body:
      'This route will explain turn flow, resources, creatures, spells, combat, the encounter ladder, and save-and-resume behavior.',
  },
  cards: {
    eyebrow: 'Vault Archive',
    title: 'Card Gallery',
    body:
      'Browse the current card roster by faction and inspect full rules text without leaving the gallery surface.',
  },
};

function getRouteFromHash(hash: string): Route {
  const key = hash.replace(/^#\/?/, '');
  if (key === 'play' || key === 'rules' || key === 'cards') {
    return key;
  }

  return 'home';
}

function setHash(route: Route) {
  window.location.hash = route === 'home' ? '#/' : `#/${route}`;
}

function HeroCard(props: { title: string; subtitle: string; accent: string }) {
  return (
    <article className={`hero-card hero-card-${props.accent}`}>
      <div className="hero-card-art" aria-hidden="true">
        <div className="sigil sigil-outer" />
        <div className="sigil sigil-inner" />
      </div>
      <p>{props.subtitle}</p>
      <h3>{props.title}</h3>
    </article>
  );
}

function CardGallery() {
  const [activeFaction, setActiveFaction] = useState<Faction | 'All factions'>('All factions');
  const visibleCards = useMemo(
    () =>
      activeFaction === 'All factions'
        ? cardLibrary
        : cardLibrary.filter((card) => card.faction === activeFaction),
    [activeFaction],
  );
  const [activeCardId, setActiveCardId] = useState(cardLibrary[0]?.id ?? '');

  useEffect(() => {
    if (!visibleCards.some((card) => card.id === activeCardId) && visibleCards[0]) {
      setActiveCardId(visibleCards[0].id);
    }
  }, [activeCardId, visibleCards]);

  const activeCard = visibleCards.find((card) => card.id === activeCardId) ?? visibleCards[0];

  return (
    <div className="card-gallery">
      <div className="gallery-toolbar" role="toolbar" aria-label="Faction filters">
        {factionFilters.map((faction) => (
          <button
            key={faction}
            type="button"
            className={faction === activeFaction ? 'is-active' : ''}
            onClick={() => setActiveFaction(faction)}
          >
            {faction}
          </button>
        ))}
      </div>

      <div className="gallery-layout">
        <div className="card-grid" role="list" aria-label="Card gallery grid">
          {visibleCards.map((card) => {
            const isActive = card.id === activeCard?.id;

            return (
              <article
                key={card.id}
                className={`gallery-card gallery-card-${card.accent}${isActive ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveCardId(card.id)}
              >
                <div className="gallery-card-frame">
                  <div className="gallery-card-head">
                    <span>{card.faction}</span>
                    <strong>{card.cost}</strong>
                  </div>
                  <div className="gallery-card-art" aria-hidden="true">
                    <div className="sigil sigil-outer" />
                    <div className="sigil sigil-inner" />
                  </div>
                  <div className="gallery-card-copy">
                    <p>{card.typeLine}</p>
                    <h3>{card.name}</h3>
                    <dl className="gallery-card-stats">
                      <div>
                        <dt>Cost</dt>
                        <dd>{card.cost}</dd>
                      </div>
                      <div>
                        <dt>Power</dt>
                        <dd>{card.power ?? '-'}</dd>
                      </div>
                      <div>
                        <dt>Guard</dt>
                        <dd>{card.guard ?? '-'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <button
                  type="button"
                  className="gallery-card-reveal"
                  aria-pressed={isActive}
                  aria-label={`Reveal ${card.name} rules`}
                  onClick={() => setActiveCardId(card.id)}
                >
                  {isActive ? 'Rules showing' : 'Reveal rules'}
                </button>
              </article>
            );
          })}
        </div>

        {activeCard ? (
          <aside className={`rules-panel rules-panel-${activeCard.accent}`} aria-live="polite">
            <p className="eyebrow">Selected card</p>
            <h3>{activeCard.name}</h3>
            <p className="rules-meta">{activeCard.faction} - {activeCard.typeLine}</p>
            <p>{activeCard.rules}</p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function PageSection(props: { route: Route }) {
  const content = routeContent[props.route];

  return (
    <section className="page-panel">
      <p className="eyebrow">{content.eyebrow}</p>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      {props.route === 'cards' ? <CardGallery /> : null}
      {props.route === 'home' ? (
        <div className="hero-grid">
          <HeroCard title="Ashfall Covenant" subtitle="Aggressive ember faction" accent="ember" />
          <HeroCard title="Verdant Loom" subtitle="Growth and resilience" accent="verdant" />
          <HeroCard title="Three duel ascent" subtitle="A compact encounter ladder" accent="dusk" />
        </div>
      ) : null}
    </section>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const activeItem = useMemo(
    () => navItems.find((item) => item.route === route) ?? navItems[0],
    [route],
  );

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/" onClick={() => setHash('home')}>
          <span className="brand-mark" aria-hidden="true">
            <>✦</>
          </span>
          <span>
            <strong>Duel TCG</strong>
            <small>Auric Reach</small>
          </span>
        </a>
        <nav className="nav" aria-label="Primary">
          {navItems.map((item) => (
            <a
              key={item.route}
              className={item.route === route ? 'is-active' : ''}
              href={item.route === 'home' ? '#/' : `#/${item.route}`}
              onClick={() => setHash(item.route)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="layout">
        <section className="hero-banner">
          <div>
            <p className="eyebrow">Single-player duel TCG</p>
            <h1>Scaffold in place for the full browser campaign.</h1>
            <p>
              The shared shell is live with the four required surfaces and safe nested-path asset
              handling. Workers can now build mechanics and visuals on top of this frame.
            </p>
          </div>
          <aside className="status-card" aria-label="Current route">
            <span className="status-label">Now viewing</span>
            <strong>{activeItem.label}</strong>
            <span className="status-rule">Round 1 shared baseline</span>
          </aside>
        </section>

        <PageSection route={route} />
      </main>
    </div>
  );
}
