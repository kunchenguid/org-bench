import type { RunRoute } from "./run-data.js";
import type { RunEntry } from "./runs-manifest.js";

export interface ComparePair {
  a: RunRoute;
  b: RunRoute;
}

const COMPARE_HASH_PREFIX = "#compare/";

export function parseCompareRoute(hash: string): ComparePair | null {
  if (!hash.startsWith(COMPARE_HASH_PREFIX)) return null;
  const remainder = hash.slice(COMPARE_HASH_PREFIX.length);
  const parts = remainder.split("/").filter((p) => p.length > 0);
  if (parts.length !== 5) return null;
  const [topologyA, seedA, vs, topologyB, seedB] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (vs !== "vs") return null;
  if (!seedA.startsWith("seed-") || !seedB.startsWith("seed-")) return null;
  return {
    a: { topology: topologyA, seed: seedA },
    b: { topology: topologyB, seed: seedB },
  };
}

export function buildCompareHash(pair: ComparePair): string {
  return `${COMPARE_HASH_PREFIX}${pair.a.topology}/${pair.a.seed}/vs/${pair.b.topology}/${pair.b.seed}`;
}

export function pickComparePair(
  entries: RunEntry[],
  rand: () => number,
): ComparePair | null {
  const byTopology = new Map<string, RunEntry[]>();
  for (const entry of entries) {
    const bucket = byTopology.get(entry.topology);
    if (bucket) bucket.push(entry);
    else byTopology.set(entry.topology, [entry]);
  }
  const topologies = [...byTopology.keys()].sort((a, b) => a.localeCompare(b));
  if (topologies.length < 2) return null;
  const indexA = Math.floor(rand() * topologies.length) % topologies.length;
  let indexB = Math.floor(rand() * topologies.length) % topologies.length;
  if (indexB === indexA) indexB = (indexA + 1) % topologies.length;
  const topologyA = topologies[indexA]!;
  const topologyB = topologies[indexB]!;
  const runsA = byTopology.get(topologyA)!;
  const runsB = byTopology.get(topologyB)!;
  const runA = runsA[Math.floor(rand() * runsA.length) % runsA.length]!;
  const runB = runsB[Math.floor(rand() * runsB.length) % runsB.length]!;
  return {
    a: { topology: runA.topology, seed: runA.seed },
    b: { topology: runB.topology, seed: runB.seed },
  };
}
