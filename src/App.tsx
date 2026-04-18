import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

import { createEncounterDuelState, ladderEncounters } from './campaign';
import { advanceTurn, createDuelState, dealDamage, deployCard, type DuelState } from './game/state';
import { clearEncounterSnapshot, loadEncounterSnapshot, type EncounterSnapshot } from './persistence';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

type SavedEncounter = EncounterSnapshot & {
  duelState?: DuelState;
};

const RUN_ID = 'facebook-seed-01';

const routes: Record<RouteKey, { label: string; title: string; body: string }> = {
  home: {
    label: 'Home',
    title: 'Duel of Ash and Aether',
    body: 'Challenge a sequence of browser-based card duels in a world split between Emberfire and skybound Aethercraft.'
  },
  play: {
    label: 'Play',
    title: 'Play',
    body: 'Pilot a deterministic duel snapshot wired from the shared state engine so the shell reflects real turn, hand, resource, and battlefield data.'
  },
  rules: {
    label: 'Rules',
    title: 'Rules',
    body: 'Learn turn flow, mana growth, creatures, spells, and the ladder structure here as the rules reference fills in.'
  },
  cards: {
    label: 'Cards',
    title: 'Card Gallery',
    body: 'Browse the Ember and Aether card catalog here as the illustrated card pool is added.'
  }
};

const feedbackPatterns = [
  {
    name: 'Card Play Lift',
    tone: 'play',
    className: 'fx-card-play',
    body: 'Use for cards leaving hand and settling onto the board with a short upward lift and glow.'
  },
  {
    name: 'Attack Lunge',
    tone: 'attack',
    className: 'fx-attack-lunge',
    body: 'Use on attackers to sell forward momentum before they snap back into their lane.'
  },
  {
    name: 'Damage Flash',
    tone: 'damage',
    className: 'fx-damage-flash',
    body: 'Use when units or heroes take damage to pair a red pulse with a quick shake.'
  },
  {
    name: 'Turn Sweep',
    tone: 'turn',
    className: 'fx-turn-sweep',
    body: 'Use for turn transitions to sweep focus across the active side of the board.'
  },
  {
    name: 'Victory-Loss Overlay',
    tone: 'outcome',
    className: 'fx-outcome-rise',
    body: 'Use for win or loss overlays so results rise in with a soft backdrop bloom.'
  }
] as const;

const actionTimeline = [
  {
    title: 'Turn Sweep',
    body: 'Turn 2 - Player initiative'
  },
  {
    title: 'Card Play Lift',
    body: 'Player deploys Ashguard Bruiser to the battlefield'
  },
  {
    title: 'Damage Flash',
    body: 'Opponent takes 4 damage and drops to 16 health'
  }
] as const;

const duelPreviewState = createPreviewState();

function createPreviewState(): DuelState {
  const playerDeck = ['Ashguard Bruiser', 'Skyhook Snare', 'Forge Banner', 'Cinder Scribe', 'Blaze Volley'];
  const opponentDeck = ['Aether Medic', 'Ward Relay', 'Mist Archivist', 'Prism Pike', 'Null Shell'];

  let state = createDuelState({ playerDeck, opponentDeck, openingHandSize: 3 });

  state = advanceTurn(state);
  state = deployCard(state, 'opponent', 0, 0);
  state = advanceTurn(state);
  state = deployCard(state, 'player', 0, 0);

  return dealDamage(state, 'opponent', 4);
}

