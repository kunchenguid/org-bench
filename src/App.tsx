import { FunctionalComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { CardReferenceView } from './CardReferenceView';
import {
  createInitialPlayState,
  getActionLabel,
  performAction,
  startEncounter,
  type PlayState,
} from './play-page';
import { getRouteFromHash, getRouteHref, type RouteKey } from './router';

type NavLink = {
  href: string;
  label: string;
  route: RouteKey;
  description: string;
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
  {
    href: getRouteHref('home'),
    label: 'Home',
    route: 'home',
    description: 'Overview, release status, and next milestones.',
  },
  {
    href: getRouteHref('play'),
    label: 'Play',
    route: 'play',
    description: 'Board layout, encounter flow, and turn controls.',
  },
  {
    href: getRouteHref('rules'),
    label: 'Rules',
    route: 'rules',
    description: 'First-time setup, turn order, keywords, and victory.',
  },
  {
    href: getRouteHref('cards'),
    label: 'Cards',
    route: 'cards',
    description: 'Starter decks, factions, and searchable card roles.',
  },
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
      'Start a run from the Play page, pick your deck, then select the next encounter on the ladder. The current card pool is built around Ember Vanguard for aggressive pressure and Tide Anchor for patient board control.',
      'Each battle begins with both sides shuffling, drawing an opening hand, and starting at the listed life total. A run continues from fight to fight until you lose, retire, or clear the final encounter.',
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
      'Mana is the resource used to play cards. At the start of your turn you refresh your available mana up to your current cap, then spend it as you play cards from hand based on their cost.',
      'If a creature or spell costs more mana than you currently have, you must wait. Unspent mana usually disappears at end of turn unless a card effect says it is stored.',
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
      'Keywords are compact rules text shared with the Cards page glossary. Guard means enemies must attack that creature first. Charge means the creature can attack the turn it is played. Swift means the creature moves first during combat timing checks.',
      'Burn deals the listed damage directly when the effect resolves. Flow grants its bonus if you played another card this turn. Shield prevents the next damage that unit would take each turn. If a card has both a keyword and specific rules text, the specific card text wins.',
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

const App: FunctionalComponent = () => {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(window.location.hash));
  const [playState, setPlayState] = useState<PlayState>(() => createInitialPlayState());

  useEffect(() => {
    const updateRoute = () => setRoute(getRouteFromHash(window.location.hash));
    updateRoute();
    window.addEventListener('hashchange', updateRoute);

    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const currentPage = pageCopy[route];

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
              <div>
                <span class="nav-label">{link.label}</span>
                <p class="nav-description">{link.description}</p>
              </div>
              <small>{route === link.route ? 'Current page' : 'Open page'}</small>
            </a>
          ))}
        </nav>
      </header>

      {route === 'play' ? (
        <main class="play-layout">
          <section class="play-banner panel">
            <div>
              <p class="section-kicker">Campaign ladder</p>
              <h2>Start an encounter</h2>
            </div>
            <p>
              Choose one of the visible enemies below. Once a duel starts, every legal action appears as a
              button and the board updates in place after your move and the AI response.
            </p>
          </section>

          <section class="zone-grid" aria-label="Play board zones">
            <article class="panel zone-card zone-card-wide">
              <p class="section-kicker">Encounter ladder</p>
              <h3>Available opponents</h3>
              <div class="action-list">
                {playState.availableEncounters.map((encounter) => (
                  <button class="action-button" key={encounter.id} onClick={() => setPlayState(startEncounter(playState, encounter.id))}>
                    Start {encounter.name}
                  </button>
                ))}
              </div>
            </article>

            <article class="panel zone-card">
              <p class="section-kicker">Enemy health</p>
              <h3>{playState.mode === 'active' ? playState.game.players.enemy.health : '-'}</h3>
              <p>{playState.mode === 'active' ? playState.encounter.name : 'Pick an encounter to begin.'}</p>
            </article>

            <article class="panel zone-card">
              <p class="section-kicker">Player health</p>
              <h3>{playState.mode === 'active' ? playState.game.players.player.health : '-'}</h3>
              <p>{playState.mode === 'active' ? 'Your hero life total.' : 'Your duel has not started yet.'}</p>
            </article>

            <article class="panel zone-card">
              <p class="section-kicker">Resources</p>
              <h3>
                {playState.mode === 'active'
                  ? `${playState.game.players.player.resources}/${playState.game.players.player.maxResources}`
                  : '-'}
              </h3>
              <p>Spend resources to play cards from your hand.</p>
            </article>

            <article class="panel zone-card zone-card-wide">
              <p class="section-kicker">Battlefield</p>
              <h3>Creatures in play</h3>
              {playState.mode === 'active' ? (
                <div class="stack-list">
                  <div>
                    <strong>You:</strong>{' '}
                    {playState.game.players.player.battlefield.length > 0
                      ? playState.game.players.player.battlefield
                          .map((card) => {
                            const definition = playState.game.cardsById[card.cardId];
                            return `${definition.name} ${card.attack}/${card.health}${card.exhausted ? ' exhausted' : ' ready'}`;
                          })
                          .join(' | ')
                      : 'No creatures in play.'}
                  </div>
                  <div>
                    <strong>Enemy:</strong>{' '}
                    {playState.game.players.enemy.battlefield.length > 0
                      ? playState.game.players.enemy.battlefield
                          .map((card) => {
                            const definition = playState.game.cardsById[card.cardId];
                            return `${definition.name} ${card.attack}/${card.health}${card.exhausted ? ' exhausted' : ' ready'}`;
                          })
                          .join(' | ')
                      : 'No creatures in play.'}
                  </div>
                </div>
              ) : (
                <p>The shared battle lane appears here after you start a fight.</p>
              )}
            </article>

            <article class="panel zone-card zone-card-wide">
              <p class="section-kicker">Hand</p>
              <h3>Playable cards</h3>
              <p>
                {playState.mode === 'active'
                  ? playState.game.players.player.hand
                      .map((card) => {
                        const definition = playState.game.cardsById[card.cardId];
                        return `${definition.name} (${definition.cost})`;
                      })
                      .join(' | ') || 'Your hand is empty.'
                  : 'Your hand will appear after an encounter starts.'}
              </p>
            </article>

            <article class="panel zone-card">
              <p class="section-kicker">Deck</p>
              <h3>{playState.mode === 'active' ? playState.game.players.player.deck.length : '-'}</h3>
              <p>Cards left in your draw pile.</p>
            </article>

            <article class="panel zone-card">
              <p class="section-kicker">Discard</p>
              <h3>{playState.mode === 'active' ? playState.game.players.player.discard.length : '-'}</h3>
              <p>Spent spells and defeated creatures.</p>
            </article>

            <article class="panel zone-card">
              <p class="section-kicker">Action controls</p>
              <h3>Legal actions</h3>
              {playState.mode === 'active' ? (
                <div class="action-list">
                  {playState.legalActions.map((action, index) => (
                    <button class="action-button" key={`${action.type}-${index}`} onClick={() => setPlayState(performAction(playState, action))}>
                      {getActionLabel(playState, action)}
                    </button>
                  ))}
                </div>
              ) : (
                <p>Start an encounter to reveal your legal turn actions.</p>
              )}
            </article>

            <article class="panel zone-card zone-card-wide">
              <p class="section-kicker">Turn flow</p>
              <h3>{playState.mode === 'active' ? playState.statusMessage : 'Waiting for encounter start.'}</h3>
              <div class="log-list">
                {playState.mode === 'active' ? playState.log.slice(-6).map((entry) => <p key={entry}>{entry}</p>) : <p>No duel log yet.</p>}
              </div>
            </article>
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

export { App, navLinks, pageCopy, rulesSections };
