import { useEffect, useMemo, useState } from 'preact/hooks';

type PageId = 'home' | 'play' | 'rules' | 'cards';
type FactionId = 'emberwake' | 'graveglass' | 'stormforged';

type PageDefinition = {
  id: PageId;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
};

type FactionDefinition = {
  id: FactionId;
  name: string;
  title: string;
  summary: string;
};

type CardDefinition = {
  name: string;
  faction: FactionId;
  kind: string;
  cost: number;
  text: string;
  art: string;
};

type AppProps = {
  storageNamespace?: string;
};

type SavedAppState = {
  currentPage: PageId;
};

const pages: PageDefinition[] = [
  {
    id: 'home',
    label: 'Home',
    eyebrow: 'Single-player tactical duels',
    title: 'Duel of Embers',
    body:
      'Climb a short ladder of readable card battles where every faction, effect, and win condition is visible before you press play.',
  },
  {
    id: 'play',
    label: 'Play',
    eyebrow: 'Encounter ladder',
    title: 'Play The First Duel',
    body:
      'The duel table will use the same visual language as the site: bold faction cues, clear turn prompts, and state changes that never hide the next best action.',
  },
  {
    id: 'rules',
    label: 'Rules',
    eyebrow: 'Learn in two minutes',
    title: 'How To Play',
    body:
      'Read the turn, read the board, and act with confidence. The guide mirrors the same lanes, card frames, and outcome states that appear during play.',
  },
  {
    id: 'cards',
    label: 'Cards',
    eyebrow: 'Visual card gallery',
    title: 'Card Archive',
    body:
      'Browse the starter archive with the same frames, costs, and rules text that appear in the live duel surface.',
  },
];

const factions: FactionDefinition[] = [
  {
    id: 'emberwake',
    name: 'Emberwake Covenant',
    title: 'Aggressive fire duels',
    summary: 'Fast pressure, direct damage, and decisive finishing turns.',
  },
  {
    id: 'graveglass',
    name: 'Graveglass Syndicate',
    title: 'Calculated attrition',
    summary: 'Fragile-looking pieces that return value, drain tempo, and punish sloppy trades.',
  },
  {
    id: 'stormforged',
    name: 'Stormforged Circle',
    title: 'Tempo and positioning',
    summary: 'Shielded units, clean resets, and tricks that reopen the board at the perfect moment.',
  },
];

const cards: CardDefinition[] = [
  {
    name: 'Ashen Duelist',
    faction: 'emberwake',
    kind: 'Unit',
    cost: 2,
    text: 'Rush. When this enters, deal 1 damage to the enemy champion.',
    art: 'A duelist stepping through a curtain of sparks with a blade held low.',
  },
  {
    name: 'Cinder Volley',
    faction: 'emberwake',
    kind: 'Spell',
    cost: 3,
    text: 'Deal 3 damage. If you attacked this turn, deal 4 instead.',
    art: 'A fan of burning sigils crossing the arena like thrown knives.',
  },
  {
    name: 'Mirror Cryptkeeper',
    faction: 'graveglass',
    kind: 'Unit',
    cost: 3,
    text: 'When another ally falls, gain 1 crystal next turn.',
    art: 'A masked archivist guarding a shelf of luminous bone mirrors.',
  },
  {
    name: 'Debt Collector',
    faction: 'graveglass',
    kind: 'Spell',
    cost: 2,
    text: 'Exhaust an enemy unit. Draw a card if it was already damaged.',
    art: 'A silver ledger chained to a gauntlet over a table of ash.',
  },
  {
    name: 'Tempest Sigil',
    faction: 'stormforged',
    kind: 'Relic',
    cost: 1,
    text: 'Your first spell each turn costs 1 less crystal.',
    art: 'A brass sigil floating inside a storm cell above the board.',
  },
  {
    name: 'Skybreak Adept',
    faction: 'stormforged',
    kind: 'Unit',
    cost: 4,
    text: 'Guard. When this survives combat, return a spell from your discard to hand.',
    art: 'A robed sentinel calling lightning through a split obsidian spear.',
  },
];

const pageLookup = Object.fromEntries(pages.map((page) => [page.id, page])) as Record<
  PageId,
  PageDefinition
>;

