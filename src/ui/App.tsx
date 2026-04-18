import { useEffect, useState } from 'preact/hooks';
import { createInitialState, performPlayerAction, resolveEnemyTurn } from '../game';

type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routeMap: Record<string, RouteKey> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards',
};

const routeCopy: Record<RouteKey, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Prototype map',
    title: 'Division A playtest scaffold',
    body: 'Shared shell for home, play, rules, and cards so both divisions can branch from one stable Vite + Preact baseline.',
  },
  play: {
    eyebrow: 'Encounter ladder',
    title: 'Combat loop placeholder',
    body: 'This contested surface will become the final duel board. For now it exposes the primary pillars and a stable mount point.',
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

export function App() {
  const [route, setRoute] = useState<RouteKey>(getRoute);
  const [battle, setBattle] = useState(createInitialState);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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

        <section class="panel panel-board">
          <h2>Division A playtest</h2>
          <p>Rogue AI challenger</p>
          <div class="battle-status">
            <div>
              <span class="eyebrow">Turn state</span>
              <p>{battle.turn === 'player' ? 'Player action' : battle.turn === 'enemy' ? 'AI response' : 'Encounter secured'}</p>
            </div>
            <div>
              <span class="eyebrow">Encounter ladder</span>
              <p>Gate Scout - Rogue Sentinel - Apex Mirror</p>
            </div>
          </div>

          <div class="board-zones">
            <section class="zone">
              <span class="eyebrow">Player rig</span>
              <h3>{battle.player.hp} integrity</h3>
              <p>{battle.player.shielded ? 'Shield charge banked for the counter hit.' : 'No shield charge stored.'}</p>
            </section>
            <section class="zone">
              <span class="eyebrow">Center lane</span>
              <h3>Tempo lane</h3>
              <p>Commit pressure only when the Rogue AI shield line is exposed.</p>
            </section>
            <section class="zone">
              <span class="eyebrow">Rogue AI core</span>
              <h3>{battle.enemy.hp} integrity</h3>
              <p>Opening script favors a shielded read before the heavy swing.</p>
            </section>
          </div>

          <div class="action-row" aria-label="Combat actions">
            <button type="button" onClick={() => handleAction('attack')} disabled={battle.turn !== 'player' || battle.status !== 'active'}>
              Strike for 6
            </button>
            <button type="button" onClick={() => handleAction('defend')} disabled={battle.turn !== 'player' || battle.status !== 'active'}>
              Bank shield
            </button>
          </div>

          <div class="combat-log">
            <span class="eyebrow">Combat log</span>
            <ul>
              {battle.log.slice(-3).map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
        </section>

        <section class="panel">
          <h2>Encounter flow</h2>
          <div class="flow-grid">
            <article>
              <h3>Scout the opener</h3>
              <p>Confirm whether the AI is posturing, shielding, or baiting a bad trade.</p>
            </article>
            <article>
              <h3>Win the tempo pivot</h3>
              <p>Spend one decisive card to flip initiative instead of flooding the lane.</p>
            </article>
            <article>
              <h3>Secure the finisher</h3>
              <p>Close only when the counter-hit is spent and the AI line is exhausted.</p>
            </article>
          </div>
        </section>

        <section class="panel">
          <h2>AI rival reads</h2>
          <p>Rogue Sentinel prefers a shielded open, then snaps into a heavy counter if you overextend on turn two.</p>
          <p>Bait the shield first with a low-cost probe, then punish the heavy swing once the AI spends its answer into the wrong lane.</p>
        </section>

        <section class="panel panel-links">
          <a href="./rules.html">Open standalone rules page</a>
        </section>
      </main>
    </div>
  );
}
