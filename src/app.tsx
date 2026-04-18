import { useEffect, useState } from 'preact/hooks';
import { getRouteFromHash, type RouteId } from './routes';

type PageDefinition = {
  id: RouteId;
  label: string;
  title: string;
  body: string;
};

const pages: PageDefinition[] = [
  {
    id: 'home',
    label: 'Home',
    title: 'Duel TCG',
    body: 'A fast single-player card battler built for the browser.'
  },
  {
    id: 'play',
    label: 'Play',
    title: 'Play',
    body: 'The playable duel board and encounter ladder will be built here.'
  },
  {
    id: 'rules',
    label: 'Rules',
    title: 'How to Play',
    body: 'The turn structure, resources, and victory rules will be explained here.'
  },
  {
    id: 'cards',
    label: 'Cards',
    title: 'Card Gallery',
    body: 'The full card list and reference details will be published here.'
  }
];

const readRoute = () => getRouteFromHash(window.location.hash);

export const App = () => {
  const [route, setRoute] = useState<RouteId>(readRoute);

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute());

    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  const page = pages.find((entry) => entry.id === route) ?? pages[0];

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Static campaign preview</p>
        <h1>{page.title}</h1>
        <p className="lede">{page.body}</p>
      </header>

      <nav aria-label="Primary" className="nav">
        {pages.map((entry) => (
          <a
            key={entry.id}
            className={entry.id === route ? 'nav-link active' : 'nav-link'}
            href={`#${entry.id}`}
          >
            {entry.label}
          </a>
        ))}
      </nav>

      <main className="panel">
        <section>
          <h2>{page.title}</h2>
          <p>{page.body}</p>
        </section>

        <section className="status-grid" aria-label="Scaffold status">
          <article>
            <h3>Home</h3>
            <p>Landing page frame and project styling are in place.</p>
          </article>
          <article>
            <h3>Play</h3>
            <p>Reserved for the duel board, encounter ladder, and save resume flow.</p>
          </article>
          <article>
            <h3>Rules</h3>
            <p>Reserved for the full player-facing rules and keyword reference.</p>
          </article>
          <article>
            <h3>Cards</h3>
            <p>Reserved for the full gallery with card stats, types, and abilities.</p>
          </article>
        </section>
      </main>
    </div>
  );
};
