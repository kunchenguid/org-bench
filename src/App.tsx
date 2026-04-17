import { FunctionalComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { CardReferenceView } from './CardReferenceView';
import { getPlayBoardZones } from './play-page';
import { getRouteFromHash, getRouteHref, type RouteKey } from './router';

type NavLink = {
  href: string;
  label: string;
  route: RouteKey;
};

type PageCopy = {
  eyebrow: string;
  title: string;
  body: string;
};

type RulesSection = {
  title: string;
  body: string[];
};

const navLinks: NavLink[] = [
  { href: getRouteHref('home'), label: 'Home', route: 'home' },
  { href: getRouteHref('play'), label: 'Play', route: 'play' },
  { href: getRouteHref('rules'), label: 'Rules', route: 'rules' },
  { href: getRouteHref('cards'), label: 'Cards', route: 'cards' },
];

const pageCopy: Record<RouteKey, PageCopy> = {
  home: {
    eyebrow: 'Single-player card battles',
    title: 'Duel TCG',
    body:
      'A polished browser-first card game is landing here. This scaffold sets up the published shell, navigation, and nested-path-safe routing for the full campaign and battle system.',
  },
  play: {
    eyebrow: 'Play page',
    title: 'Encounter Board',
    body:
      'The combat board, campaign ladder, and save-resume flow will attach here on top of the shared shell.',
  },
  rules: {
    eyebrow: 'Rules page',
    title: 'How To Play',
    body:
      'Everything a first-time player needs is here: setup, turn flow, mana, creatures, spells, combat, keywords, victory, and the encounter ladder.',
  },
  cards: {
    eyebrow: 'Card gallery',
    title: 'Card Reference',
    body:
      'The launch card pool, factions, and keyword glossary will be presented here with readable card details.',
  },
};

const rulesSections: RulesSection[] = [
  {
    title: '1. Setup',
    body: [
      'Start a run from the Play page and select the next encounter on the ladder. Each battle begins with both sides shuffling, drawing an opening hand, and starting at the listed life total.',
      'A run continues from fight to fight until you lose, retire, or clear the final encounter. The browser run should carry your ladder progress and rewards forward between battles.',
    ],
  },
  {
    title: '2. Turn Structure',
    body: [
      'Turns follow a fixed order: start step, draw step, main step, combat, second main, then end step. Effects that mention start or end of turn resolve in those windows.',
      'Use your main steps to play creatures, cast most spells, and activate turn-based abilities. Combat is the dedicated window for attacking and blocking.',
    ],
  },
  {
    title: '3. Resources',
    body: [
      'Mana is the resource used to play cards. At the start of your turn you refresh your available mana up to your current cap, then spend it as you cast cards from hand.',
      'If a card costs more mana than you currently have, you must wait. Unspent mana usually disappears at end of turn unless a card effect says it is stored.',
    ],
  },
  {
    title: '4. Creatures And Spells',
    body: [
      'Creatures enter the board and stay there until they are destroyed, bounced, transformed, or otherwise removed. Most creatures cannot attack on the same turn they enter unless a keyword says they can.',
      'Spells resolve once, apply their text, and then go to the discard pile unless the card says it remains in play. Damage, buffs, summons, and card draw from spells happen as soon as the spell resolves.',
    ],
  },
  {
    title: '5. Combat',
    body: [
      'During combat you declare which ready creatures attack. The defender then assigns blockers if any are available. Unblocked attackers deal their damage directly to the opposing hero.',
      'Blocked creatures and their blockers deal damage to each other at the same time unless a keyword changes timing. A creature is destroyed when it has damage equal to or greater than its health.',
    ],
  },
  {
    title: '6. Keywords',
    body: [
      'Keywords are compact rules text. Typical examples are Guard for units that must be answered before other attacks can push through, Charge for units that can attack sooner, and spell-triggered abilities that reward chaining spells.',
      'If a keyword is unclear, check the card reference or tooltip. When a card has both a keyword and specific rules text, the specific card text wins.',
    ],
  },
  {
    title: '7. Victory And Defeat',
    body: [
      'You win an encounter by reducing the enemy hero to 0 life or by satisfying any alternate win condition shown for that fight. You lose if your hero reaches 0 life or a scenario-specific defeat rule triggers first.',
      'If both sides would be defeated at once, use the encounter text shown in the browser. If the fight does not override it, assume ties break against the active player.',
    ],
  },
  {
    title: '8. Encounter Ladder',
    body: [
      'A run is a ladder of escalating encounters. Early fights teach the basic flow, while later fights add tighter enemy decks, stronger keywords, and boss-style mechanics that punish sloppy sequencing.',
      'After each win, advance to the next node and claim any offered reward before starting the next battle. Clearing the final node completes the run.',
    ],
  },
];

const playZoneDescriptions: Record<string, string> = {
  'Enemy health': 'Visible damage pressure and remaining life total for the opposing side.',
  'Player health': 'Your current life total and survival buffer for the duel.',
  Resources: 'Available energy for playing cards and sequencing turns.',
  Battlefield: 'The shared lane where units and ongoing effects are tracked.',
  Hand: 'Ready-to-play cards with enough room for evaluator-driven choices.',
  Deck: 'Remaining draw pile so state and fatigue pressure stay legible.',
  Discard: 'Spent cards and defeated units for graveyard-aware effects.',
  'Action controls': 'Primary buttons for ending turns, resolving combat, and advancing game state.',
  'Turn flow': 'Clear feedback showing the current phase, prompts, and next expected action.',
};

const App: FunctionalComponent = () => {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    const updateRoute = () => setRoute(getRouteFromHash(window.location.hash));
    updateRoute();
    window.addEventListener('hashchange', updateRoute);

    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const currentPage = pageCopy[route];
  const playZones = getPlayBoardZones();

  return (
    <div class="site-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">{currentPage.eyebrow}</p>
          <h1>{currentPage.title}</h1>
          <p class="lede">{currentPage.body}</p>
        </div>
        <nav aria-label="Primary navigation" class="nav-grid">
          {navLinks.map((link) => (
            <a class={route === link.route ? 'nav-card active' : 'nav-card'} href={link.href} key={link.route}>
              <span>{link.label}</span>
              <small>{route === link.route ? 'Current page' : 'Open page'}</small>
            </a>
          ))}
        </nav>
      </header>

      {route === 'play' ? (
        <main class="play-layout">
          <section class="play-banner panel">
            <div>
              <p class="section-kicker">Evaluator board</p>
              <h2>Encounter at a glance</h2>
            </div>
            <p>
              Every critical combat zone is visible in one screen so automated and manual play can read
              state, make moves, and confirm turn progression without hidden UI.
            </p>
          </section>

          <section class="zone-grid" aria-label="Play board zones">
            {playZones.map((zone) => (
              <article class={zone === 'Battlefield' ? 'panel zone-card zone-card-wide' : 'panel zone-card'} key={zone}>
                <p class="section-kicker">Zone</p>
                <h3>{zone}</h3>
                <p>{playZoneDescriptions[zone]}</p>
              </article>
            ))}
          </section>
        </main>
      ) : route === 'rules' ? (
        <main class="content-panel">
          {rulesSections.map((section) => (
            <section class="panel" key={section.title}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </main>
      ) : route === 'cards' ? (
        <CardReferenceView />
      ) : (
        <main class="content-panel">
          <section class="panel">
            <h2>Project Status</h2>
            <p>
              Shared scaffold is in place with TypeScript, Vite, Preact, route-aware navigation, and a
              build output configured for nested-path static hosting.
            </p>
          </section>

          <section class="panel muted">
            <h2>Next Build Layer</h2>
            <p>
              Upcoming work will add the duel engine, AI encounters, persistent saves, campaign ladder,
              rules copy, and complete card gallery.
            </p>
          </section>
        </main>
      )}
    </div>
  );
};

export { App, pageCopy, rulesSections };
