import { useEffect, useState } from 'preact/hooks';
import {
  advanceEncounter,
  createInitialState,
  deserializeBattleState,
  performPlayerAction,
  resolveEnemyTurn,
  serializeBattleState,
} from '../game';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routeMap: Record<string, RouteKey> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards',
};

const encounterSteps = ['Play first card', 'Commit attack lane', 'Bank shield charge'];

const rivalReads = [
  {
    label: 'Opening gambit',
    detail: 'Rogue AI floods the left lane first to force an early shield spend.',
  },
  {
    label: 'Counter window',
    detail: 'Punish the turn after it banks energy instead of pressing damage.',
  },
  {
    label: 'Weak side',
    detail: 'Its right lane stays under-defended until the second combat cycle.',
  },
];

const frontlineCards = [
  {
    name: 'Static Broker',
    text: 'Preconstructed deck opener that converts early energy into a safe first lane.',
  },
  {
    name: 'Glasswall Sentry',
    text: 'Defender body that buys a full turn against the Rogue AI burst line.',
  },
  {
    name: 'Backline Surge',
    text: 'Signal finisher that flips stored shield charge into a clean lethal push.',
  },
];

const saveKey = 'signal-clash-battle-state';

const routeCopy: Record<RouteKey, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Prototype map',
    title: 'Division A playtest scaffold',
    body: 'Shared shell for home, play, rules, and cards so both divisions can branch from one stable Vite + Preact baseline.',
  },
  play: {
    eyebrow: 'Division B vision',
    title: 'Division B tactical board',
    body: 'Lead with readability: show the pilot plan, the frontline cards that matter this turn, and the combat readout the moment pressure shifts.',
  },
  rules: {
    eyebrow: 'Rules reference',
    title: 'Learning surface placeholder',
    body: 'Use the linked rules document as the interim teaching page while the full integrated rules experience is built.',
  },
  cards: {
    eyebrow: 'Card archive',
    title: 'Gallery placeholder',
    body: 'The final card wall will live here with faction frames, art treatments, and full rules text.',
  },
};

function getRoute(): RouteKey {
  if (typeof window === 'undefined') {
    return 'home';
  }

  return routeMap[window.location.hash] ?? 'home';
}

function getSavedBattleState() {
  if (typeof window === 'undefined') {
    return createInitialState();
  }

  const saved = window.localStorage.getItem(saveKey);

  if (!saved) {
    return createInitialState();
  }

  try {
    return deserializeBattleState(saved);
  } catch {
    return createInitialState();
  }
}

export function App() {
  const [route, setRoute] = useState<RouteKey>(getRoute);
  const [battle, setBattle] = useState(getSavedBattleState);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(saveKey, serializeBattleState(battle));
  }, [battle]);

  useEffect(() => {
    if (battle.turn !== 'enemy') {
      return;
    }

    const timer = window.setTimeout(() => {
      setBattle((current) => resolveEnemyTurn(current));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [battle.turn]);

  const copy = routeCopy[route];

  const handleAction = (action: 'attack' | 'defend') => {
    setBattle((current) => performPlayerAction(current, action));
  };

  const handleSave = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(saveKey, serializeBattleState(battle));
  };

  const handleAdvanceEncounter = () => {
    setBattle((current) => advanceEncounter(current));
  };

  return (
    <div class="app-shell">
      <header class="hero">
        <p class="eyebrow">Signal Clash</p>
        <h1>Signal Clash</h1>
        <p class="hero-copy">
          A browser-first duel TCG scaffold with AI rival reads, nested-path-safe assets, and page slots ready for both divisions.
        </p>
        <nav aria-label="Primary">
          <a href="#/">Home</a>
          <a href="#/play">Play</a>
          <a href="#/rules">Rules</a>
          <a href="#/cards">Cards</a>
        </nav>
      </header>

      <main class="layout">
        <section class="panel panel-primary">
          <p class="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </section>

        <section class="panel">
          <h2>Division B tactical board</h2>
          <p>Division A playtest scaffold retained the shell. DivB turns it into a readable board where new players can see the sequence before they commit.</p>
          <ul>
            {encounterSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        <section class="panel">
          <h2>Pilot brief</h2>
          <p>Preconstructed deck: Midrange Voltage. Encounter ladder starts with the Rogue AI and teaches one clean attack pattern before adding harder reads.</p>
          <p>Plan your first cycle around a single defended lane, then pivot once the AI spends its banked response.</p>
        </section>

        <section class="panel">
          <h2>Combat readout</h2>
          <p>AI rival reads - Rogue AI</p>
          <div class="battle-status">
            <div>
              <span class="eyebrow">Turn state</span>
              <p>{battle.turn === 'player' ? 'Player action' : battle.turn === 'enemy' ? 'AI response' : 'Encounter secured'}</p>
            </div>
            <div>
              <span class="eyebrow">Encounter ladder</span>
              <p>{battle.encounterIndex === 0 ? 'Rogue AI challenger live' : 'Apex Mirror live'}</p>
            </div>
          </div>
          <div class="board-zones">
            <section class="zone">
              <span class="eyebrow">Player rig</span>
              <h3>{battle.player.hp} integrity</h3>
              <p>{battle.player.shielded ? 'Shield charge banked.' : 'Shield charge empty.'}</p>
            </section>
            <section class="zone">
              <span class="eyebrow">Rogue AI core</span>
              <h3>{battle.enemy.hp} integrity</h3>
              <p>{battle.log.at(-1)}</p>
            </section>
          </div>
          <div class="action-row" aria-label="Combat actions">
            <button type="button" onClick={() => handleAction('attack')} disabled={battle.turn !== 'player' || battle.status !== 'active'}>
              Strike for 6
            </button>
            <button type="button" onClick={() => handleAction('defend')} disabled={battle.turn !== 'player' || battle.status !== 'active'}>
              Bank shield
            </button>
            <button type="button" onClick={handleSave}>
              Save checkpoint
            </button>
            <button type="button" onClick={handleAdvanceEncounter} disabled={battle.status !== 'won'}>
              Advance encounter
            </button>
          </div>
          <ul>
            {rivalReads.map((read) => (
              <li key={read.label}>
                <strong>{read.label}</strong>: {read.detail}
              </li>
            ))}
          </ul>
        </section>

        <section class="panel">
          <h2>Frontline cards</h2>
          <ul>
            {frontlineCards.map((card) => (
              <li key={card.name}>
                <strong>{card.name}</strong>: {card.text}
              </li>
            ))}
          </ul>
        </section>

        <section class="panel panel-links">
          <a href="./rules.html">Open standalone rules page</a>
        </section>
      </main>
    </div>
  );
}
