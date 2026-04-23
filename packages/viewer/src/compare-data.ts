import type { RunEntry } from "./runs-manifest.js";
import {
  entryToRunRoute,
  parseRunPath,
  runRouteKey,
  runRoutePath,
  type RunRoute,
} from "./run-data.js";

export interface ComparePair {
  a: RunRoute;
  b: RunRoute;
}

const COMPARE_HASH_PREFIX = "#compare/";

export function parseCompareRoute(hash: string): ComparePair | null {
  if (!hash.startsWith(COMPARE_HASH_PREFIX)) return null;
  const remainder = hash.slice(COMPARE_HASH_PREFIX.length);
  const parts = remainder.split("/").filter((p) => p.length > 0);
  const vsIndex = parts.indexOf("vs");
  if (vsIndex <= 0 || vsIndex !== parts.lastIndexOf("vs")) return null;
  const a = parseRunPath(parts.slice(0, vsIndex));
  const b = parseRunPath(parts.slice(vsIndex + 1));
  if (!a || !b) return null;
  return { a, b };
}

export function buildCompareHash(pair: ComparePair): string {
  return `${COMPARE_HASH_PREFIX}${runRoutePath(pair.a)}/vs/${runRoutePath(pair.b)}`;
}

export function pickComparePair(
  entries: RunEntry[],
  rand: () => number,
): ComparePair | null {
  const routes = entries
    .map(entryToRunRoute)
    .sort((a, b) => runRouteKey(a).localeCompare(runRouteKey(b)));
  if (routes.length < 2) return null;
  const indexA = Math.floor(rand() * routes.length) % routes.length;
  let indexB = Math.floor(rand() * routes.length) % routes.length;
  if (indexB === indexA) indexB = (indexA + 1) % routes.length;
  return {
    a: routes[indexA]!,
    b: routes[indexB]!,
  };
}
