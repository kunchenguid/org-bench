import { useEffect, useState } from 'preact/hooks';
import {
  encounters,
  factions,
  keywordGlossary,
  starterDeck,
  uniqueCards
} from './content/gameData';
import { createDuelState, playCard, type DuelState } from './game/state';
import { loadDuelState, saveDuelState } from './game/persistence';

type Route = 'home' | 'play' | 'rules' | 'cards';

const STORAGE_NAMESPACE = 'oracle-seed-01';

const routes: Record<string, Route> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards'
};

function getRoute(): Route {
  return routes[window.location.hash] ?? 'home';
}

function RouteLink(props: {
  href: string;
  children: string;
  onNavigate: (route: Route, href: string) => void;
}) {
  return (
    <a
      class="nav-link"
      href={props.href}
      onClick={(event) => {
        event.preventDefault();
        props.onNavigate(routes[props.href] ?? 'home', props.href);
      }}
    >
      {props.children}
    </a>
  );
}

function getFactionTheme(factionId: string) {
  if (factionId === 'ember') {
    return {
      accent: '#ff8a5b',
      accentSoft: 'rgba(255, 138, 91, 0.2)',
      panel: 'linear-gradient(180deg, rgba(60, 18, 16, 0.96), rgba(25, 11, 14, 0.96))',
      art: 'radial-gradient(circle at 30% 30%, rgba(255, 208, 118, 0.9), rgba(255, 110, 77, 0.28) 36%, rgba(17, 7, 14, 0.95) 76%)'
    };
  }

  return {
    accent: '#66d6ff',
    accentSoft: 'rgba(102, 214, 255, 0.2)',
    panel: 'linear-gradient(180deg, rgba(10, 28, 43, 0.96), rgba(8, 12, 25, 0.96))',
    art: 'radial-gradient(circle at 30% 30%, rgba(109, 214, 255, 0.82), rgba(70, 119, 255, 0.24) 34%, rgba(6, 12, 28, 0.95) 76%)'
  };
}

