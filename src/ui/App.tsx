import { useEffect, useMemo, useState } from 'preact/hooks';
import { cards, decks, encounterLadder, keywordGlossary } from '../game-data';
import {
  createCardGalleryPreferences,
  filterCardsByFaction,
  type CardGalleryFactionFilter,
} from './card-gallery-preferences';

type Route = 'home' | 'play' | 'rules' | 'cards';

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

const routeContent: Record<Route, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Auric Reach // Prologue',
    title: 'A compact duel campaign with two sharp faction identities.',
    body:
      'The run now has a complete paper design slice: twelve unique cards, two twenty-card decks, and a three-step encounter ladder with variant bosses.',
  },
  play: {
    eyebrow: 'Play Surface',
    title: 'Starter decks and ladder pacing',
    body:
      'These preconstructed lists are tuned for short solo runs: ember pushes tempo, verdant stretches the game, and each encounter step exaggerates one axis.',
  },
  rules: {
    eyebrow: 'Field Manual',
    title: 'Four evergreen keywords, three encounter beats',
    body:
      'The set stays intentionally lean so a player can internalize the whole card pool quickly and still see meaningful matchup texture across the ladder.',
  },
  cards: {
    eyebrow: 'Vault Archive',
    title: 'Twelve-card launch set',
    body:
      'The card file is split evenly across the two factions, with mirrored deck sizes and just enough texture for replayable matchups.',
  },
};

const RUN_NAMESPACE = 'run:apple-seed-01';

const factionFilters: CardGalleryFactionFilter[] = ['all', 'Ashfall Covenant', 'Verdant Loom'];

function DeckPreview() {
  return (
    <div className="info-grid">
      {decks.map((deck) => {
        const size = deck.list.reduce((total, entry) => total + entry.count, 0);

        return (
          <article className="info-card" key={deck.id}>
            <p className="eyebrow">{deck.faction}</p>
            <h3>{deck.name}</h3>
            <p>{deck.style}</p>
            <span className="pill">{size} cards</span>
          </article>
        );
      })}
    </div>
  );
}

function RulesReference() {
  return (
    <div className="stack-blocks">
      <section className="info-grid">
        {keywordGlossary.map((entry) => (
          <article className="info-card" key={entry.keyword}>
            <p className="eyebrow">Keyword</p>
            <h3>{entry.keyword}</h3>
            <p>{entry.reminder}</p>
          </article>
        ))}
      </section>

      <section className="stack-blocks">
        {encounterLadder.map((step) => (
          <article className="ladder-step" key={step.step}>
            <div>
              <p className="eyebrow">Step {step.step}</p>
              <h3>{step.title}</h3>
              <p>{step.purpose}</p>
            </div>
            <div className="variant-list">
              {step.variants.map((variant) => (
                <article className="variant-card" key={variant.id}>
                  <strong>{variant.name}</strong>
                  <p>{variant.twist}</p>
                  <span className="pill">{variant.reward}</span>
                </article>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function CardGallery(props: {
  selectedFaction: CardGalleryFactionFilter;
  onSelectFaction: (faction: CardGalleryFactionFilter) => void;
}) {
  const visibleCards = filterCardsByFaction(cards, props.selectedFaction);

  return (
    <div className="stack-blocks">
      <div className="filter-row" aria-label="Faction filter">
        {factionFilters.map((faction) => (
          <button
            key={faction}
            type="button"
            className={props.selectedFaction === faction ? 'pill is-active' : 'pill'}
            onClick={() => props.onSelectFaction(faction)}
          >
            {faction === 'all' ? 'All Factions' : faction}
          </button>
        ))}
      </div>
      <div className="card-grid">
        {visibleCards.map((card) => (
          <article className="game-card" key={card.id}>
            <div className="game-card-topline">
              <span className="pill">{card.faction}</span>
              <span className="cost-badge">{card.cost}</span>
            </div>
            <h3>{card.name}</h3>
            <p className="card-type">{card.type}</p>
            <p>{card.text}</p>
            <div className="game-card-footer">
              <span>{card.keywords.join(' - ') || 'No keyword'}</span>
              {card.attack !== undefined && card.health !== undefined ? (
                <strong>
                  {card.attack}/{card.health}
                </strong>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

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

function PageSection(props: {
  route: Route;
  selectedFaction: CardGalleryFactionFilter;
  onSelectFaction: (faction: CardGalleryFactionFilter) => void;
}) {
  const content = routeContent[props.route];

  return (
    <section className="page-panel">
      <p className="eyebrow">{content.eyebrow}</p>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      {props.route === 'home' ? (
        <div className="hero-grid">
          <HeroCard title="Ashfall Covenant" subtitle="Ambush tempo deck" accent="ember" />
          <HeroCard title="Verdant Loom" subtitle="Guard and Renew midrange" accent="verdant" />
          <HeroCard title="Three-step ladder" subtitle="Six encounter variants" accent="dusk" />
        </div>
      ) : null}
      {props.route === 'home' || props.route === 'play' ? <DeckPreview /> : null}
      {props.route === 'rules' ? <RulesReference /> : null}
      {props.route === 'cards' ? (
        <CardGallery
          selectedFaction={props.selectedFaction}
          onSelectFaction={props.onSelectFaction}
        />
      ) : null}
    </section>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash(window.location.hash));
  const [selectedFaction, setSelectedFaction] = useState<CardGalleryFactionFilter>(() => {
    const preferences = createCardGalleryPreferences(window.localStorage, RUN_NAMESPACE);
    return preferences.getSelectedFaction();
  });

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const preferences = createCardGalleryPreferences(window.localStorage, RUN_NAMESPACE);
    preferences.setSelectedFaction(selectedFaction);
  }, [selectedFaction]);

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
              handling. This slice fills in the actual launch set so later rounds can focus on
              match rules, AI behavior, and presentation polish.
            </p>
          </div>
          <aside className="status-card" aria-label="Current route">
            <span className="status-label">Now viewing</span>
            <strong>{activeItem.label}</strong>
            <span className="status-rule">Round 1 shared baseline</span>
          </aside>
        </section>

        <PageSection
          route={route}
          selectedFaction={selectedFaction}
          onSelectFaction={setSelectedFaction}
        />
      </main>
    </div>
  );
}
