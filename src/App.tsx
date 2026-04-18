import { useEffect, useState } from 'preact/hooks';
import { createGameSession, createGameStorage, endTurn, listLegalActions, playCard } from './game/engine';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

type PageDefinition = {
  key: RouteKey;
  href: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  description: string;
};

type FactionDefinition = {
  name: string;
  archetype: string;
  summary: string;
};

type CardDefinition = {
  name: string;
  faction: string;
  typeLine: string;
  cost: number;
  stats?: string;
  text: string;
  role: string;
};

const pages: PageDefinition[] = [
  {
    key: 'home',
    href: './',
    navLabel: 'Home',
    eyebrow: 'Single-player browser TCG',
    title: 'Duel TCG',
    description: 'Challenge an AI rival in a compact lane-based card duel built for fast browser play.'
  },
  {
    key: 'play',
    href: './play',
    navLabel: 'Play',
    eyebrow: 'Encounter ladder',
    title: 'Play Duel TCG',
    description: 'Read the battlefield state, choose a line, and understand the full turn at a glance.'
  },
  {
    key: 'rules',
    href: './rules',
    navLabel: 'Rules',
    eyebrow: 'Learn the basics',
    title: 'How to Play',
    description:
      'Start with three cards and one energy, learn the lane-based turn flow, and understand how Duel TCG resolves combat.'
  },
  {
    key: 'cards',
    href: './cards',
    navLabel: 'Cards',
    eyebrow: 'Reference gallery',
    title: 'Card Gallery',
    description: 'Browse the starter factions, creature lineup, and support spells.'
  }
];

const factions: FactionDefinition[] = [
  {
    name: 'Sky Armada tempo',
    archetype: 'Tempo flyers',
    summary: 'Pressure open lanes with evasive attackers and clean re-deploy turns.'
  },
  {
    name: 'Ashen Circle',
    archetype: 'Spell pressure',
    summary: 'Turn damaged enemies into reach with tactical burn and card velocity.'
  },
  {
    name: 'Rootforge',
    archetype: 'Ramp and anchors',
    summary: 'Absorb early pressure, grow your energy curve, and close with durable bodies.'
  }
];

const cards: CardDefinition[] = [
  {
    name: 'Sunforge Vanguard',
    faction: 'Sky Armada',
    typeLine: 'Vanguard - Frontline',
    cost: 3,
    stats: '4/3',
    text: 'When this unit survives combat, gain 1 energy next turn.',
    role: 'A simple payoff for winning efficient trades in the front lane.'
  },
  {
    name: 'Cinder Volley',
    faction: 'Ashen Circle',
    typeLine: 'Tactic - Burst',
    cost: 2,
    text: 'Deal 2 damage to a unit. If it was already damaged, draw a card.',
    role: 'Shows how spells convert chip damage into tempo and card flow.'
  },
  {
    name: 'Rootforge Bastion',
    faction: 'Rootforge',
    typeLine: 'Warden - Backline',
    cost: 4,
    stats: '2/6',
    text: 'Your nexus heals 2 when this enters play. Adjacent allies gain +1 health.',
    role: 'Teaches that some cards stabilize lanes instead of racing damage.'
  }
];

type GameSession = ReturnType<typeof createGameSession>;
type GameAction = ReturnType<typeof listLegalActions>[number];

const laneLabels = {
  backline: 'Backline',
  frontline: 'Frontline',
  support: 'Support lane'
} as const;

const encounterId = 'encounter-1';
const runId = 'amazon-seed-01';

function formatActivePlayer(playerId: GameSession['turn']['activePlayerId']): string {
  return playerId === 'player' ? 'Player' : 'AI';
}

function formatActionLabel(session: GameSession, action: GameAction): string {
  if (action.type === 'pass') {
    return session.turn.activePlayerId === 'player'
      ? `Pass with ${session.players.player.resources.current} energy unspent`
      : 'Pass turn';
  }

  const activePlayer = session.players[session.turn.activePlayerId];
  const card = activePlayer.hand.find((entry) => entry.id === action.cardId);

  if (action.type === 'play_spell') {
    return card ? `Cast ${card.name} for 2 damage` : 'Cast spell for 2 damage';
  }

  if (!card) {
    return 'Play unit';
  }

  return `Play ${card.name} to ${laneLabels[action.lane as keyof typeof laneLabels]}`;
}