function normalizeHash(hash: string): PageId {
  const raw = hash.replace(/^#\/?/, '').trim().toLowerCase();
  return raw in pageLookup ? (raw as PageId) : 'home';
}

function canonicalHash(pageId: PageId): string {
  return pageId === 'home' ? '#/' : `#/${pageId}`;
}

function resolveStorageNamespace(storageNamespace?: string): string {
  if (storageNamespace) {
    return storageNamespace;
  }

  const globalNamespace = (window as Window & {
    __DUEL_OF_EMBERS_STORAGE_NAMESPACE__?: string;
    __ORG_BENCH_STORAGE_NAMESPACE__?: string;
  }).__DUEL_OF_EMBERS_STORAGE_NAMESPACE__;

  const fallbackNamespace = (window as Window & {
    __ORG_BENCH_STORAGE_NAMESPACE__?: string;
  }).__ORG_BENCH_STORAGE_NAMESPACE__;

  return globalNamespace || fallbackNamespace || 'duel-of-embers';
}

function storageKey(namespace: string): string {
  return `${namespace}:duel-of-embers:app`;
}

function loadSavedPage(namespace: string): PageId | null {
  const raw = window.localStorage.getItem(storageKey(namespace));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedAppState>;
    if (parsed.currentPage && parsed.currentPage in pageLookup) {
      return parsed.currentPage as PageId;
    }
  } catch {
    return null;
  }

  return null;
}

function savePage(namespace: string, currentPage: PageId) {
  window.localStorage.setItem(storageKey(namespace), JSON.stringify({ currentPage } satisfies SavedAppState));
}

function useCurrentPage(storageNamespace?: string) {
  const namespace = useMemo(() => resolveStorageNamespace(storageNamespace), [storageNamespace]);
  const [saveSuppressed, setSaveSuppressed] = useState(false);
  const [hasSavedProgress, setHasSavedProgress] = useState<boolean>(() => {
    return window.localStorage.getItem(storageKey(namespace)) !== null;
  });
  const [page, setPage] = useState<PageId>(() => {
    const normalizedHash = normalizeHash(window.location.hash);
    const savedPage = loadSavedPage(namespace);
    const nextPage = normalizedHash === 'home' ? savedPage || normalizedHash : normalizedHash;

    window.location.hash = canonicalHash(nextPage);
    return nextPage;
  });

  useEffect(() => {
    const onHashChange = () => {
      const nextPage = normalizeHash(window.location.hash);
      const nextHash = canonicalHash(nextPage);
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
        return;
      }

      setSaveSuppressed(false);
      setPage(nextPage);
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (saveSuppressed) {
      return;
    }

    savePage(namespace, page);
    setHasSavedProgress(true);
  }, [namespace, page, saveSuppressed]);

  const clearSavedProgress = () => {
    window.localStorage.removeItem(storageKey(namespace));
    setSaveSuppressed(true);
    setHasSavedProgress(false);
  };

  return {
    clearSavedProgress,
    hasSavedProgress,
    page,
  };
}

