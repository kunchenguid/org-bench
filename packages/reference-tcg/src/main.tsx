import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import {
  applyReferenceAppAction,
  createReferenceApp,
  createStarterDeck,
  restoreReferenceApp,
  serializeReferenceApp,
  type Card,
  type CreatureCard,
  type EncounterState,
  type ReferenceAppAction,
  type ReferenceAppState,
} from "./index.js";

declare global {
  interface Window {
    __SKY_DUEL_BOOTSTRAP__?: {
      storageNamespace?: string;
    };
    __ORG_BENCH_STORAGE_NAMESPACE__?: string;
  }
}

const storageNamespace =
  window.__SKY_DUEL_BOOTSTRAP__?.storageNamespace ??
  window.__ORG_BENCH_STORAGE_NAMESPACE__ ??
  document.documentElement.dataset.storageNamespace ??
  "";
const storageKey = `${storageNamespace}reference-app-save`;

function loadApp(): ReferenceAppState {
  const saved = window.localStorage.getItem(storageKey);

  if (!saved) {
    return createReferenceApp();
  }

  try {
    return restoreReferenceApp(saved);
  } catch {
    return createReferenceApp();
  }
}

function saveApp(app: ReferenceAppState) {
  window.localStorage.setItem(storageKey, serializeReferenceApp(app));
}

function clearSavedApp() {
  window.localStorage.removeItem(storageKey);
}

function App() {
  const [app, setApp] = useState<ReferenceAppState>(() => loadApp());
  const galleryCards = useMemo(() => {
    return Array.from(
      new Map(
        [
          ...createStarterDeck(),
          ...app.encounters.flatMap((encounter) => encounter.enemyDeck),
        ].map((card) => [card.name, card]),
      ).values(),
    );
  }, [app.encounters]);

  useEffect(() => {
    saveApp(app);
  }, [app]);

  function dispatch(action: ReferenceAppAction) {
    setApp((current) => applyReferenceAppAction(current, action));
  }

  function resetRun() {
    clearSavedApp();
    setApp(createReferenceApp());
  }

  return (
    <div class="app-shell">
      <style>{styles}</style>
      <header class="hero">
        <div>
          <p class="eyebrow">Single-player tactical card duels</p>
          <h1>Sky Duel TCG</h1>
          <p class="lede">
            Pilot the Ember deck through three Ember versus Sky ladder battles.
            Creatures stay in play, spells hit immediately, and your progress is
            saved locally.
          </p>
        </div>
        <nav aria-label="Primary" class="nav-row">
          <button
            aria-current={app.page === "home" ? "page" : undefined}
            onClick={() => dispatch({ type: "navigate", page: "home" })}
          >
            Home
          </button>
          <button
            aria-current={app.page === "play" ? "page" : undefined}
            onClick={() => dispatch({ type: "navigate", page: "play" })}
          >
            Play
          </button>
          <button
            aria-current={app.page === "rules" ? "page" : undefined}
            onClick={() => dispatch({ type: "navigate", page: "rules" })}
          >
            Rules
          </button>
          <button
            aria-current={app.page === "gallery" ? "page" : undefined}
            onClick={() => dispatch({ type: "navigate", page: "gallery" })}
          >
            Card Gallery
          </button>
        </nav>
      </header>

      <main class="page-stack">
        <div class="save-row">
          <p class="save-pill">
            Save slot: {storageKey || "reference-app-save"}
          </p>
          <button class="secondary-button" onClick={resetRun}>
            Clear Save
          </button>
        </div>
        {app.page === "home" ? (
          <HomePage app={app} dispatch={dispatch} />
        ) : null}
        {app.page === "play" ? (
          <PlayPage app={app} dispatch={dispatch} />
        ) : null}
        {app.page === "rules" ? <RulesPage /> : null}
        {app.page === "gallery" ? <GalleryPage cards={galleryCards} /> : null}
      </main>
    </div>
  );
}