function CardArt(props: { factionId: string }) {
  if (props.factionId === 'ember') {
    return (
      <svg viewBox="0 0 160 110" class="card-art-svg" aria-hidden="true">
        <circle cx="58" cy="42" r="26" fill="rgba(255, 211, 132, 0.88)" />
        <path d="M38 90L78 20L98 64L122 32L138 90H38Z" fill="rgba(255, 122, 87, 0.82)" />
        <path d="M62 86L84 46L97 70L116 42L126 86H62Z" fill="rgba(255, 245, 225, 0.7)" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 160 110" class="card-art-svg" aria-hidden="true">
      <circle cx="54" cy="36" r="18" fill="rgba(182, 230, 255, 0.9)" />
      <path d="M18 78C38 50 58 38 80 40C98 42 118 56 142 40V90H18V78Z" fill="rgba(72, 164, 255, 0.7)" />
      <path d="M18 86C42 66 62 58 86 60C110 62 126 72 142 64V90H18V86Z" fill="rgba(58, 235, 220, 0.48)" />
      <path d="M76 20L90 44L118 48L98 66L102 92L76 78L50 92L54 66L34 48L62 44L76 20Z" fill="rgba(214, 247, 255, 0.72)" />
    </svg>
  );
}

function CardView(props: {
  card: (typeof uniqueCards)[number];
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = getFactionTheme(props.card.faction);

  const content = (
    <article
      class="card-frame"
      style={{
        '--card-accent': theme.accent,
        '--card-accent-soft': theme.accentSoft,
        '--card-panel': theme.panel,
        '--card-art': theme.art
      }}
    >
      <header class="card-header">
        <div>
          <p class="card-faction">{props.card.faction}</p>
          <h2>{props.card.name}</h2>
        </div>
        <span class="card-cost">{props.card.cost}</span>
      </header>
      <div class="card-art">
        <CardArt factionId={props.card.faction} />
      </div>
      <div class="card-type-row">
        <span>{props.card.type}</span>
        <span>{factions.find((faction) => faction.id === props.card.faction)?.name}</span>
      </div>
      <p class="card-rules">{props.card.text}</p>
      {props.card.attack !== undefined && props.card.health !== undefined ? (
        <div class="card-stats">
          <span>{props.card.attack}</span>
          <span>{props.card.health}</span>
        </div>
      ) : (
        <div class="card-spell-badge">Spellcraft</div>
      )}
    </article>
  );

  if (props.actionLabel && props.onAction) {
    return (
      <button class="card-button" type="button" aria-label={props.actionLabel} onClick={props.onAction}>
        {content}
      </button>
    );
  }

  return content;
}

function ZoneSummary(props: {
  label: string;
  count: number;
  icon: string;
  tone?: 'player' | 'enemy';
}) {
  return (
    <div class={`zone-summary ${props.tone ?? 'player'}`}>
      <span class="zone-icon">{props.icon}</span>
      <div>
        <p>{props.label}</p>
        <strong>{props.count}</strong>
      </div>
    </div>
  );
}

function PageContent(props: { route: Route }) {
  const [duel, setDuel] = useState<DuelState>(() => ({
    ...(loadDuelState(window.localStorage, STORAGE_NAMESPACE, encounters[0].id) ??
      createDuelState(STORAGE_NAMESPACE, encounters[0].id)),
    phase: 'main' as const
  }));

  useEffect(() => {
    saveDuelState(window.localStorage, duel);
  }, [duel]);

  if (props.route === 'play') {
    return (
      <section class="panel play-panel">
        <h1>Play</h1>
        <div class="turn-banner">
          <div>
            <p class="eyebrow">Current encounter</p>
            <strong>{encounters[0].name}</strong>
          </div>
          <div class="turn-pill">
            Turn {duel.turnNumber} - {duel.phase}
          </div>
        </div>

        <div class="combatant-strip enemy-strip">
          <div>
            <p class="eyebrow">Enemy health</p>
            <strong>{duel.opponent.health}</strong>
          </div>
          <div>
            <p class="eyebrow">Enemy resources</p>
            <strong>
              {duel.opponent.resources.current}/{duel.opponent.resources.max}
            </strong>
            <p>Resources: {duel.opponent.resources.current}/{duel.opponent.resources.max}</p>
          </div>
          <div>
            <p class="eyebrow">Enemy hand</p>
            <strong>{duel.opponent.hand.length}</strong>
          </div>
        </div>

        <div class="battle-lane enemy-lane">
          <div class="battlefield-header">Enemy battlefield</div>
          <div class="empty-battlefield">No enemy units deployed yet.</div>
        </div>

        <div class="zone-row">
          <ZoneSummary label="Enemy deck" count={duel.opponent.deck.length} icon="🂠" tone="enemy" />
          <ZoneSummary label="Enemy discard" count={duel.opponent.discard.length} icon="✦" tone="enemy" />
          <ZoneSummary label="Your discard" count={duel.player.discard.length} icon="✦" />
          <ZoneSummary label="Your deck" count={duel.player.deck.length} icon="🂠" />
        </div>

        <div class="battle-lane player-lane">
          <div class="battlefield-header">Your battlefield</div>
          <div class="empty-battlefield">Play creatures here to pressure the enemy hero.</div>
        </div>

        <div class="combatant-strip player-strip">
          <div>
            <p class="eyebrow">Your health</p>
            <strong>{duel.player.health}</strong>
          </div>
          <div>
            <p class="eyebrow">Your resources</p>
            <strong>
              {duel.player.resources.current}/{duel.player.resources.max}
            </strong>
            <p>Resources: {duel.player.resources.current}/{duel.player.resources.max}</p>
          </div>
          <div>
            <p class="eyebrow">Your hand</p>
            <strong>{duel.player.hand.length}</strong>
          </div>
        </div>

        <div class="hand-row">
          {duel.player.hand.map((card) => (
            <CardView
              key={card.instanceId}
              card={card}
              actionLabel={`Play ${card.name}`}
              onAction={() => setDuel((current) => playCard(current, 'player', card.instanceId))}
            />
          ))}
        </div>
      </section>
    );
  }

  if (props.route === 'rules') {
    return (
      <section class="panel">
        <h1>Rules</h1>
        <p>
          Core keywords are already pinned down for the playable build:{' '}
          {keywordGlossary.map((entry) => entry.keyword).join(', ')}.
        </p>
        <p>
          Rules prototype for turn flow, resources, and card types. The public
          rules page will teach these mechanics in full next.
        </p>
      </section>
    );
  }

  if (props.route === 'cards') {
    return (
      <section class="panel">
        <h1>Cards</h1>
        <p>
          The shared card pool currently spans {uniqueCards.length} unique cards
          across {factions.map((faction) => faction.name).join(' and ')}.
        </p>
        <div class="card-gallery">
          {uniqueCards.map((card) => (
            <CardView key={card.id} card={card} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section class="hero panel">
      <p class="eyebrow">Single-player tactical card duels</p>
      <h1>Shards of the Veil</h1>
      <p>
        Prototype home page for the public-facing duel TCG site scaffold.
      </p>
      <p>
        Two factions, {uniqueCards.length} illustrated cards, and a three-step
        duel ladder are now defined in shared content data for the full site.
      </p>
    </section>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(getRoute());

  const navigate = (nextRoute: Route, href: string) => {
    window.history.pushState(null, '', href);
    setRoute(nextRoute);
  };

  useEffect(() => {
    if (!window.location.hash) {
      navigate('home', '#/');
    }

    const syncRoute = () => setRoute(getRoute());
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  return (
    <div class="app-shell">
      <header class="site-header">
        <a class="brand" href="#/">
          <span class="brand-mark">SV</span>
          <span>Shards of the Veil</span>
        </a>
        <nav class="site-nav" aria-label="Primary">
          <RouteLink href="#/" onNavigate={navigate}>Home</RouteLink>
          <RouteLink href="#/play" onNavigate={navigate}>Play</RouteLink>
          <RouteLink href="#/rules" onNavigate={navigate}>Rules</RouteLink>
          <RouteLink href="#/cards" onNavigate={navigate}>Cards</RouteLink>
        </nav>
      </header>
      <main class="site-main">
        <PageContent route={route} />
      </main>
    </div>
  );
}
