import { useEffect, useState } from "preact/hooks";

import {
  buildRunHash,
  formatDurationMs,
  formatNumber,
  formatPercent,
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
  meanTokens: null,
  meanWallClockMs: null,
  meanPassRate: null,
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
      const baseUrl = runArtifactBaseUrl({
        topology: entry.topology,
        seed: entry.seed,
      });
      const meta = await fetchOptionalMeta(`${baseUrl}meta.json`);
      if (!meta) {
        return {
          seed: entry.seed,
          totalTokens: null,
          wallClockMs: null,
          passRate: null,
          buildSuccess: null,
          deploySuccess: null,
        };
      }
      return {
        seed: entry.seed,
        totalTokens: meta.totals.tokens.total,
        wallClockMs: meta.totals.wall_clock_ms,
        passRate: meta.evaluator.overall_pass_rate,
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
  const matching = entries
    .filter((e) => e.topology === route.topology)
    .sort((a, b) => a.seed.localeCompare(b.seed));
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
          No meta.json files were available across this topology's seeds.
        </p>
      ) : (
        <dl>
          <dt>Runs with meta</dt>
          <dd>
            {aggregate.metaCount} / {aggregate.runCount}
          </dd>
          <dt>Mean total tokens</dt>
          <dd>
            {aggregate.meanTokens === null
              ? "n/a"
              : formatNumber(Math.round(aggregate.meanTokens))}
          </dd>
          <dt>Mean wall clock</dt>
          <dd>
            {aggregate.meanWallClockMs === null
              ? "n/a"
              : formatDurationMs(Math.round(aggregate.meanWallClockMs))}
          </dd>
          <dt>Mean evaluator pass rate</dt>
          <dd>
            {aggregate.meanPassRate === null
              ? "n/a"
              : formatPercent(aggregate.meanPassRate)}
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
        <h2>Seeds</h2>
        <p data-testid="seeds-empty">No seeds published yet.</p>
      </section>
    );
  }
  return (
    <section data-section="seeds">
      <h2>Seeds</h2>
      <table data-testid="seed-list">
        <thead>
          <tr>
            <th>Seed</th>
            <th>Tokens</th>
            <th>Wall clock</th>
            <th>Pass rate</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: runCount }, (_, i) => (
                <tr key={i}>
                  <td colSpan={4}>Loading...</td>
                </tr>
              ))
            : summaries.map((summary) => (
                <tr key={summary.seed}>
                  <td>
                    <a href={buildRunHash({ topology, seed: summary.seed })}>
                      {summary.seed}
                    </a>
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
                  <td>
                    {summary.passRate === null
                      ? "n/a"
                      : formatPercent(summary.passRate)}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </section>
  );
}