function HomePage(props: {
  app: ReferenceAppState;
  dispatch: (action: ReferenceAppAction) => void;
}) {
  const { app, dispatch } = props;
  const hasSavedEncounter =
    app.encounter !== null && app.activeEncounterIndex !== null;
  const hasCompletedLadder = app.encounters.every(
    (encounter) => encounter.completed,
  );

  return (
    <section class="panel">
      <h2>Home</h2>
      <p>
        Fight three fixed Ember versus Sky encounters in order. Each duel uses a
        20-card deck, starts with 20 health, and ramps resources by turn.
      </p>
      {hasCompletedLadder ? (
        <div class="callout">
          <strong>Ladder complete</strong>
          <p>
            You cleared every Sky Duel encounter. Replay any fight to improve
            your finish or revisit the card pool.
          </p>
        </div>
      ) : null}
      {hasSavedEncounter ? (
        <div class="callout">
          <strong>Saved run ready</strong>
          <p>
            Resume Encounter {app.activeEncounterIndex! + 1} at turn{" "}
            {app.encounter!.turn}.
          </p>
          <button onClick={() => dispatch({ type: "resume-encounter" })}>
            Resume Encounter {app.activeEncounterIndex! + 1}
          </button>
        </div>
      ) : null}
      <div class="encounter-grid">
        {app.encounters.map((encounter, index) => (
          <EncounterCard
            encounter={encounter}
            index={index}
            key={encounter.id}
            previousCompleted={
              index === 0 || app.encounters[index - 1]!.completed
            }
            onStart={() =>
              dispatch({ type: "start-encounter", encounterIndex: index })
            }
          />
        ))}
      </div>
    </section>
  );
}

function EncounterCard(props: {
  encounter: ReferenceAppState["encounters"][number];
  index: number;
  previousCompleted: boolean;
  onStart: () => void;
}) {
  const unlocked = props.previousCompleted;
  const statusLabel = props.encounter.completed
    ? "Completed"
    : unlocked
      ? "Ready"
      : "Locked until you win the previous duel";
  const buttonLabel = unlocked
    ? props.encounter.completed
      ? `Replay Encounter ${props.index + 1}`
      : `Start Encounter ${props.index + 1}`
    : `Locked Encounter ${props.index + 1}`;

  return (
    <article class="encounter-card">
      <p class="encounter-kicker">Encounter {props.index + 1}</p>
      <h3>{props.encounter.title.replace(/^Encounter \d+: /, "")}</h3>
      <p>Enemy: {props.encounter.enemyName}</p>
      <p>Enemy health: {props.encounter.enemyHp}</p>
      <p>Status: {statusLabel}</p>
      <button disabled={!unlocked} onClick={props.onStart}>
        {buttonLabel}
      </button>
    </article>
  );
}

