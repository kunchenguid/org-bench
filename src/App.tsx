const workers = [
  { id: 'n1', name: 'worker 1', focus: 'scaffold and routing' },
  { id: 'n2', name: 'worker 2', focus: 'content and copy' },
  { id: 'n3', name: 'Nina', focus: 'bootstrap and integration' },
  { id: 'n4', name: 'worker 4', focus: 'interaction surfaces' },
  { id: 'n5', name: 'worker 5', focus: 'visual polish' },
  { id: 'n6', name: 'worker 6', focus: 'data wiring' },
  { id: 'n7', name: 'worker 7', focus: 'testing and QA' },
  { id: 'n8', name: 'worker 8', focus: 'handoff and release' },
];

export function App() {
  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Round 1 bootstrap</p>
        <h1>Facebook Benchmark Scaffold</h1>
        <p className="lede">
          This branch was empty, so the first useful step is a working app shell with build and
          test plumbing in place.
        </p>
      </header>

      <main className="content">
        <section className="panel">
          <h2>Workers</h2>
          <div className="worker-grid">
            {workers.map((worker) => (
              <article className="worker-card" key={worker.id}>
                <p className="worker-id">{worker.id}</p>
                <h3>{worker.name}</h3>
                <p>{worker.focus}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