function formatLaneCards(cardsInLane: GameSession['players']['player']['battlefield']['frontline']): string {
  if (cardsInLane.length === 0) {
    return 'Empty';
  }

  return cardsInLane.map((card) => card.name).join(', ');
}

function buildEncounterLog(session: GameSession): string[] {
  const activePlayer = session.players[session.turn.activePlayerId];
  const waitingPlayer = session.players[session.turn.activePlayerId === 'player' ? 'ai' : 'player'];

  return [
    `Opening session from the engine contract: both players begin at 20 health and the player acts first.`,
    `${session.encounter.opponentName} is the current opponent for ${session.encounter.id}.`,
    `${formatActivePlayer(session.turn.activePlayerId)} acts on turn ${session.turn.number} with ${activePlayer.resources.current}/${activePlayer.resources.max} energy while the waiting side sits at ${waitingPlayer.resources.current}/${waitingPlayer.resources.max}.`,
    `Open lanes: frontline ${formatLaneCards(session.players.player.battlefield.frontline)}, support ${formatLaneCards(session.players.player.battlefield.support)}, backline ${formatLaneCards(session.players.player.battlefield.backline)}.`
  ];
}

function getRouteFromPath(pathname: string): RouteKey {
  const normalizedPath = pathname.replace(/\/+$/, '');
  const pathParts = normalizedPath.split('/').filter(Boolean);
  const leaf = pathParts[pathParts.length - 1];

  if (leaf === 'play' || leaf === 'rules' || leaf === 'cards') {
    return leaf;
  }

  return 'home';
}