function FactionStrip() {
  return (
    <section className="panel stack" aria-labelledby="factions-heading">
      <p className="eyebrow">Three rival factions</p>
      <h2 id="factions-heading">Learn one duel, read every board</h2>
      <p className="section-copy">
        Each faction owns a distinct silhouette, rules style, and emotional promise so players can
        identify threats before reading every line of text.
      </p>
      <div className="faction-grid">
        {factions.map((faction) => (
          <article className="faction-panel" data-faction={faction.id} key={faction.id}>
            <p className="faction-name">{faction.name}</p>
            <h3>{faction.title}</h3>
            <p>{faction.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CardFrame({ card }: { card: CardDefinition }) {
  return (
    <article className="card-frame" data-faction={card.faction}>
      <div className="card-topline">
        <p className="card-kind">{card.kind}</p>
        <p className="card-cost">{card.cost}</p>
      </div>
      <h3>{card.name}</h3>
      <div className="card-art">
        <p>{card.art}</p>
      </div>
      <p className="card-text">{card.text}</p>
    </article>
  );
}

function CardGallery() {
  return (
    <section className="panel stack" aria-labelledby="cards-heading">
      <p className="eyebrow">Same frames as play</p>
      <h2 id="cards-heading">Starter Archive</h2>
      <p className="section-copy">
        These cards teach the cost line, card type, art treatment, and rules box we will reuse on
        the duel board.
      </p>
      <div className="card-grid">
        {cards.map((card) => (
          <CardFrame card={card} key={card.name} />
        ))}
      </div>
    </section>
  );
}

function HomePage() {
  return (
    <>
      <FactionStrip />
      <section className="panel-grid" aria-label="Home teaching surfaces">
        <article className="panel stack">
          <p className="eyebrow">Encounter intros</p>
          <h2>Every duel starts with a readable threat</h2>
          <p>
            Rival intros call out the enemy plan, their signature trick, and the one lesson the
            encounter wants the player to learn before the first draw.
          </p>
        </article>
        <article className="panel stack">
          <p className="eyebrow">Turn clarity</p>
          <h2>Act, resolve, answer</h2>
          <p>
            Turn copy keeps the sequence explicit: play cards, attack, end turn, then watch the AI
            answer with the same grammar.
          </p>
        </article>
        <article className="panel stack">
          <p className="eyebrow">Outcome states</p>
          <h2>Victory should teach, defeat should invite one more run</h2>
          <p>
            Win and loss states reinforce why the duel ended and what a player should try on the
            next attempt instead of dumping them into a dead end.
          </p>
        </article>
      </section>
      <CardGallery />
    </>
  );
}

function PlayPage({ hasSavedProgress, clearSavedProgress }: { hasSavedProgress: boolean; clearSavedProgress: () => void }) {
  return (
    <>
      <section className="panel persistence-panel stack">
        <p className="eyebrow">Browser save</p>
        <h2>Resume without setup friction</h2>
        <p>{hasSavedProgress ? 'Saved progress ready to resume.' : 'No local save yet.'}</p>
        <button className="nav-link clear-button" onClick={clearSavedProgress} type="button">
          Clear Saved Progress
        </button>
      </section>
      <section className="panel-grid" aria-label="Play patterns">
        <article className="panel stack">
          <p className="eyebrow">Encounter intro</p>
          <h2>The Ash Chapel opens hot</h2>
          <p>Expect Emberwake pressure. Preserve one blocker and punish overextension on turn three.</p>
        </article>
        <article className="panel stack">
          <p className="eyebrow">Turn prompt</p>
          <h2>You have 4 crystals and one clean lane</h2>
          <p>Develop a unit first, then hold your spell if lethal is not on board yet.</p>
        </article>
        <article className="panel stack">
          <p className="eyebrow">End state</p>
          <h2>Win the duel, unlock the next rival</h2>
          <p>Loss copy highlights the swing turn so players can immediately understand what changed.</p>
        </article>
      </section>
    </>
  );
}

function RulesPage() {
  return (
    <section className="panel-grid" aria-label="Rules reference">
      <article className="panel stack">
        <p className="eyebrow">Turn flow</p>
        <h2>1. Draw. 2. Spend crystals. 3. Attack.</h2>
        <p>Turns stay short. Units enter ready only when a card says so, and combat resolves lane by lane.</p>
      </article>
      <article className="panel stack">
        <p className="eyebrow">Board literacy</p>
        <h2>Hand, board, discard, champion</h2>
        <p>Every zone label matches the live play surface so the rules page doubles as a UI legend.</p>
      </article>
      <article className="panel stack">
        <p className="eyebrow">Victory condition</p>
        <h2>Break the opposing champion before yours falls</h2>
        <p>Damage persists, and the site should always explain whether you lost to tempo, burn, or board collapse.</p>
      </article>
    </section>
  );
}

function CardsPage() {
  return (
    <>
      <FactionStrip />
      <CardGallery />
    </>
  );
}

function PageContent({
  clearSavedProgress,
  hasSavedProgress,
  page,
}: {
  clearSavedProgress: () => void;
  hasSavedProgress: boolean;
  page: PageId;
}) {
  if (page === 'play') {
    return <PlayPage clearSavedProgress={clearSavedProgress} hasSavedProgress={hasSavedProgress} />;
  }

  if (page === 'rules') {
    return <RulesPage />;
  }

  if (page === 'cards') {
    return <CardsPage />;
  }

  return <HomePage />;
}

export function App({ storageNamespace }: AppProps) {
  const { clearSavedProgress, hasSavedProgress, page } = useCurrentPage(storageNamespace);
  const current = pageLookup[page];

  return (
    <div className="shell">
      <header className="hero">
        <nav aria-label="Primary" className="topbar">
          <a className="brand" href="#/">
            Duel of Embers
          </a>
          <div className="nav-links">
            {pages.map((entry) => (
              <a
                aria-current={page === entry.id ? 'page' : undefined}
                className="nav-link"
                href={canonicalHash(entry.id)}
                key={entry.id}
              >
                {entry.label}
              </a>
            ))}
          </div>
        </nav>
        <div className="hero-copy">
          <p className="eyebrow">{current.eyebrow}</p>
          <h1>{current.title}</h1>
          <p className="lede">{current.body}</p>
          <div className="hero-actions">
            <a className="hero-action" href={canonicalHash('play')}>
              Start First Duel
            </a>
          </div>
        </div>
      </header>

      <main className="content">
        <PageContent
          clearSavedProgress={clearSavedProgress}
          hasSavedProgress={hasSavedProgress}
          page={page}
        />
      </main>
    </div>
  );
}
