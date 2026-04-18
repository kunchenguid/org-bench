export interface TopologyRoute {
  topology: string;
}

export interface TopologyRunSummary {
  topology: string;
  totalTokens: number | null;
  wallClockMs: number | null;
  passRate: number | null;
  buildSuccess: boolean | null;
  deploySuccess: boolean | null;
}

export interface TopologyAggregate {
  runCount: number;
  metaCount: number;
  totalTokens: number | null;
  wallClockMs: number | null;
  passRate: number | null;
  buildSuccessCount: number;
  deploySuccessCount: number;
}

const TOPOLOGY_HASH_PREFIX = "#topology/";

export function parseTopologyRoute(hash: string): TopologyRoute | null {
  if (!hash.startsWith(TOPOLOGY_HASH_PREFIX)) return null;
  const remainder = hash.slice(TOPOLOGY_HASH_PREFIX.length);
  const parts = remainder.split("/").filter((part) => part.length > 0);
  if (parts.length !== 1) return null;
  return { topology: parts[0]! };
}

export function buildTopologyHash(route: TopologyRoute): string {
  return `${TOPOLOGY_HASH_PREFIX}${route.topology}`;
}

export function summarizeTopologyRuns(
  summaries: TopologyRunSummary[],
): TopologyAggregate {
  let metaCount = 0;
  let buildSuccessCount = 0;
  let deploySuccessCount = 0;
  for (const summary of summaries) {
    const hasMeta =
      summary.totalTokens !== null ||
      summary.wallClockMs !== null ||
      summary.passRate !== null ||
      summary.buildSuccess !== null ||
      summary.deploySuccess !== null;
    if (hasMeta) metaCount += 1;
    if (summary.buildSuccess === true) buildSuccessCount += 1;
    if (summary.deploySuccess === true) deploySuccessCount += 1;
  }
  const only = summaries[0];
  return {
    runCount: summaries.length,
    metaCount,
    totalTokens: only?.totalTokens ?? null,
    wallClockMs: only?.wallClockMs ?? null,
    passRate: only?.passRate ?? null,
    buildSuccessCount,
    deploySuccessCount,
  };
}