function useRoute(): RouteKey {
  const [route, setRoute] = useState<RouteKey>(() => getRouteFromPath(window.location.pathname));

  useEffect(() => {
    const syncRoute = () => setRoute(getRouteFromPath(window.location.pathname));

    window.addEventListener('popstate', syncRoute);

    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  return route;
}

function ActivePage({
  route,
  session,
  onGameAction,
  onResetEncounter,
  onResumeEncounter,
  onSaveEncounter,
  resumeReady,
  saveStatus
}: {
  route: RouteKey;
  session: GameSession;
  onGameAction: (action: GameAction) => void;
  onResetEncounter: () => void;
  onResumeEncounter: () => void;
  onSaveEncounter: () => void;
  resumeReady: boolean;
  saveStatus: string;
}) {
  const page = pages.find((entry) => entry.key === route) ?? pages[0];

  const isRulesPage = route === 'rules';
  const isPlayPage = route === 'play';
  const isCardsPage = route === 'cards';
  const activePlayer = session.players[session.turn.activePlayerId];
  const opposingPlayer = session.players[session.turn.activePlayerId === 'player' ? 'ai' : 'player'];
  const legalActions = listLegalActions(session);
  const encounterLog = buildEncounterLog(session);

  return (
    <section className="panel hero-panel">
      <p className="eyebrow">{page.eyebrow}</p>
      <h1>{page.title}</h1>
      <p className="lede">
        {isPlayPage
          ? 'See a real session rendered from the engine contract, then take a legal action and watch the turn state update.'
          : page.description}
      </p>
      {route === 'home' ? (
        <div className="home-layout">
          <section className="panel inset-panel home-intro">
            <p className="section-label">Built for readable duels</p>
            <p className="home-highlight">Three lanes. One rival. Ten-minute runs.</p>
            <p>
              Duel TCG gives players a complete tactical card battle in one sitting, with clear lane pressure, no asset
              grind, and enough guidance to start making smart choices immediately.
            </p>
          </section>
          <div className="feature-grid">
            <article className="panel inset-panel">
              <h2>Read the board in seconds</h2>
              <p>Prebuilt decks, visible zones, and deterministic turns keep the duel readable.</p>
            </article>
            <article className="panel inset-panel">
              <h2>Start every run on even footing</h2>
              <p>Play through a sequence of AI opponents with no login, backend, or downloads.</p>
            </article>
            <article className="panel inset-panel">
              <h2>Learn without opening another tab</h2>
              <p>Rules and card reference stay one click away so players can learn without guessing.</p>
            </article>
          </div>
        </div>
      ) : null}
      {isPlayPage ? (
        <div className="play-layout">
          <section className="panel inset-panel battlefield-panel" aria-label="Encounter overview">
            <div className="battlefield-summary">
              <p className="section-label">Turn {session.turn.number} - {formatActivePlayer(session.turn.activePlayerId)} action</p>
              <p className="battlefield-callout">{session.encounter.opponentName}</p>
              <p className="battlefield-callout">Active player {formatActivePlayer(session.turn.activePlayerId)}</p>
            </div>
            <div className="panel inset-panel persistence-panel">
              <div>
                <p className="section-label">Resume controls</p>
                <p className="persistence-status">{saveStatus}</p>
              </div>
              <div className="action-row persistence-actions">
                <button type="button" className="action-button secondary-action" onClick={onSaveEncounter}>
                  Save encounter
                </button>
                {resumeReady ? (
                  <button type="button" className="action-button secondary-action" onClick={onResumeEncounter}>
                    Resume saved encounter
                  </button>
                ) : null}
                <button type="button" className="action-button secondary-action" onClick={onResetEncounter}>
                  Start over
                </button>
                {resumeReady ? <p className="persistence-note">Resume from saved state</p> : null}
              </div>
            </div>
            <div className="battlefield-topline">
              <article className="status-card enemy-status">
                <p className="status-label">Enemy health</p>
                <p className="status-value">{session.players.ai.health}</p>
                <p className="status-note">Enemy nexus {session.players.ai.health}</p>
              </article>
              <article className="status-card player-status">
                <p className="status-label">Player health</p>
                <p className="status-value">{session.players.player.health}</p>
                <p className="status-note">Player nexus {session.players.player.health}</p>
              </article>
            </div>
            <div className="resource-strip" aria-label="Player resources">
              <span>Energy {activePlayer.resources.current}/{activePlayer.resources.max}</span>
              <span>Cards in hand {activePlayer.hand.length}</span>
              <span>Deck {activePlayer.deck.length}</span>
              <span>Discard {activePlayer.discardPile.length}</span>
              <span>{session.turn.activePlayerId === 'player' ? 'Enemy energy' : 'Player energy'} {opposingPlayer.resources.current}/{opposingPlayer.resources.max}</span>
            </div>
            <div className="zone-grid">
              {Object.entries(laneLabels).map(([lane, label]) => (
                <article key={lane} className="panel lane-card">
                  <div className="lane-header">
                    <h2>{label}</h2>
                    <span>{lane === 'frontline' ? 'Pressure lane' : lane === 'support' ? 'Combo setup' : 'Resource engine'}</span>
                  </div>
                  <p className="lane-units">Allied: {formatLaneCards(session.players.player.battlefield[lane as keyof typeof session.players.player.battlefield])}</p>
                  <p className="lane-units">Enemy: {formatLaneCards(session.players.ai.battlefield[lane as keyof typeof session.players.ai.battlefield])}</p>
                </article>
              ))}
            </div>
            <div className="action-row" aria-label="Available actions">
              {legalActions.map((action, index) => (
                <button
                  key={`${action.type}-${index}`}
                  type="button"
                  className={index === 0 ? 'action-button primary-action' : 'action-button secondary-action'}
                  onClick={() => onGameAction(action)}
                >
                  {formatActionLabel(session, action)}
                </button>
              ))}
            </div>
          </section>
          <aside className="panel inset-panel log-panel">
            <h2>Encounter log</h2>
            <ul className="log-list">
              {encounterLog.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </aside>
        </div>
      ) : null}
      {isRulesPage ? (
        <div className="feature-grid rules-grid">
          <article className="panel inset-panel">
            <h2>Set up</h2>
            <p>Both players begin at 20 nexus health and three cards in hand. You open with one energy while the AI starts at zero.</p>
          </article>
          <article className="panel inset-panel">
            <h2>Win condition</h2>
            <p>Win by reducing the rival nexus from 20 health to 0 before they do the same to you.</p>
          </article>
          <article className="panel inset-panel">
            <h2>Turn flow</h2>
            <p>Each turn you draw a card, gain 1 energy, play units or tactics, then attack across three lanes.</p>
          </article>
          <article className="panel inset-panel">
            <h2>Lane combat</h2>
            <p>Unblocked attackers deal their power directly to the enemy nexus.</p>
          </article>
          <article className="panel inset-panel">
            <h2>Deck rhythm</h2>
            <p>Runs are designed around short matches, so mulligan for a one-cost play and your first clean attack lane.</p>
          </article>
        </div>
      ) : null}
      {isCardsPage ? (
        <div className="cards-layout">
          <section className="panel inset-panel cards-section">
            <p className="section-label">Onramp for new players</p>
            <h2>Starter factions and archetypes</h2>
            <div className="feature-grid cards-grid">
              {factions.map((faction) => (
                <article key={faction.name} className="panel inset-panel reference-card">
                  <p className="eyebrow">{faction.archetype}</p>
                  <h3>{faction.name}</h3>
                  <p>{faction.summary}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="panel inset-panel cards-section">
            <p className="section-label">See the pieces</p>
            <h2>Representative cards</h2>
            <div className="card-gallery">
              {cards.map((card) => (
                <article key={card.name} className="panel inset-panel tcg-card">
                  <div className="tcg-card-header">
                    <div>
                      <p className="eyebrow">{card.faction}</p>
                      <h3>{card.name}</h3>
                    </div>
                    <span className="cost-badge">{card.cost}</span>
                  </div>
                  <p className="type-line">{card.typeLine}</p>
                  {card.stats ? <p className="stats-line">{card.stats} combat stats</p> : null}
                  <p>{card.text}</p>
                  <p className="card-role">{card.role}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="panel inset-panel cards-section">
            <p className="section-label">How to decode a card</p>
            <h2>Card anatomy</h2>
            <div className="feature-grid anatomy-grid">
              <article className="panel inset-panel reference-card">
                <h3>Cost</h3>
                <p>Cost controls how early you can deploy a card.</p>
              </article>
              <article className="panel inset-panel reference-card">
                <h3>Type and lane role</h3>
                <p>Type lines tell you which lane a unit favors or whether a tactic resolves instantly.</p>
              </article>
              <article className="panel inset-panel reference-card">
                <h3>Traits</h3>
                <p>Traits hint at faction synergies and deckbuilding hooks.</p>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function App() {
  const route = useRoute();
  const [storage] = useState(() => createGameStorage(window.localStorage, runId));
  const [session, setSession] = useState<GameSession>(() => storage.load() ?? createGameSession({ encounterId }));
  const [resumeReady, setResumeReady] = useState<boolean>(() => storage.load() !== null);
  const [saveStatus, setSaveStatus] = useState<string>(() =>
    storage.load() ? 'Saved encounter loaded' : 'No saved encounter yet'
  );

  const handleGameAction = (action: GameAction) => {
    setSession((currentSession) => {
      if (action.type === 'pass') {
        return endTurn(currentSession);
      }

      return playCard(currentSession, action);
    });
    setResumeReady(storage.load() !== null);
    setSaveStatus(storage.load() ? 'Saved encounter loaded' : 'No saved encounter yet');
  };

  const handleSaveEncounter = () => {
    storage.save(session);
    setResumeReady(true);
    setSaveStatus('Saved current encounter');
  };

  const handleResumeEncounter = () => {
    const savedSession = storage.load();

    if (!savedSession) {
      return;
    }

    setSession(savedSession);
    setResumeReady(true);
    setSaveStatus('Resumed saved encounter');
  };

  const handleResetEncounter = () => {
    storage.clear();
    setSession(createGameSession({ encounterId }));
    setResumeReady(false);
    setSaveStatus('Started a fresh encounter');
  };

  useEffect(() => {
    const page = pages.find((entry) => entry.key === route) ?? pages[0];
    const descriptionTag = document.querySelector('meta[name="description"]');

    document.title = `${page.title} - Duel TCG`;

    if (descriptionTag) {
      descriptionTag.setAttribute('content', page.description);
    }
  }, [route]);

  return (
    <div className="app-shell">
      <header className="site-header panel">
        <div>
          <p className="wordmark">Duel TCG</p>
          <p className="subhead">A polished static card battler for a nested-path deployment.</p>
        </div>
        <nav aria-label="Primary">
          <ul className="nav-list">
            {pages.map((page) => (
              <li key={page.key}>
                <a className={page.key === route ? 'nav-link active' : 'nav-link'} href={page.href}>
                  {page.navLabel}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        <ActivePage
          route={route}
          session={session}
          onGameAction={handleGameAction}
          onResetEncounter={handleResetEncounter}
          onResumeEncounter={handleResumeEncounter}
          onSaveEncounter={handleSaveEncounter}
          resumeReady={resumeReady}
          saveStatus={saveStatus}
        />
      </main>
    </div>
  );
}