function PlayPage(props: {
  app: ReferenceAppState;
  dispatch: (action: ReferenceAppAction) => void;
}) {
  const { app, dispatch } = props;

  if (!app.encounter || app.activeEncounterIndex === null) {
    return (
      <section class="panel">
        <h2>Play</h2>
        <p>Select an encounter from the home page to begin.</p>
      </section>
    );
  }

  const encounterInfo = app.encounters[app.activeEncounterIndex]!;
  const encounter = app.encounter;
  const canAct = encounter.status === "in-progress";
  const nextEncounter = app.encounters[app.activeEncounterIndex + 1] ?? null;
  const playerAttack = encounter.player.battlefield.reduce(
    (total, card) => total + card.attack,
    0,
  );
  const enemyAttack = encounter.enemy.battlefield.reduce(
    (total, card) => total + card.attack,
    0,
  );

  return (
    <section class="panel duel-layout">
      <div class="duel-header">
        <div>
          <p class="encounter-kicker">Ladder battle</p>
          <h2>{encounterInfo.title}</h2>
          <p>Opponent: {encounterInfo.enemyName}</p>
        </div>
        <div class="status-box">
          <p>Turn: {encounter.turn}</p>
          <p>Active: {encounter.activePlayer}</p>
          <p>
            Resources: {encounter.player.resources.current}/
            {encounter.player.resources.max}
          </p>
          <p>
            Enemy resources: {encounter.enemy.resources.current}/
            {encounter.enemy.resources.max}
          </p>
        </div>
      </div>

      <div class="life-row">
        <StatCard label="Player HP" value={encounter.player.hp} accent="warm" />
        <StatCard label="Enemy HP" value={encounter.enemy.hp} accent="cool" />
      </div>

      <section class="turn-guide" aria-label="Turn guide">
        <strong>Your turn plan</strong>
        <p>
          Play any cards you can afford, then press End Turn. Your full
          battlefield attacks the enemy hero automatically, the AI takes one
          simple response turn, and this duel state is saved for reloads.
        </p>
        <p>
          There are no blockers, instant-speed effects, or hidden reactions in
          Sky Duel.
        </p>
      </section>

      <ResultBanner status={encounter.status} />

      <div class="zone-grid">
        <ZonePanel title="Enemy Battlefield" empty="No enemy creatures yet.">
          <p>Board attack: {enemyAttack}</p>
          {encounter.enemy.battlefield.map((card) => (
            <CreatureChip card={card} key={card.id} />
          ))}
        </ZonePanel>
        <ZonePanel title="Enemy Hand" empty="Unknown cards in hand.">
          <p>{encounter.enemy.hand.length} card(s)</p>
        </ZonePanel>
        <ZonePanel title="Enemy Deck" empty="Deck is empty.">
          <p>{encounter.enemy.deck.length} card(s) remaining</p>
        </ZonePanel>
        <ZonePanel title="Enemy Discard" empty="Discard pile is empty.">
          {encounter.enemy.discard.map((card) => (
            <CardChip card={card} key={card.id} />
          ))}
        </ZonePanel>
        <ZonePanel title="Player Battlefield" empty="Play creatures here.">
          <p>Board attack: {playerAttack}</p>
          {encounter.player.battlefield.map((card) => (
            <CreatureChip card={card} key={card.id} />
          ))}
        </ZonePanel>
        <ZonePanel title="Player Hand" empty="Hand is empty.">
          {encounter.player.hand.map((card) => {
            const disabled = !canPlay(card, encounter);

            return (
              <article class="hand-card" key={card.id}>
                <CardChip card={card} />
                <button
                  disabled={disabled}
                  onClick={() =>
                    dispatch({ type: "play-card", cardId: card.id })
                  }
                >
                  {disabled ? "Not enough resources" : `Play ${card.name}`}
                </button>
              </article>
            );
          })}
        </ZonePanel>
        <ZonePanel title="Player Deck" empty="Deck is empty.">
          <p>{encounter.player.deck.length} card(s) remaining</p>
        </ZonePanel>
        <ZonePanel title="Player Discard" empty="Discard pile is empty.">
          {encounter.player.discard.map((card) => (
            <CardChip card={card} key={card.id} />
          ))}
        </ZonePanel>
      </div>

      <div class="action-row">
        <button
          disabled={!canAct}
          onClick={() => dispatch({ type: "end-turn" })}
        >
          End Turn
        </button>
        <button onClick={() => dispatch({ type: "navigate", page: "rules" })}>
          Review Rules
        </button>
        {!canAct ? (
          <button onClick={() => dispatch({ type: "navigate", page: "home" })}>
            Return to Ladder
          </button>
        ) : null}
        {!canAct && encounter.status === "victory" && nextEncounter ? (
          <button
            onClick={() =>
              dispatch({
                type: "start-encounter",
                encounterIndex: app.activeEncounterIndex! + 1,
              })
            }
          >
            Start Encounter {app.activeEncounterIndex + 2}
          </button>
        ) : null}
      </div>

      <section class="log-panel">
        <h3>Battle Log</h3>
        <ol>
          {encounter.log
            .slice()
            .reverse()
            .map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
        </ol>
      </section>
    </section>
  );
}

function RulesPage() {
  return (
    <section class="panel prose-panel">
      <h2>How to Play</h2>
      <p>
        You command the Ember deck against Sky rivals across the solo ladder.
      </p>
      <p>
        Win by reducing the enemy hero to 0 health before your hero reaches 0.
        Each duel is deterministic: there are no hidden reactions, no stack, and
        no instant-speed tricks.
      </p>
      <h3>Turn Flow</h3>
      <ol>
        <li>
          You start each duel with 20 health, 1 resource, and 4 cards in hand.
        </li>
        <li>At the start of each new player turn, you draw 1 card.</li>
        <li>Your maximum resource equals the current turn number, up to 10.</li>
        <li>Play any cards you can afford from your hand.</li>
        <li>
          Press End Turn. Your battlefield attacks the enemy hero automatically.
        </li>
        <li>
          The AI then draws, spends resources on one card, and attacks back.
        </li>
      </ol>
      <h3>Card Types</h3>
      <p>
        <strong>Creatures</strong> stay on the battlefield and add their attack
        to your damage every turn. <strong>Spells</strong> resolve immediately,
        deal direct damage, then move to the discard pile.
      </p>
      <p>
        Combat goes straight to the opposing hero in this version. Creatures do
        not block, intercept, or trade damage with each other, so the game stays
        fast and deterministic.
      </p>
      <h3>Zones</h3>
      <p>
        Deck holds future draws. Hand holds playable cards. Battlefield keeps
        your active creatures. Discard stores used spells and any cards the
        engine sends out of play.
      </p>
      <h3>Solo Ladder</h3>
      <p>
        The campaign has three fixed encounters. Win a duel to unlock the next
        encounter on the ladder. If you lose, you can immediately retry that
        same battle from the home page.
      </p>
      <p>
        Your save also tracks which encounters are cleared, so reloading the
        site brings you back to the same campaign state and lets you resume any
        in-progress duel.
      </p>
      <h3>Persistence</h3>
      <p>
        The current ladder state is stored in browser localStorage. Reloading
        the page restores the same in-progress encounter from the namespaced
        save key.
      </p>
    </section>
  );
}

function GalleryPage(props: { cards: Card[] }) {
  return (
    <section class="panel">
      <h2>Card Gallery</h2>
      <p>
        Reference the full ladder pool here, including the Ember player deck and
        the enemy cards used in the Mist and Aerie encounters.
      </p>
      <div class="gallery-grid">
        {props.cards.map((card) => (
          <article class="gallery-card" key={card.id}>
            <CardChip card={card} />
            {card.type === "creature" ? (
              <p>Creature that sticks on board and attacks every turn.</p>
            ) : (
              <p>Spell that deals {card.damage} direct damage on cast.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ResultBanner(props: { status: EncounterState["status"] }) {
  if (props.status === "in-progress") {
    return null;
  }

  return (
    <div class={`result-banner ${props.status}`}>
      {props.status === "victory"
        ? "Victory - the enemy flagship is down."
        : "Defeat - the rival squadron won this duel."}
    </div>
  );
}

function StatCard(props: {
  label: string;
  value: number;
  accent: "warm" | "cool";
}) {
  return (
    <div class={`stat-card ${props.accent}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ZonePanel(props: {
  title: string;
  empty: string;
  children: preact.ComponentChildren;
}) {
  const hasContent = Array.isArray(props.children)
    ? props.children.length > 0
    : props.children !== null &&
      props.children !== undefined &&
      props.children !== false;

  return (
    <section class="zone-panel">
      <h3>{props.title}</h3>
      <div class="zone-content">
        {hasContent ? props.children : <p>{props.empty}</p>}
      </div>
    </section>
  );
}

function CardChip(props: { card: Card }) {
  const { card } = props;

  return (
    <div class="card-chip">
      <div>
        <strong>{card.name}</strong>
        <p>{card.type === "creature" ? "Creature" : "Spell"}</p>
      </div>
      <div class="card-meta">
        <span>Cost {card.cost}</span>
        {card.type === "creature" ? (
          <span>
            {card.attack}/{card.health}
          </span>
        ) : (
          <span>{card.damage} dmg</span>
        )}
      </div>
    </div>
  );
}

function CreatureChip(props: { card: CreatureCard }) {
  return <CardChip card={props.card} />;
}

function canPlay(card: Card, encounter: EncounterState) {
  return (
    encounter.status === "in-progress" &&
    card.cost <= encounter.player.resources.current
  );
}

const styles = `
:root {
  color-scheme: dark;
  font-family: Inter, system-ui, sans-serif;
  background: #08111f;
  color: #e6eef8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background:
    radial-gradient(circle at top, rgba(245, 158, 11, 0.16), transparent 30%),
    linear-gradient(180deg, #0f172a 0%, #08111f 100%);
}

button {
  border: 0;
  border-radius: 999px;
  padding: 0.8rem 1.1rem;
  font: inherit;
  color: #08111f;
  background: linear-gradient(135deg, #f8b84e 0%, #f97316 100%);
  cursor: pointer;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
}

.hero,
.panel {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(12px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}

.hero {
  display: grid;
  gap: 18px;
  margin-bottom: 18px;
  padding: 24px;
}

.eyebrow,
.encounter-kicker {
  margin: 0 0 8px;
  color: #f8b84e;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
}

.hero h1,
.panel h2,
.panel h3,
.panel p {
  margin-top: 0;
}

.lede {
  max-width: 64ch;
  color: #cbd5e1;
}

.nav-row,
.action-row,
.life-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.page-stack {
  display: grid;
  gap: 18px;
}

.save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.save-pill {
  margin: 0;
  color: #94a3b8;
  font-size: 0.9rem;
}

.secondary-button {
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.28);
}

.panel {
  padding: 24px;
}

.callout,
.status-box,
.turn-guide,
.log-panel,
.zone-panel,
.encounter-card,
.gallery-card,
.stat-card,
.result-banner {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  background: rgba(30, 41, 59, 0.7);
}

.callout,
.status-box,
.turn-guide,
.log-panel,
.result-banner {
  padding: 16px;
}

.turn-guide {
  border-color: rgba(248, 184, 78, 0.28);
  background: rgba(249, 115, 22, 0.08);
}

.turn-guide strong {
  display: block;
  margin-bottom: 8px;
  color: #f8b84e;
}

.turn-guide p:last-child {
  margin-bottom: 0;
}

.encounter-grid,
.gallery-grid,
.zone-grid {
  display: grid;
  gap: 14px;
}

.encounter-grid,
.gallery-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.zone-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.encounter-card,
.gallery-card,
.zone-panel {
  padding: 16px;
}

.duel-layout {
  display: grid;
  gap: 16px;
}

.duel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-card {
  min-width: 160px;
  padding: 16px;
}

.stat-card span,
.card-chip p {
  color: #cbd5e1;
}

.stat-card strong {
  display: block;
  margin-top: 8px;
  font-size: 2rem;
}

.stat-card.warm strong {
  color: #fda4af;
}

.stat-card.cool strong {
  color: #7dd3fc;
}

.result-banner.victory {
  color: #bbf7d0;
}

.result-banner.defeat {
  color: #fecaca;
}

.zone-content {
  display: grid;
  gap: 10px;
}

.card-chip,
.hand-card {
  display: grid;
  gap: 10px;
}

.card-chip {
  padding: 12px;
  border-radius: 16px;
  background: rgba(8, 17, 31, 0.72);
}

.card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  color: #f8b84e;
  font-size: 0.9rem;
}

.log-panel ol,
.prose-panel ol {
  margin: 0;
  padding-left: 1.2rem;
}

@media (max-width: 720px) {
  .app-shell {
    padding: 14px;
  }

  .hero,
  .panel {
    padding: 18px;
    border-radius: 18px;
  }

  .stat-card {
    flex: 1 1 100%;
  }
}
`;

const container = document.getElementById("app");

if (container) {
  render(<App />, container);
}
