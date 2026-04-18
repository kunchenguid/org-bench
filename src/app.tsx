import { useEffect, useState } from 'preact/hooks';

type PageId = 'home' | 'play' | 'rules' | 'cards';

type PageDefinition = {
  id: PageId;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
};

const pages: PageDefinition[] = [
  {
    id: 'home',
    label: 'Home',
    eyebrow: 'Single-player tactical duels',
    title: 'Duel of Embers',
    body:
      'Face a rising gauntlet of AI spellbinders in a polished browser card game built around visible zones, clear turns, and faction-driven cards.',
  },
  {
    id: 'play',
    label: 'Play',
    eyebrow: 'Encounter ladder',
    title: 'Play The First Duel',
    body:
      'This scaffold reserves the full duel table, encounter ladder, and persistence hooks that the team will flesh out in the next rounds.',
  },
  {
    id: 'rules',
    label: 'Rules',
    eyebrow: 'Learn in two minutes',
    title: 'How To Play',
    body:
      'Turns, resources, card types, and victory conditions will live here in a player-readable guide that mirrors the final board UI.',
  },
  {
    id: 'cards',
    label: 'Cards',
    eyebrow: 'Visual card gallery',
    title: 'Card Archive',
    body:
      'The gallery page will present the final card frames, faction identity, and rules text using the same visual cards seen during play.',
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

function pageHref(pageId: PageId): string {
  return pageId === 'home' ? '#/' : `#/${pageId}`;
}

function useCurrentPage(): PageId {
  const [page, setPage] = useState<PageId>(() => normalizeHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setPage(normalizeHash(window.location.hash));

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return page;
}

export function App() {
  const currentPage = useCurrentPage();
  const current = pageLookup[currentPage];

  return (
    <div className="shell">
      <header className="hero">
        <nav aria-label="Primary" className="topbar">
          <a className="brand" href="#/">
            Duel of Embers
          </a>
          <div className="nav-links">
            {pages.map((page) => (
              <a
                aria-current={currentPage === page.id ? 'page' : undefined}
                className="nav-link"
                href={pageHref(page.id)}
                key={page.id}
              >
                {page.label}
              </a>
            ))}
          </div>
        </nav>
        <div className="hero-copy">
          <p className="eyebrow">{current.eyebrow}</p>
          <h1>{current.title}</h1>
          <p className="lede">{current.body}</p>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <h2>Round 1 Shared Scaffold</h2>
          <p>
            The app shell, navigation model, relative-path build config, and page placeholders are
            in place so the team can parallelize game systems, card art, and encounter design in
            round 2.
          </p>
        </section>

        <section className="panel-grid" aria-label="Site surfaces">
          {pages.map((page) => (
            <article className="panel" key={page.id}>
              <p className="eyebrow">{page.eyebrow}</p>
              <h2>{page.label}</h2>
              <p>{page.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