function getRouteFromHash(hash: string): RouteKey {
  const value = hash.replace(/^#\/?/, '');
  return value in routes ? (value as RouteKey) : 'home';
}

function getHashForRoute(route: RouteKey) {
  return `#/${route}`;
}

function getBoardState(savedEncounter: SavedEncounter | null) {
  return savedEncounter?.duelState ?? duelPreviewState;
}

function getTurnBanner(state: DuelState) {
  return `Turn ${state.turn} - ${state.activePlayer === 'player' ? 'Player active' : 'Opponent active'}`;
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromHash(window.location.hash));
  const [savedEncounter, setSavedEncounter] = useState<SavedEncounter | null>(() =>
    loadEncounterSnapshot(window.localStorage, RUN_ID) as SavedEncounter | null
  );

  useLayoutEffect(() => {
    const normalizedHash = getHashForRoute(route);

    if (window.location.hash !== normalizedHash) {
      window.location.hash = normalizedHash;
    }
  }, [route]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    onHashChange();

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (route === 'play') {
      setSavedEncounter(loadEncounterSnapshot(window.localStorage, RUN_ID) as SavedEncounter | null);
    }
  }, [route]);

  const page = routes[route];
  const boardState = getBoardState(savedEncounter);
  const player = boardState.players.player;
  const opponent = boardState.players.opponent;

  useLayoutEffect(() => {
    document.title = `${page.title} | Duel of Ash and Aether`;
  }, [page.title]);

  const onStartNewRun = () => {
    clearEncounterSnapshot(window.localStorage, RUN_ID);
    setSavedEncounter(null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/home">
          <span className="brand-mark">A</span>
          <span>Duel of Ash and Aether</span>
        </a>
        <nav className="nav" aria-label="Primary">
          {Object.entries(routes).map(([key, item]) => (
            <a
              key={key}
              className={route === key ? 'nav-link active' : 'nav-link'}
              href={getHashForRoute(key as RouteKey)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="layout">
        {route === 'play' ? (
          <>
            <section className="board-shell" aria-labelledby="live-duel-board-title">
              <div className="board-intro">
                <p className="eyebrow">State-Driven Snapshot</p>
                <h1 id="live-duel-board-title">Live Duel Board</h1>
                <p>{page.body}</p>
              </div>

              <section className="play-status" aria-label="Encounter Persistence">
                {savedEncounter ? (
                  <>
                    <p>{`Saved encounter: ${savedEncounter.encounterName}`}</p>
                    {savedEncounter.duelState ? (
                      <>
                        <p>{`Turn ${savedEncounter.duelState.turn} - ${savedEncounter.duelState.activePlayer} turn`}</p>
                        <p>{`Player health ${savedEncounter.duelState.players.player.health} - Opponent health ${savedEncounter.duelState.players.opponent.health}`}</p>
                      </>
                    ) : null}
                    <div className="hero-actions">
                      <button className="button primary" type="button">
                        Resume Encounter
                      </button>
                      <button className="button secondary" type="button" onClick={onStartNewRun}>
                        Start New Run
                      </button>
                    </div>
                  </>
                ) : (
                  <p>No active encounter saved for this run.</p>
                )}
              </section>

              <div className="turn-banner">{getTurnBanner(boardState)}</div>

              <section className="hud-grid" aria-label="Combatant Status">
                <article className="hud-card player">
                  <p className="hud-label">Player Health</p>
                  <div className="hud-value-row">
                    <span className="hud-value">{player.health}</span>
                    <span className="hud-value-meta">health</span>
                  </div>
                  <div className="hud-stats">
                    <span>{`Resource ${player.resources.current} / ${player.resources.max}`}</span>
                    <span>{`Deck ${player.deck.length}`}</span>
                    <span>{`Discard ${player.discard.length}`}</span>
                  </div>
                </article>

                <article className="hud-card enemy">
                  <p className="hud-label">Enemy Health</p>
                  <div className="hud-value-row">
                    <span className="hud-value">{opponent.health}</span>
                    <span className="hud-value-meta">health</span>
                  </div>
                  <div className="hud-stats">
                    <span>{`Energy ${opponent.resources.current} / ${opponent.resources.max}`}</span>
                    <span>{`Deck ${opponent.deck.length}`}</span>
                    <span>{`Discard ${opponent.discard.length}`}</span>
                  </div>
                </article>
              </section>

              <section className="battlefield-shell" aria-label="Battlefield Lanes">
                <section className="lane-panel" aria-label="Front Lane">
                  <div className="lane-header">
                    <h3>Front Lane</h3>
                    <span>{player.battlefield.length} unit</span>
                  </div>
                  <div className="lane-cards">
                    {player.battlefield.map((card) => (
                      <article className="lane-card" key={card}>
                        <p className="lane-card-name">{card}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="lane-panel" aria-label="Back Lane">
                  <div className="lane-header">
                    <h3>Back Lane</h3>
                    <span>{opponent.battlefield.length} unit</span>
                  </div>
                  <div className="lane-cards">
                    {opponent.battlefield.map((card) => (
                      <article className="lane-card" key={card}>
                        <p className="lane-card-name">{card}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <aside className="stack-column" aria-label="Card Stacks">
                  <article className="stack-card">
                    <p className="stack-label">Deck</p>
                    <strong>{player.deck.length}</strong>
                  </article>
                  <article className="stack-card">
                    <p className="stack-label">Discard</p>
                    <strong>{player.discard.length}</strong>
                  </article>
                </aside>
              </section>

              <section className="hand-dock" aria-label="Hand Dock">
                <div className="lane-header">
                  <h2>Hand Dock</h2>
                  <span>{`${player.hand.length} cards`}</span>
                </div>
                <div className="hand-cards">
                  {player.hand.map((card) => (
                    <article className="hand-card" key={card}>
                      {card}
                    </article>
                  ))}
                </div>
              </section>
            </section>

            <section className="encounter-strip" aria-labelledby="encounter-ladder-title">
              <div className="section-heading">
                <p className="eyebrow">Engine-Bound Ladder</p>
                <h2 id="encounter-ladder-title">Encounter Ladder</h2>
              </div>
              <div className="encounter-grid">
                {ladderEncounters.map((encounter, index) => {
                  const duel = createEncounterDuelState(encounter.id);

                  return (
                    <article className="encounter-card" key={encounter.id}>
                      <span className="encounter-step">Fight {index + 1}</span>
                      <h3>{encounter.name}</h3>
                      <p>{encounter.summary}</p>
                      <ul className="card-chip-list">
                        <li>{encounter.playerDeck.name}</li>
                        <li>{encounter.enemyDeck.name}</li>
                        <li>{`Opening hand ${duel.state.players.player.hand.length}`}</li>
                        <li>{`Enemy hand ${duel.state.players.opponent.hand.length}`}</li>
                      </ul>
                      <ul className="ai-plan">
                        {encounter.aiPlan.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="feedback-kit" aria-labelledby="action-timeline-title">
              <div className="section-copy">
                <p className="eyebrow">State Sequence</p>
                <h2 id="action-timeline-title">Action Timeline</h2>
              </div>
              <div className="preview-grid" aria-label="Action Timeline Steps">
                {actionTimeline.map((step) => (
                  <article className="preview-card ladder" key={step.title}>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="feedback-kit" aria-labelledby="feedback-kit-title">
              <div className="section-copy">
                <p className="eyebrow">Visual Feedback Primitives</p>
                <h2 id="feedback-kit-title">Combat Feedback Kit</h2>
                <p>
                  Reusable motion and overlay patterns for card play, attacks, damage hits, turn
                  swaps, and match resolution.
                </p>
              </div>

              <div className="feedback-grid">
                {feedbackPatterns.map((pattern) => (
                  <article key={pattern.name} className={`feedback-card tone-${pattern.tone}`}>
                    <div className={`feedback-demo ${pattern.className}`} aria-hidden="true">
                      <span className="feedback-chip">Demo</span>
                    </div>
                    <h3>{pattern.name}</h3>
                    <p>{pattern.body}</p>
                    <code>{pattern.className}</code>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="hero-panel">
              <div className="hero-home">
                <div className="hero-copy">
                  <p className="eyebrow">Static TCG Campaign</p>
                  <h1>{page.title}</h1>
                  <p className="hero-lede">Choose a side in a shattered sky war.</p>
                  <p>{page.body}</p>
                  <div className="hero-actions">
                    <a className="button primary strong" href="#/play">
                      Enter the Gauntlet
                    </a>
                    <a className="button secondary" href="#/cards">
                      Study Both Factions
                    </a>
                  </div>
                </div>

                <aside className="hero-aside">
                  <span className="hero-badge">Run Snapshot</span>
                  <ul className="hero-stats">
                    <li>
                      <strong>3-step gauntlet</strong>
                      <span>Fight through three deterministic ladder battles.</span>
                    </li>
                    <li>
                      <strong>12 signature cards</strong>
                      <span>Each deck recipe expands into a repeatable engine-ready opening state.</span>
                    </li>
                    <li>
                      <strong>Shared duel engine</strong>
                      <span>Play route snapshots stay anchored to the same deterministic state helpers.</span>
                    </li>
                  </ul>
                </aside>
              </div>
            </section>

            <section className="section-block" aria-labelledby="faction-previews-title">
              <div className="section-heading">
                <p className="eyebrow">Faction Overview</p>
                <h2 id="faction-previews-title">Faction Previews</h2>
              </div>
              <div className="preview-grid factions-grid">
                <article className="preview-card ember">
                  <span className="card-kicker">Aggro Tempo</span>
                  <h3>Emberfire Vanguard</h3>
                  <p>Explodes onto the board with direct damage, cheap fighters, and relentless pressure.</p>
                </article>
                <article className="preview-card aether">
                  <span className="card-kicker">Control Tempo</span>
                  <h3>Aether Covenant</h3>
                  <p>Answers threats with shields and evasive units before locking in a disciplined finish.</p>
                </article>
              </div>
            </section>

            <section className="encounter-strip" aria-labelledby="encounter-path-title">
              <div className="section-heading">
                <p className="eyebrow">Campaign Route</p>
                <h2 id="encounter-path-title">Encounter Path</h2>
              </div>
              <div className="encounter-grid">
                <article className="encounter-card">
                  <span className="encounter-step">Fight 1</span>
                  <h3>Gate of Cinders</h3>
                  <p>Fast Ember assault that teaches early board control and clean trades.</p>
                </article>
                <article className="encounter-card">
                  <span className="encounter-step">Fight 2</span>
                  <h3>Glassgarden Crossing</h3>
                  <p>Shield-heavy midboss that punishes overextending into tempo answers.</p>
                </article>
                <article className="encounter-card">
                  <span className="encounter-step">Fight 3</span>
                  <h3>The Zenith Prism</h3>
                  <p>Final mirror-tech duel where burn timing and hand discipline decide the run.</p>
                </article>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
