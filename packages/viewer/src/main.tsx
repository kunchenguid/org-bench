import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { RunEntry } from "./runs-manifest.js";
import { buildRunHash, parseRunRoute, type RunRoute } from "./run-data.js";
import {
  buildCompareHash,
  parseCompareRoute,
  pickComparePair,
  type ComparePair,
} from "./compare-data.js";
import { parseTraceRoute, type TraceRoute } from "./trace-data.js";
import {
  buildTopologyHash,
  parseTopologyRoute,
  type TopologyRoute,
} from "./topology-data.js";
import { RunPage } from "./run-page.js";
import { ComparePage } from "./compare-page.js";
import { TracePage } from "./trace-page.js";
import { TopologyPage } from "./topology-page.js";

type ManifestState =
  | { status: "loading" }
  | { status: "ready"; entries: RunEntry[] }
  | { status: "error"; error: string };

type Route =
  | { kind: "index" }
  | { kind: "run"; route: RunRoute }
  | { kind: "compare"; pair: ComparePair }
  | { kind: "trace"; route: TraceRoute }
  | { kind: "topology"; route: TopologyRoute };

function parseRoute(hash: string): Route {
  const compare = parseCompareRoute(hash);
  if (compare) return { kind: "compare", pair: compare };
  const trace = parseTraceRoute(hash);
  if (trace) return { kind: "trace", route: trace };
  const topology = parseTopologyRoute(hash);
  if (topology) return { kind: "topology", route: topology };
  const run = parseRunRoute(hash);
  if (run) return { kind: "run", route: run };
  return { kind: "index" };
}

function useHashRoute(): Route {
  const initial =
    typeof window === "undefined"
      ? { kind: "index" as const }
      : parseRoute(window.location.hash);
  const [route, setRoute] = useState<Route>(initial);
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

function IndexPage() {
  const [state, setState] = useState<ManifestState>({ status: "loading" });

  useEffect(() => {
    fetch("./runs.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`runs.json: HTTP ${response.status}`);
        }
        return (await response.json()) as RunEntry[];
      })
      .then((entries) => setState({ status: "ready", entries }))
      .catch((error: unknown) =>
        setState({ status: "error", error: String(error) }),
      );
  }, []);

  return (
    <main>
      <h1>org-bench viewer</h1>
      {state.status === "ready" && state.entries.length >= 2 && (
        <CompareLink entries={state.entries} />
      )}
      {state.status === "loading" && <p>Loading runs...</p>}
      {state.status === "error" && (
        <p data-testid="error">Failed to load runs: {state.error}</p>
      )}
      {state.status === "ready" && state.entries.length === 0 && (
        <p>No benchmark runs have been published yet.</p>
      )}
      {state.status === "ready" &&
        state.entries.map((entry) => (
          <section key={entry.topology} data-topology={entry.topology}>
            <h2>
              <a
                data-testid="topology-link"
                href={buildTopologyHash({ topology: entry.topology })}
              >
                {entry.topology}
              </a>
            </h2>
            <p>
              <a href={buildRunHash({ topology: entry.topology })}>
                Open run view
              </a>
            </p>
          </section>
        ))}
    </main>
  );
}

function CompareLink({ entries }: { entries: RunEntry[] }) {
  const pair = pickComparePair(entries, () => Math.random());
  if (!pair) return null;
  return (
    <p data-testid="compare-link">
      <a href={buildCompareHash(pair)}>Blind compare two runs</a>
    </p>
  );
}

function App() {
  const route = useHashRoute();
  if (route.kind === "compare") return <ComparePage pair={route.pair} />;
  if (route.kind === "trace") return <TracePage route={route.route} />;
  if (route.kind === "topology") return <TopologyApp route={route.route} />;
  if (route.kind === "run") return <RunPage route={route.route} />;
  return <IndexPage />;
}

function TopologyApp({ route }: { route: TopologyRoute }) {
  const [state, setState] = useState<ManifestState>({ status: "loading" });
  useEffect(() => {
    fetch("./runs.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`runs.json: HTTP ${response.status}`);
        }
        return (await response.json()) as RunEntry[];
      })
      .then((entries) => setState({ status: "ready", entries }))
      .catch((error: unknown) =>
        setState({ status: "error", error: String(error) }),
      );
  }, []);
  if (state.status === "loading") return <p>Loading topology runs...</p>;
  if (state.status === "error")
    return (
      <p data-testid="topology-error">
        Failed to load topology runs: {state.error}
      </p>
    );
  return <TopologyPage route={route} entries={state.entries} />;
}

const mount = document.getElementById("app");

if (mount) {
  render(<App />, mount);
}
