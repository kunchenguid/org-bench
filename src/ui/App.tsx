import { useEffect, useMemo, useState } from 'preact/hooks';

type Route = 'home' | 'play' | 'rules' | 'cards';

type NavItem = {
  route: Route;
  label: string;
};

type RulesSection = {
  title: string;
  body: string;
  bullets?: string[];
};

const navItems: NavItem[] = [
  { route: 'home', label: 'Home' },
  { route: 'play', label: 'Play' },
  { route: 'rules', label: 'How to Play' },
  { route: 'cards', label: 'Card Gallery' },
];

const rulesSections: RulesSection[] = [
  {
    title: 'Turn flow',
    body:
      'Each encounter follows a clean cadence. Start your turn by readying your board, draw back into options, spend your energy, then send creatures into combat before the enemy answers on its turn.',
    bullets: [
      'Ready all exhausted cards, then resolve any start-of-turn effects.',
      'Draw one card and gain your turn energy refill.',
      'Play creatures and spells in any order while you can afford them.',
      'Declare attacks, resolve blockers, and finish end-of-turn effects before passing play.',
    ],
  },
  {
    title: 'Resources',
    body:
      'Energy is the resource that lets a hand become a board. You refresh your energy each turn, so the core decision is whether to commit pressure now or hold enough back to answer the next swing.',
    bullets: [
      'Every card shows its energy cost in the top corner.',
      'Unspent energy disappears at the end of your turn.',
      'A cheaper curve lets you establish tempo early, while expensive cards swing a duel if you survive long enough to cast them.',
    ],
  },
  {
    title: 'Creature cards and spell cards',
    body:
      'Creatures stay on the battlefield and win combat through repeated pressure. Spells resolve once, deliver their effect, then leave play. Good decks mix durable board presence with precise spell timing.',
    bullets: [
      'Creatures enter your battlefield with attack and health values that matter every turn.',
      'Spells can deal burst damage, protect a creature, disrupt the enemy, or change the state of combat.',
      'If a card breaks parity the turn you cast it, it usually belongs in your hand plan for that matchup.',
    ],
  },
  {
    title: 'Combat',
    body:
      'Combat is where the duel actually tilts. Attack with any ready creatures, let the defender assign blockers, then deal damage simultaneously. Surviving creatures remain in play carrying whatever health they have left.',
    bullets: [
      'Unblocked damage hits the opposing champion directly.',
      'When a creature takes damage equal to or greater than its health, it is defeated and removed from the field.',
      'Combat tricks matter because they change trades after attacks are declared, not before.',
    ],
  },
  {
    title: 'Victory and defeat',
    body:
      'Your goal is simple: reduce the opposing champion to zero before they do the same to you. Some encounters pressure with speed, some with attrition, but every duel resolves around preserving just enough life to keep your plan online.',
    bullets: [
      'You win immediately when the enemy champion reaches zero health.',
      'You lose immediately when your champion reaches zero health.',
      'If your deck runs low, card advantage still matters because fewer answers means worse future turns.',
    ],
  },
  {
    title: 'Encounter progression',
    body:
      'The campaign is a short ascent, not an endless ladder. Clear one encounter to unlock the next, with each opponent asking for cleaner sequencing and a sharper read on when to race versus when to defend.',
    bullets: [
      'Early fights teach the base rhythm of energy, board presence, and blocking.',
      'Later encounters introduce tighter pressure and demand more disciplined card timing.',
      'A full run is about surviving the sequence, not farming a single easy duel.',
    ],
  },
  {
    title: 'Save and resume',
    body:
      'Runs are designed to survive an interrupted session. The game stores your campaign state locally so you can close the browser and continue from the same point later without replaying finished encounters.',
    bullets: [
      'Your current encounter progress and cleared fights are saved automatically.',
      'Returning to the game should restore the run state from local storage on this device.',
      'Starting a fresh run replaces the previous in-progress campaign.',
    ],
  },
];

