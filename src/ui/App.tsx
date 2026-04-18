import { useEffect, useMemo, useState } from 'preact/hooks';
import { cards, decks, encounterLadder, keywordGlossary } from '../game-data';
import {
  createCardGalleryPreferences,
  filterCardsByFaction,
  type CardGalleryFactionFilter,
} from './card-gallery-preferences';
import { buildPlayBoardReference } from './play-board-reference';

type Route = 'home' | 'play' | 'rules' | 'cards';

type NavItem = {
  route: Route;
  label: string;
};

type BoardZoneProps = {
  title: string;
  count: string;
  detail: string;
  tone?: 'neutral' | 'enemy' | 'player';
};

type RulesSection = {
  title: string;
  body: string;
  bullets: string[];
};

const navItems: NavItem[] = [
  { route: 'home', label: 'Home' },
  { route: 'play', label: 'Play' },
  { route: 'rules', label: 'How to Play' },
  { route: 'cards', label: 'Card Gallery' },
];

const rulesSections: RulesSection[] = [
  {
    title: 'Turn flow',
    body:
      'Each duel follows a clean cadence: ready your board, draw into fresh options, spend your charged energy, then commit attacks before the enemy takes the same steps on its turn.',
    bullets: [
      'Ready all exhausted cards and resolve any start-of-turn effects.',
      'Draw one card and refill your energy for the turn.',
      'Play creatures and spells in any order while you can still afford them.',
      'Attack, resolve blockers and damage, then pass the turn once your board is set.',
    ],
  },
  {
    title: 'Resources',
    body:
      'Energy is the game’s resource system. Every card shows its cost, and every turn asks whether you should spend everything for tempo or hold back a cleaner answer for the next exchange.',
    bullets: [
      'Your energy refreshes at the start of your turn.',
      'Unused energy disappears when you end the turn.',
      'Cheap cards help you curve out early while expensive plays swing the board later.',
    ],
  },
  {
    title: 'Creature cards and spell cards',
    body:
      'Creatures stay on the battlefield and keep pressuring the duel across multiple turns. Spells resolve once, create a burst of impact, then move to the discard pile.',
    bullets: [
      'Creatures use power and health to trade in combat.',
      'Spells can deal damage, protect allies, or shift combat math in your favor.',
      'Winning decks blend stable board presence with timely one-shot effects.',
    ],
  },
  {
    title: 'Combat',
    body:
      'Combat is where most duels are decided. Ready creatures can attack, defenders can block, and damage is dealt simultaneously so positioning and timing matter every turn.',
    bullets: [
      'Unblocked damage hits the opposing champion directly.',
      'Creatures that take damage equal to or greater than their health are defeated.',
      'A good combat step is often about forcing one favorable trade, not attacking with everything.',
    ],
  },
  {
    title: 'Victory and defeat',
    body:
      'Reduce the opposing champion to zero health before they do the same to you. The campaign is small, so preserving life total and cards for the next hard turn matters more than flashy overkill.',
    bullets: [
      'You win immediately when the enemy champion reaches zero health.',
      'You lose immediately when your champion reaches zero health.',
      'A thinner deck means fewer future answers, so card advantage still matters.',
    ],
  },
  {
    title: 'Encounter progression',
    body:
      'Auric Reach is a short ascent through escalating encounters. Each opponent asks for a slightly different read on when to race, when to block, and when to conserve resources.',
    bullets: [
      'Early encounters teach the baseline rhythm of energy, creatures, and blocking.',
      'Later fights pressure you to sequence more tightly and respect enemy swings.',
      'A full run is about clearing the sequence, not farming a single easy duel.',
    ],
  },
  {
    title: 'Save and resume',
    body:
      'Runs are designed to survive interruptions. The game stores your campaign state locally so you can close the browser, come back later, and continue from the same in-progress run.',
    bullets: [
      'Current encounter state and cleared progress are saved automatically.',
      'Reloading the site should restore the same run on this device.',
      'Starting a fresh run replaces the previous in-progress campaign.',
    ],
  },
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
    title: 'Live duel board',
    body:
      'A polished board shell for reading state at a glance, now backed by the designed decks and encounter ladder that will drive the duel flow.',
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

function BoardZone(props: BoardZoneProps) {
  const toneClass = props.tone ? ` board-zone-${props.tone}` : '';

  return (
    <article className={`board-zone${toneClass}`}>
      <div className="board-zone-header">
        <span>{props.title}</span>
        <strong>{props.count}</strong>
      </div>
      <p>{props.detail}</p>
    </article>
  );
}

export function PlayBoard() {
  const reference = buildPlayBoardReference();

  return (
    <section className="play-board" aria-label="Play board">
      <div className="board-headline">
        <div>
          <p className="eyebrow">Play Surface</p>
          <h2>Live duel board</h2>
          <p>
            A presentational combat table with readable zones, turn state, and primary actions for
            the opening {reference.encounterTitle} matchup.
          </p>
        </div>
        <aside className="turn-indicator" aria-label="Turn state">
          <span className="status-label">Turn indicator</span>
          <strong>Your turn</strong>
          <span className="status-rule">{reference.encounterVariantName} · 3 actions available</span>
        </aside>
      </div>

      <div className="combatants" aria-label="Combatant status">
        <article className="combatant-card combatant-card-enemy">
          <span className="combatant-label">Enemy champion</span>
          <strong>{reference.enemyDeckName}</strong>
          <div className="combatant-stats">
            <span>Health 18</span>
            <span>Resources 6</span>
            <span>{reference.enemyDeckCount}</span>
          </div>
        </article>
        <article className="combatant-card combatant-card-player">
          <span className="combatant-label">Player champion</span>
          <strong>{reference.playerDeckName}</strong>
          <div className="combatant-stats">
            <span>Health 22</span>
            <span>Resources 5</span>
            <span>{reference.playerDeckCount}</span>
          </div>
        </article>
      </div>

      <div className="board-grid">
        <div className="board-row">
          <BoardZone title="Enemy hand" count="4 cards" detail="Hidden grip with one revealed reaction window." tone="enemy" />
          <BoardZone title="Enemy deck" count="14 cards" detail="Remaining draw pile and fatigue pressure for the opposing side." tone="enemy" />
          <BoardZone title="Enemy battlefield" count="3 units" detail="Frontline creatures and supports occupying the attack lane." tone="enemy" />
          <BoardZone title="Enemy discard" count="7 cards" detail="Spent threats and broken relics visible for graveyard effects." tone="enemy" />
          <BoardZone title="Enemy resources" count="6 charged" detail="Crystals available for the current enemy turn." tone="enemy" />
        </div>

        <div className="battlefield-band" aria-label="Battlefield focus">
          <div>
            <span className="battlefield-label">Battlefield</span>
            <strong>{reference.battlefieldLabel}</strong>
          </div>
          <p>Two opposing frontlines face off here. Hover and targeting logic can attach to this rail next.</p>
        </div>

        <div className="board-row">
          <BoardZone title="Your resources" count="5 charged" detail="Available mana to commit before ending the turn." tone="player" />
          <BoardZone title="Your battlefield" count="2 units" detail="Your active creatures, equipment, and persistent effects." tone="player" />
          <BoardZone title="Your hand" count="5 cards" detail="Large touch-friendly staging area for playable cards." tone="player" />
          <BoardZone title="Your deck" count="19 cards" detail="Your draw stack with enough visibility for planning the next cycle." tone="player" />
          <BoardZone title="Your discard pile" count="3 cards" detail="Resolved spells and fallen allies waiting for recursion." tone="player" />
        </div>
      </div>

      <div className="board-actions" aria-label="Primary actions">
        <button type="button" className="action-primary">Play selected card</button>
        <button type="button" className="action-secondary">Attack with battlefield</button>
        <button type="button" className="action-secondary">End turn</button>
      </div>
    </section>
  );
}

<<<<<<< HEAD
export function RulesPanel() {
  return (
    <section className="page-panel rules-panel">
      <div className="rules-intro">
        <p className="eyebrow">Field Manual</p>
        <h2>How to play the Auric Reach campaign.</h2>
        <p>
          Auric Reach is a single-player duel card game about efficient energy use, clean combat
          math, and surviving a short sequence of escalating encounters. Read the cadence once,
          then the board should make the rest feel natural.
        </p>
      </div>

      <div className="rules-grid">
        {rulesSections.map((section) => (
          <article key={section.title} className="rules-card">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function PageSection(props: {
  route: Route;
  selectedFaction: CardGalleryFactionFilter;
  onSelectFaction: (faction: CardGalleryFactionFilter) => void;
}) {
  const content = routeContent[props.route];

  if (props.route === 'play') {
    return <PlayBoard />;
  }

  if (props.route === 'rules') {
    return <RulesPanel />;
  }

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
      {props.route === 'home' ? <DeckPreview /> : null}
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
