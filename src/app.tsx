import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { createEncounterState, endTurn, playCard, type BattlefieldCard, type CardInstance, type GameState } from './game';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

type Route = {
  key: RouteKey;
  title: string;
  href: string;
  eyebrow: string;
  heading: string;
  body: string;
};

const routes: Route[] = [
  {
    key: 'home',
    title: 'Home',
    href: '#/',
    eyebrow: 'Welcome',
    heading: 'Duel TCG',
    body: 'Single-player browser card duels are coming together here. Start from the home page, then head into Play, Rules, or Cards.',
  },
  {
    key: 'play',
    title: 'Play',
    href: '#/play',
    eyebrow: 'Play',
    heading: 'Encounter Table',
    body: 'Start a deterministic Ember Ridge duel, deploy cards from hand, and pass the turn to watch the AI answer immediately.',
  },
  {
    key: 'rules',
    title: 'Rules',
    href: '#/rules',
    eyebrow: 'Rules',
    heading: 'How to Play',
    body: 'Each turn increases your mana, draws a card, and lets you deploy creatures or direct-damage spells. When you end your turn, the encounter AI plays the first legal card in hand and attacks with its battlefield.',
  },
  {
    key: 'cards',
    title: 'Cards',
    href: '#/cards',
    eyebrow: 'Cards',
    heading: 'Card Gallery',
    body: 'Ash Striker and Cinder Mage pressure the opponent, while Ember Bolt deals direct damage. The Ember Ridge encounter answers with Stoneguard Sentinel and Quarry Scout.',
  },
];

const rulesSteps = [
  'Gain 1 mana crystal and refill your mana at the start of your turn.',
  'Draw 1 card, then spend mana to deploy creatures or cast spells.',
  'Creatures stay on the board and threaten damage every round they survive.',
  'Reduce the enemy champion from 20 health to 0 to win the duel.',
];

const starterCardPool = ['Emberblade Knight', 'Ash Striker', 'Ember Bolt', 'Cinder Mage'];
const starterDecks = ['Solar Vanguard', 'Grave Bloom', 'Ember Ridge Patrol'];
const encounterLadder = ['Ember Ridge', 'Ashen Falls', 'Cinder Harbor'];
const encounterStorageKey = `${import.meta.env.BASE_URL}duel-tcg:active-encounter`;

type SavedEncounterPreview = {
  encounterName: string;
  turn: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isCardInstance(value: unknown): value is CardInstance {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name) || !isString(value.text)) {
    return false;
  }

  if (!isNumber(value.cost) || (value.type !== 'creature' && value.type !== 'spell')) {
    return false;
  }

  if (value.type === 'creature') {
    return isNumber(value.attack) && isNumber(value.health);
  }

  return isNumber(value.damage);
}

function isBattlefieldCard(value: unknown): value is BattlefieldCard {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.text) &&
    value.type === 'creature' &&
    isNumber(value.cost) &&
    isNumber(value.attack) &&
    isNumber(value.health) &&
    isNumber(value.currentHealth)
  );
}

function isManaState(value: unknown): value is GameState['player']['mana'] {
  return isRecord(value) && isNumber(value.current) && isNumber(value.max);
}

function isSideState(value: unknown): value is GameState['player'] {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isNumber(value.health) &&
    isManaState(value.mana) &&
    Array.isArray(value.deck) &&
    value.deck.every(isCardInstance) &&
    Array.isArray(value.hand) &&
    value.hand.every(isCardInstance) &&
    Array.isArray(value.discard) &&
    value.discard.every(isCardInstance) &&
    Array.isArray(value.battlefield) &&
    value.battlefield.every(isBattlefieldCard)
  );
}

function isGameState(value: unknown): value is GameState {
  return (
    isRecord(value) &&
    isString(value.encounterName) &&
    isNumber(value.turn) &&
    (value.currentPlayer === 'player' || value.currentPlayer === 'opponent') &&
    isSideState(value.player) &&
    isSideState(value.opponent) &&
    Array.isArray(value.log) &&
    value.log.every(isString)
  );
}