const routeContent: Record<Route, { eyebrow: string; title: string; body: string }> = {
  home: {
    eyebrow: 'Auric Reach // Prologue',
    title: 'A duel game scaffold with room for craft.',
    body:
      'This initial shell establishes the shared visual language, navigation, and deployment-safe routing for the full single-player card game.',
  },
  play: {
    eyebrow: 'Play Surface',
    title: 'Encounter board placeholder',
    body:
      'This route will host the full match UI: battlefield, hands, decks, health, resources, encounters, AI flow, and persistence.',
  },
  rules: {
    eyebrow: 'Field Manual',
    title: 'Rules page placeholder',
    body:
      'This route will explain turn flow, resources, creatures, spells, combat, the encounter ladder, and save-and-resume behavior.',
  },
  cards: {
    eyebrow: 'Vault Archive',
    title: 'Card gallery placeholder',
    body:
      'This route will display the full card library as visual cards, with faction identity, art, stats, and readable rules text.',
  },
};

function getRouteFromHash(hash: string): Route {
  const key = hash.replace(/^#\/?/, '');
  if (key === 'play' || key === 'rules' || key === 'cards') {
    return key;
  }

  return 'home';
}

function setHash(route: Route) {
  window.location.hash = route === 'home' ? '#/' : `#/${route}`;
}

function HeroCard(props: { title: string; subtitle: string; accent: string }) {
  return (
    <article className={`hero-card hero-card-${props.accent}`}>
      <div className="hero-card-art" aria-hidden="true">
        <div className="sigil sigil-outer" />
        <div className="sigil sigil-inner" />
      </div>
      <p>{props.subtitle}</p>
      <h3>{props.title}</h3>
    </article>
  );
}

function RulesPanel() {
  return (
    <section className="page-panel rules-panel">
      <div className="rules-intro">
        <p className="eyebrow">Field Manual</p>
        <h2>How to play the Auric Reach campaign.</h2>
        <p>
          Auric Reach is a single-player duel card game. You build a board, spend energy with
          intent, and navigate a short sequence of encounters where clean combat math and timing
          matter more than flashy turns.
        </p>
      </div>

      <div className="rules-grid">
        {rulesSections.map((section) => (
          <article key={section.title} className="rules-card">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
            {section.bullets ? (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PageSection(props: { route: Route }) {
  const content = routeContent[props.route];

  if (props.route === 'rules') {
    return <RulesPanel />;
  }

  return (
    <section className="page-panel">
      <p className="eyebrow">{content.eyebrow}</p>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      {props.route === 'home' ? (
        <div className="hero-grid">
          <HeroCard title="Ashfall Covenant" subtitle="Aggressive ember faction" accent="ember" />
          <HeroCard title="Verdant Loom" subtitle="Growth and resilience" accent="verdant" />
          <HeroCard title="Three duel ascent" subtitle="A compact encounter ladder" accent="dusk" />
        </div>
      ) : null}
    </section>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const activeItem = useMemo(
    () => navItems.find((item) => item.route === route) ?? navItems[0],
    [route],
  );

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/" onClick={() => setHash('home')}>
          <span className="brand-mark" aria-hidden="true">
            <>✦</>
          </span>
          <span>
            <strong>Duel TCG</strong>
            <small>Auric Reach</small>
          </span>
        </a>
        <nav className="nav" aria-label="Primary">
          {navItems.map((item) => (
            <a
              key={item.route}
              className={item.route === route ? 'is-active' : ''}
              href={item.route === 'home' ? '#/' : `#/${item.route}`}
              onClick={() => setHash(item.route)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="layout">
        <section className="hero-banner">
          <div>
            <p className="eyebrow">Single-player duel TCG</p>
            <h1>Scaffold in place for the full browser campaign.</h1>
            <p>
              The shared shell is live with the four required surfaces and safe nested-path asset
              handling. Workers can now build mechanics and visuals on top of this frame.
            </p>
          </div>
          <aside className="status-card" aria-label="Current route">
            <span className="status-label">Now viewing</span>
            <strong>{activeItem.label}</strong>
            <span className="status-rule">Round 1 shared baseline</span>
          </aside>
        </section>

        <PageSection route={route} />
      </main>
    </div>
  );
}
