import { useEffect, useState } from "preact/hooks";

import {
  buildRunHash,
  formatDurationMs,
  formatNumber,
  runArtifactBaseUrl,
  type MetaJsonLike,
} from "./run-data.js";
import type { RunEntry } from "./runs-manifest.js";
import {
  summarizeTopologyRuns,
  type TopologyAggregate,
  type TopologyRoute,
  type TopologyRunSummary,
} from "./topology-data.js";

interface TopologyState {
  status: "loading" | "ready";
  summaries: TopologyRunSummary[];
  aggregate: TopologyAggregate;
}

const EMPTY_AGGREGATE: TopologyAggregate = {
  runCount: 0,
  metaCount: 0,
  totalTokens: null,
  wallClockMs: null,
  buildSuccessCount: 0,
  deploySuccessCount: 0,
};

async function fetchOptionalMeta(url: string): Promise<MetaJsonLike | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as MetaJsonLike;
  } catch {
    return null;
  }
}

async function loadTopologySummaries(
  entries: RunEntry[],
): Promise<TopologyRunSummary[]> {
  return await Promise.all(
    entries.map(async (entry) => {
      const baseUrl = runArtifactBaseUrl({ topology: entry.topology });
      const meta = await fetchOptionalMeta(`${baseUrl}meta.json`);
      if (!meta) {
        return {
          topology: entry.topology,
          totalTokens: null,
          wallClockMs: null,
          buildSuccess: null,
          deploySuccess: null,
        };
      }
      return {
        topology: entry.topology,
        totalTokens: meta.totals.tokens.total,
        wallClockMs: meta.totals.wall_clock_ms,
        buildSuccess: meta.artifact.build_success,
        deploySuccess: meta.artifact.deploy_success,
      };
    }),
  );
}

export function TopologyPage({
  route,
  entries,
}: {
  route: TopologyRoute;
  entries: RunEntry[];
}) {
  const matching = entries.filter((e) => e.topology === route.topology);
  const [state, setState] = useState<TopologyState>({
    status: "loading",
    summaries: [],
    aggregate: EMPTY_AGGREGATE,
  });

  useEffect(() => {
    let cancelled = false;
    setState({
      status: "loading",
      summaries: [],
      aggregate: EMPTY_AGGREGATE,
    });
    loadTopologySummaries(matching).then((summaries) => {
      if (cancelled) return;
      setState({
        status: "ready",
        summaries,
        aggregate: summarizeTopologyRuns(summaries),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [route.topology, matching.length]);

  return (
    <article data-page="topology" data-topology={route.topology}>
      <p>
        <a href="#">{"<-"} All runs</a>
      </p>
      <h1>Topology: {route.topology}</h1>
      <SummarySection runCount={matching.length} />
      <AggregateSection
        loading={state.status === "loading"}
        aggregate={state.aggregate}
      />
      <SeedsSection
        topology={route.topology}
        summaries={state.summaries}
        loading={state.status === "loading"}
        runCount={matching.length}
      />
    </article>
  );
}

function SummarySection({ runCount }: { runCount: number }) {
  return (
    <section data-section="summary">
      <h2>Summary</h2>
      <p>
        {runCount} {runCount === 1 ? "published run" : "published runs"} for
        this topology.
      </p>
    </section>
  );
}

function AggregateSection({
  loading,
  aggregate,
}: {
  loading: boolean;
  aggregate: TopologyAggregate;
}) {
  return (
    <section data-section="aggregate">
      <h2>Aggregate metrics</h2>
      {loading ? (
        <p>Loading meta.json files...</p>
      ) : aggregate.metaCount === 0 ? (
        <p data-testid="aggregate-missing">
          No meta.json files were available for this topology.
        </p>
      ) : (
        <dl>
          <dt>Runs with meta</dt>
          <dd>
            {aggregate.metaCount} / {aggregate.runCount}
          </dd>
          <dt>Total tokens</dt>
          <dd>
            {aggregate.totalTokens === null
              ? "n/a"
              : formatNumber(aggregate.totalTokens)}
          </dd>
          <dt>Wall clock</dt>
          <dd>
            {aggregate.wallClockMs === null
              ? "n/a"
              : formatDurationMs(aggregate.wallClockMs)}
          </dd>
          <dt>Builds OK</dt>
          <dd>
            {aggregate.buildSuccessCount} / {aggregate.metaCount}
          </dd>
          <dt>Deploys OK</dt>
          <dd>
            {aggregate.deploySuccessCount} / {aggregate.metaCount}
          </dd>
        </dl>
      )}
    </section>
  );
}

function SeedsSection({
  topology,
  summaries,
  loading,
  runCount,
}: {
  topology: string;
  summaries: TopologyRunSummary[];
  loading: boolean;
  runCount: number;
}) {
  if (runCount === 0) {
    return (
      <section data-section="seeds">
        <h2>Run</h2>
        <p data-testid="seeds-empty">No run published yet.</p>
      </section>
    );
  }
  return (
    <section data-section="seeds">
      <h2>Run</h2>
      <table data-testid="seed-list">
        <thead>
          <tr>
            <th>Topology</th>
            <th>Tokens</th>
            <th>Wall clock</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: runCount }, (_, i) => (
                <tr key={i}>
                  <td colSpan={3}>Loading...</td>
                </tr>
              ))
            : summaries.map((summary) => (
                <tr key={summary.topology}>
                  <td>
                    <a href={buildRunHash({ topology })}>{summary.topology}</a>
                  </td>
                  <td>
                    {summary.totalTokens === null
                      ? "n/a"
                      : formatNumber(summary.totalTokens)}
                  </td>
                  <td>
                    {summary.wallClockMs === null
                      ? "n/a"
                      : formatDurationMs(summary.wallClockMs)}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </section>
  );
}