function getRouteFromHash(hash: string): Route {
  const normalized = hash.replace(/^#/, '') || '/';
  const match = routes.find((route) => route.href.replace(/^#/, '') === normalized);
  return match ?? routes[0];
}

function formatHandCard(card: CardInstance): string {
  return card.type === 'creature' ? `${card.name} ${card.attack}/${card.health}` : `${card.name} spell`;
}

function renderBattlefieldCard(card: BattlefieldCard) {
  return (
    <li className="card-tile" key={card.id}>
      <strong>{card.name}</strong>
      <span>
        {card.attack}/{card.currentHealth}
      </span>
    </li>
  );
}

function loadSavedEncounter(): GameState | null {
  const serialized = window.localStorage.getItem(encounterStorageKey);
  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isGameState(parsed)) {
      window.localStorage.removeItem(encounterStorageKey);
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(encounterStorageKey);
    return null;
  }
}

function getSavedEncounterPreview(): SavedEncounterPreview | null {
  const savedState = loadSavedEncounter();
  if (!savedState) {
    return null;
  }

  return {
    encounterName: savedState.encounterName,
    turn: savedState.turn,
  };
}

function clearSavedEncounter() {
  window.localStorage.removeItem(encounterStorageKey);
}

function RulesPanel() {
  return (
    <main className="panel stack-lg">
      <p className="eyebrow">Rules</p>
      <h2>How to Play</h2>
      <p>Each turn follows the same rhythm:</p>
      <ul className="log-list">
        {rulesSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </main>
  );
}

function CardsPanel() {
  return (
    <main className="panel stack-lg">
      <p className="eyebrow">Cards</p>
      <h2>Card Gallery</h2>

      <section className="zone">
        <div className="zone-header">
          <h3>Starter card pool</h3>
          <span>Core cards</span>
        </div>
        <ul className="log-list">
          {starterCardPool.map((card) => (
            <li key={card}>{card}</li>
          ))}
        </ul>
      </section>

      <section className="zone">
        <div className="zone-header">
          <h3>Starter decks</h3>
          <span>First encounters</span>
        </div>
        <ul className="log-list">
          {starterDecks.map((deck) => (
            <li key={deck}>{deck}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function PlayPanel() {
  const [state, setState] = useState<GameState | null>(null);
  const [savedPreview, setSavedPreview] = useState<SavedEncounterPreview | null>(() => getSavedEncounterPreview());

  useEffect(() => {
    if (!state) {
      return;
    }

    window.localStorage.setItem(encounterStorageKey, JSON.stringify(state));
    setSavedPreview({
      encounterName: state.encounterName,
      turn: state.turn,
    });
  }, [state]);

  if (!state) {
    return (
      <section className="panel stack-lg">
        <p className="eyebrow">Play</p>
        <h2>Encounter Table</h2>
        <p>
          Start the first encounter to validate the full gameplay loop: opening hand, mana, battlefield,
          discard, and a deterministic AI answer when you pass.
        </p>
        <section className="zone">
          <div className="zone-header">
            <h3>Encounter ladder</h3>
            <span>Progression path</span>
          </div>
          <ol className="log-list ladder-list">
            {encounterLadder.map((encounter, index) => (
              <li key={encounter}>
                Act {index + 1}: {encounter}
                {savedPreview?.encounterName === encounter ? <span className="checkpoint-pill">Current checkpoint</span> : null}
              </li>
            ))}
          </ol>
        </section>
        <section className="zone">
          <div className="zone-header">
            <h3>Resume plan</h3>
            <span>Browser persistence</span>
          </div>
          <p>Resume data is stored under `{encounterStorageKey}` so this run stays isolated from other benchmark paths.</p>
          {savedPreview ? (
            <>
              <p>
                Saved run: {savedPreview.encounterName} on turn {savedPreview.turn}.
              </p>
              <div className="action-row">
                <button className="primary-button" onClick={() => setState(loadSavedEncounter())} type="button">
                  Resume encounter
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    clearSavedEncounter();
                    setSavedPreview(null);
                  }}
                  type="button"
                >
                  Clear saved run
                </button>
              </div>
            </>
          ) : null}
        </section>
        <button className="primary-button" onClick={() => setState(createEncounterState())} type="button">
          Start Ember Ridge encounter
        </button>
      </section>
    );
  }

  return (
    <section className="panel stack-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Play</p>
          <h2>{state.encounterName}</h2>
        </div>
        <div className="action-row">
          <div className="turn-pill">Turn {state.turn} - Your turn</div>
          <button className="secondary-button" onClick={() => setState(null)} type="button">
            Return to encounter table
          </button>
        </div>
      </div>

      <div className="score-grid" role="list">
        <div className="score-card" role="listitem">
          <span className="score-label">Your health: {state.player.health}</span>
          <strong>{state.player.health}</strong>
          <span>
            Mana {state.player.mana.current}/{state.player.mana.max}
          </span>
        </div>
        <div className="score-card" role="listitem">
          <span className="score-label">Enemy health: {state.opponent.health}</span>
          <strong>{state.opponent.health}</strong>
          <span>
            Mana {state.opponent.mana.current}/{state.opponent.mana.max}
          </span>
        </div>
      </div>

      <div className="zone-grid">
        <section className="zone">
          <div className="zone-header">
            <h3>Hand</h3>
            <span>{state.player.hand.length} cards</span>
          </div>
          <ul className="card-list">
            {state.player.hand.map((card) => {
              const playable = card.cost <= state.player.mana.current;

              return (
                <li className="card-tile" key={card.id}>
                  <div>
                    <strong>{formatHandCard(card)}</strong>
                    <p>{card.text}</p>
                  </div>
                  <button
                    disabled={!playable}
                    onClick={() => setState((current) => (current ? playCard(current, 'player', card.id) : current))}
                    type="button"
                  >
                    Play {card.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="zone">
          <div className="zone-header">
            <h3>Battlefield</h3>
            <span>{state.player.battlefield.length} deployed</span>
          </div>
          <ul className="card-list">{state.player.battlefield.map(renderBattlefieldCard)}</ul>
        </section>

        <section className="zone">
          <div className="zone-header">
            <h3>Enemy battlefield</h3>
            <span>{state.opponent.battlefield.length} deployed</span>
          </div>
          <ul className="card-list">{state.opponent.battlefield.map(renderBattlefieldCard)}</ul>
        </section>

        <section className="zone zone-meta">
          <div className="zone-header">
            <h3>Zones</h3>
            <span>State snapshot</span>
          </div>
          <p>Deck {state.player.deck.length}</p>
          <p>Discard {state.player.discard.length}</p>
          <p>Enemy deck {state.opponent.deck.length}</p>
          <p>Enemy discard {state.opponent.discard.length}</p>
          <button className="primary-button" onClick={() => setState((current) => (current ? endTurn(current) : current))} type="button">
            End turn
          </button>
        </section>
      </div>

      <section className="zone">
        <div className="zone-header">
          <h3>Battle log</h3>
          <span>{state.log.length} events</span>
        </div>
        <ul className="log-list">
          {state.log.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

export function App() {
  const [hash, setHash] = useState(window.location.hash);

  useLayoutEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const route = getRouteFromHash(hash);

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Static Duel TCG</p>
        <h1>Duel TCG</h1>
        <p className="lede">A polished single-player card game site, built to run entirely in the browser.</p>
      </header>

      <nav aria-label="Primary" className="nav">
        {routes.map((item) => (
          <a
            aria-current={item.key === route.key ? 'page' : undefined}
            className={item.key === route.key ? 'nav-link active' : 'nav-link'}
            href={item.href}
            key={item.key}
          >
            {item.title}
          </a>
        ))}
      </nav>

      {route.key === 'play' ? (
        <PlayPanel />
      ) : route.key === 'rules' ? (
        <RulesPanel />
      ) : route.key === 'cards' ? (
        <CardsPanel />
      ) : (
        <main className="panel">
          <p className="eyebrow">{route.eyebrow}</p>
          <h2>{route.heading}</h2>
          <p>{route.body}</p>
        </main>
      )}
    </div>
  );
}
