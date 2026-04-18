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
  if (parts.length !== 3) return null;
  const [topologyA, vs, topologyB] = parts as [string, string, string];
  if (vs !== "vs") return null;
  return {
    a: { topology: topologyA },
    b: { topology: topologyB },
  };
}

export function buildCompareHash(pair: ComparePair): string {
  return `${COMPARE_HASH_PREFIX}${pair.a.topology}/vs/${pair.b.topology}`;
}

export function pickComparePair(
  entries: RunEntry[],
  rand: () => number,
): ComparePair | null {
  const topologies = [...new Set(entries.map((entry) => entry.topology))].sort(
    (a, b) => a.localeCompare(b),
  );
  if (topologies.length < 2) return null;
  const indexA = Math.floor(rand() * topologies.length) % topologies.length;
  let indexB = Math.floor(rand() * topologies.length) % topologies.length;
  if (indexB === indexA) indexB = (indexA + 1) % topologies.length;
  return {
    a: { topology: topologies[indexA]! },
    b: { topology: topologies[indexB]! },
  };
}
