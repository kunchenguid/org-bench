import { useEffect, useState } from "preact/hooks";

import {
  extractRubricRows,
  formatRunLabel,
  formatDurationMs,
  formatNumber,
  runArtifactBaseUrl,
  type AnalysisJsonLike,
  type JudgeJsonLike,
  type MetaJsonLike,
  type RunRoute,
} from "./run-data.js";
import { buildTraceHash } from "./trace-data.js";

interface RunDocuments {
  meta: MetaJsonLike | null;
  judge: JudgeJsonLike | null;
  analysis: AnalysisJsonLike | null;
}

type RunState =
  | { status: "loading" }
  | { status: "ready"; docs: RunDocuments }
  | { status: "error"; error: string };

async function fetchOptionalJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function loadRunDocuments(baseUrl: string): Promise<RunDocuments> {
  const [meta, judge, analysis] = await Promise.all([
    fetchOptionalJson<MetaJsonLike>(`${baseUrl}meta.json`),
    fetchOptionalJson<JudgeJsonLike>(`${baseUrl}trajectory/judge.json`),
    fetchOptionalJson<AnalysisJsonLike>(`${baseUrl}trajectory/analysis.json`),
  ]);
  return { meta, judge, analysis };
}

export function RunPage({ route }: { route: RunRoute }) {
  const baseUrl = runArtifactBaseUrl(route);
  const [state, setState] = useState<RunState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadRunDocuments(baseUrl)
      .then((docs) => {
        if (!cancelled) setState({ status: "ready", docs });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return (
    <article data-run-topology={route.topology} data-run-suite={route.suite}>
      <p>
        <a href="#">{"<-"} All runs</a> ·{" "}
        <a data-testid="trace-link" href={buildTraceHash(route)}>
          View trace
        </a>
      </p>
      <h1>{formatRunLabel(route)}</h1>
      {state.status === "loading" && <p>Loading run...</p>}
      {state.status === "error" && (
        <p data-testid="run-error">Failed to load run: {state.error}</p>
      )}
      {state.status === "ready" && (
        <RunContent baseUrl={baseUrl} docs={state.docs} />
      )}
    </article>
  );
}

function RunContent({
  baseUrl,
  docs,
}: {
  baseUrl: string;
  docs: RunDocuments;
}) {
  const { meta, judge, analysis } = docs;
  return (
    <>
      <ArtifactSection baseUrl={baseUrl} />
      <MetricsSection meta={meta} judge={judge} />
      <NarrativeSection analysis={analysis} />
    </>
  );
}

function ArtifactSection({ baseUrl }: { baseUrl: string }) {
  return (
    <section data-section="artifact">
      <h2>Deployed artifact</h2>
      <p>
        <a href={baseUrl} target="_blank" rel="noreferrer">
          Open the deployed artifact in a new tab
        </a>
      </p>
      <iframe
        data-testid="artifact-iframe"
        src={baseUrl}
        title="Deployed artifact"
        width="100%"
        height="480"
        loading="lazy"
      />
    </section>
  );
}

function MetricsSection({
  meta,
  judge,
}: {
  meta: MetaJsonLike | null;
  judge: JudgeJsonLike | null;
}) {
  if (!meta) {
    return (
      <section data-section="metrics">
        <h2>Key metrics</h2>
        <p data-testid="metrics-missing">
          meta.json is not yet published for this run.
        </p>
      </section>
    );
  }
  const rubricRows = judge ? extractRubricRows(judge) : [];
  return (
    <section data-section="metrics">
      <h2>Key metrics</h2>
      <dl>
        <dt>Total tokens</dt>
        <dd>{formatNumber(meta.totals.tokens.total)}</dd>
        <dt>Wall clock</dt>
        <dd>{formatDurationMs(meta.totals.wall_clock_ms)}</dd>
        <dt>Build / deploy</dt>
        <dd>
          {meta.artifact.build_success ? "build OK" : "build FAILED"} ·{" "}
          {meta.artifact.deploy_success ? "deploy OK" : "deploy FAILED"}
        </dd>
      </dl>
      {rubricRows.length > 0 && (
        <>
          <h3>Judge rubric</h3>
          <table data-testid="rubric-table">
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rubricRows.map((row) => (
                <tr key={row.criterion}>
                  <td>{row.criterion}</td>
                  <td>{row.score} / 5</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function NarrativeSection({ analysis }: { analysis: AnalysisJsonLike | null }) {
  return (
    <section data-section="narrative">
      <h2>Analyst narrative</h2>
      {analysis ? (
        <p data-testid="narrative-text">{analysis.narrative}</p>
      ) : (
        <p data-testid="narrative-missing">
          analysis.json is not yet published for this run.
        </p>
      )}
    </section>
  );
}
