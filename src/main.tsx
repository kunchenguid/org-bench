import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { cardCatalog, getFactionSummaries, type CardDefinition } from './app/card-catalog';
import {
  createEncounterDraft,
  restoreEncounterDraft,
  restorePlaySession,
  saveEncounterDraft,
  type EncounterSession,
} from './app/encounterSession';
import { createPlayPageLayout, type PlayPageLayout } from './app/play-page';
import { getRouteByHash, routes, type RouteId } from './app/routes';
import { ladderSteps, rulesSections } from './app/rules-content';
import './styles.css';

const encounterOptions = [
  {
    id: 'arena-gate',
    label: 'Arena Gate',
    summary: 'Open against a rush deck and stabilize before turn four.',
  },
  {
    id: 'mirror-knight',
    label: 'Mirror Knight',
    summary: 'Expect counters and save one threat for the second exchange.',
  },
  {
    id: 'ember-warden',
    label: 'Ember Warden',
    summary: 'Trade early, then pivot once the burn burst is spent.',
  },
] as const;

const defaultEncounterId = encounterOptions[0].id;

function App() {
  const [route, setRoute] = useState<RouteId>(() => getRouteByHash(window.location.hash).id);

  useEffect(() => {
    const syncRoute = () => {
      setRoute(getRouteByHash(window.location.hash).id);
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  return (
    <div class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Single-player campaign</p>
          <h1>Duel TCG</h1>
          <p class="hero-copy">
            A compact browser card battler with prebuilt decks, visible combat state, and a ladder of AI encounters.
          </p>
        </div>
        <nav class="nav" aria-label="Primary">
          {routes.map((item) => (
            <a class={item.id === route ? 'nav-link active' : 'nav-link'} href={item.hash}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main class="page">{renderPage(route)}</main>
    </div>
  );
}

function renderPage(route: RouteId) {
  switch (route) {
    case 'home':
      return <HomePage />;
    case 'play':
      return <PlayPage />;
    case 'rules':
      return <RulesPage />;
    case 'cards':
      return <CardsPage />;
  }
}

function HomePage() {
  return (
    <section class="panel stack-lg">
      <div class="stack-sm">
        <h2>Ready to climb the arena ladder</h2>
        <p>
          This scaffold ships the site structure now so the full campaign, card systems, and persistence can land in parallel.
        </p>
      </div>
      <div class="grid two-up">
        <article class="card-panel">
          <h3>Play</h3>
          <p>Battle AI opponents with a preconstructed deck and a visible turn flow.</p>
          <a class="button" href="#/play">
            Open the table
          </a>
        </article>
        <article class="card-panel">
          <h3>Learn</h3>
          <p>Read the rules and browse the card reference before the full encounter flow lands.</p>
          <div class="button-row">
            <a class="button secondary" href="#/rules">
              Rules
            </a>
            <a class="button secondary" href="#/cards">
              Card gallery
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}

function PlayPage() {
  const [session, setSession] = useState<EncounterSession>(() => restorePlaySession(window.localStorage, defaultEncounterId));
  const [playPageLayout, setPlayPageLayout] = useState<PlayPageLayout>(() => createPlayPageLayout());
  const enemyHero = playPageLayout.heroes[0];
  const playerHero = playPageLayout.heroes[1];
  const activeEncounter = encounterOptions.find((option) => option.id === session.draft.encounterId) ?? encounterOptions[0];

  const handleEncounterChange = (event: Event) => {
    const nextEncounterId = (event.currentTarget as HTMLSelectElement).value;
    setSession(restoreEncounterDraft(window.localStorage, nextEncounterId));
  };

  const handleNotesInput = (event: Event) => {
    const notes = (event.currentTarget as HTMLTextAreaElement).value;

    setSession((currentSession) => {
      const nextSession: EncounterSession = {
        draft: {
          ...currentSession.draft,
          notes,
        },
        resumed: currentSession.resumed,
      };

      saveEncounterDraft(window.localStorage, nextSession.draft);
      return nextSession;
    });
  };

  const handleClearSavedNotes = () => {
    const nextDraft = createEncounterDraft(session.draft.encounterId);
    saveEncounterDraft(window.localStorage, nextDraft);
    setSession({ draft: nextDraft, resumed: false });
  };

  const handleReplayEncounter = () => {
    setPlayPageLayout(createPlayPageLayout());
  };

  return (
    <section class="panel play-page stack-lg">
      <div class="play-overview">
        <h2>Play</h2>
        <p>
          Read the whole table at a glance, keep encounter notes in local browser storage, and resume the last active matchup
          after a reload.
        </p>
      </div>
      <section class="card-panel encounter-session-panel stack-sm" aria-live="polite">
        <div class="resume-banner">
          <p class="eyebrow">Encounter Resume</p>
          <p>{session.resumed ? 'Resumed your in-progress encounter from this browser.' : 'Your encounter notes save locally in this browser.'}</p>
        </div>
        <label class="field stack-sm">
          <span>Encounter</span>
          <select class="select" value={session.draft.encounterId} onInput={handleEncounterChange}>
            {encounterOptions.map((option) => (
              <option value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <div class="stack-sm">
          <h3>{activeEncounter.label}</h3>
          <p>{activeEncounter.summary}</p>
        </div>
        <label class="field stack-sm">
          <span>Encounter Notes</span>
          <textarea
            class="textarea"
            rows={5}
            value={session.draft.notes}
            onInput={handleNotesInput}
            placeholder="Track mulligan plans, removal timing, or the turn you need to race."
          />
        </label>
        <div class="button-row">
          <button class="button secondary" type="button" onClick={handleClearSavedNotes}>
            Clear saved notes
          </button>
          <button class="button" type="button" onClick={handleReplayEncounter}>
            Replay encounter
          </button>
        </div>
      </section>
      <div class="play-status-grid">
        {[enemyHero, playerHero].map((hero) => (
          <article class={hero.id === 'player' ? 'status-panel status-panel-player' : 'status-panel'} key={hero.id}>
            <p class="card-kicker">{hero.id === 'enemy' ? 'Enemy hero' : 'Player hero'}</p>
            <div class="status-row">
              <div>
                <h3>{hero.name}</h3>
                <p>{hero.detail}</p>
              </div>
              <div class="health-pill" aria-label={`${hero.name} health ${hero.health}`}>
                <span>Health</span>
                <strong>{hero.health}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div class="play-table-layout">
        <div class="play-zones-grid">
          {playPageLayout.zones.map((zone) => (
            <section class={zone.emphasis ? 'zone-panel emphasis zone-panel-wide' : 'zone-panel'} key={zone.id}>
              <p class="card-kicker">Zone</p>
              <h3>{zone.label}</h3>
              <p>{zone.value}</p>
            </section>
          ))}
        </div>
        <aside class="turn-panel">
          <div class="stack-sm">
            <p class="card-kicker">Deterministic sequencing</p>
            <h3>Visible AI behavior</h3>
            <p>{playPageLayout.encounterSummary}</p>
          </div>
          <div class="turn-actions" aria-label="Turn controls">
            {playPageLayout.turnControls.map((control) => (
              <button
                class={control.tone === 'primary' ? 'button turn-button' : 'button secondary turn-button'}
                type="button"
                key={control.label}
              >
                {control.label}
              </button>
            ))}
          </div>
        </aside>
      </div>
      <section class="card-panel encounter-log-panel">
        <div class="stack-sm">
          <p class="card-kicker">Encounter log</p>
          <h3>Every action stays readable</h3>
        </div>
        <div class="encounter-log">
          {playPageLayout.encounterLog.map((turn) => (
            <article class="turn-log-entry" key={`${turn.actor}-${turn.turn}`}>
              <p class="card-kicker">
                Turn {turn.turn} - {turn.actor}
              </p>
              <p>Mana: {turn.mana}</p>
              <p>{turn.health}</p>
              <div class="stack-sm">
                {turn.actions.map((action) => (
                  <p key={action}>{action}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function RulesPage() {
  return (
    <section class="panel stack-lg">
      <div class="stack-sm">
        <h2>Rules</h2>
        <p>
          Duel TCG is built to read quickly and play faster. If you learn the turn order, spend resources on curve, and protect your
          health total during early combats, you can win your first ladder match from this page alone.
        </p>
      </div>
      <div class="card-panel rules-callout">
        <p class="card-kicker">Quick win plan</p>
        <h3>How to steal your first match</h3>
        <p>
          Play a creature every turn if you can, trade off enemy attackers before they snowball, and hold direct damage spells until
          they either remove a blocker or finish the enemy hero.
        </p>
      </div>
      <div class="grid rules-grid">
        {rulesSections.map((section) => (
          <article class="card-panel rules-section">
            <h3>{section.title}</h3>
            <p>{section.intro}</p>
            <ul class="rules-list">
              {section.items.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <section class="card-panel stack-sm">
        <div>
          <p class="card-kicker">Ladder progression</p>
          <h3>What changes as you climb</h3>
        </div>
        <div class="grid ladder-grid">
          {ladderSteps.map((step, index) => (
            <article class="ladder-step">
              <p class="card-kicker">Stage {index + 1}</p>
              <h4>{step.name}</h4>
              <p>{step.goal}</p>
            </article>
          ))}
        </div>
      </section>
      <section class="card-panel stack-sm">
        <p class="card-kicker">Keywords to watch for</p>
        <p>
          Cards that mention <strong>Charge</strong>, <strong>Guard</strong>, <strong>Draw</strong>, or <strong>Burn</strong> change the
          pace of the game immediately. Check those words first when you inspect a new hand.
        </p>
        <p>
          Simple heuristic: attack when you keep board advantage, block when the race is close, and only spend your last burn spell on
          a creature if it saves more damage than it costs.
        </p>
      </section>
      <section class="card-panel stack-sm">
        <p class="card-kicker">Before you queue</p>
        <p>Ask yourself three questions each turn: can I spend all my resources, can I survive the crack-back, and do I have lethal soon?</p>
      </section>
    </section>
  );
}

function CardsPage() {
  const factionSummaries = getFactionSummaries();

  return (
    <section class="panel stack-lg">
      <div class="stack-sm">
        <h2>Card Gallery</h2>
        <p>
          Browse the current starter pool by faction. This reference only describes mechanics that are already represented in the
          listed cards.
        </p>
      </div>
      <div class="grid two-up">
        {factionSummaries.map((summary) => (
          <article class="card-panel faction-panel">
            <p class="card-kicker">Faction</p>
            <h3>{summary.faction}</h3>
            <p>{summary.blurb}</p>
            <p class="faction-meta">
              {summary.creatureCount} creatures - {summary.spellCount} spells
            </p>
          </article>
        ))}
      </div>
      <div class="card-gallery stack-lg">
        {factionSummaries.map((summary) => (
          <section class="stack-sm">
            <div class="stack-sm">
              <p class="card-kicker">{summary.faction}</p>
              <h3>{summary.blurb}</h3>
            </div>
            <div class="grid cards-grid">
              {cardCatalog
                .filter((card) => card.faction === summary.faction)
                .map((card) => (
                  <CardTile card={card} />
                ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function CardTile({ card }: { card: CardDefinition }) {
  return (
    <article class="card-face">
      <div class="card-face-header">
        <p class="card-kicker">{card.type}</p>
        <p class="card-cost">Cost {card.cost}</p>
      </div>
      <div class="stack-sm">
        <h3>{card.name}</h3>
        <p>{card.text}</p>
      </div>
      {card.type === 'Creature' ? (
        <div class="stat-row" aria-label={`${card.attack} attack ${card.health} health`}>
          <span>ATK {card.attack}</span>
          <span>HP {card.health}</span>
        </div>
      ) : (
        <div class="stat-row spell-row">
          <span>One-shot effect</span>
        </div>
      )}
    </article>
  );
}

render(<App />, document.getElementById('app')!);
