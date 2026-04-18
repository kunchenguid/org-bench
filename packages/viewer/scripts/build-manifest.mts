import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunEntry } from "../src/runs-manifest.js";

const RESERVED_DIRS = new Set(["assets", "votes"]);

export async function discoverRuns(docsDir: string): Promise<RunEntry[]> {
  let topologies: string[];
  try {
    topologies = await readdir(docsDir);
  } catch {
    return [];
  }

  const entries: RunEntry[] = [];
  for (const topology of topologies.sort()) {
    if (RESERVED_DIRS.has(topology)) continue;
    const topologyDir = join(docsDir, topology);
    const topologyStat = await stat(topologyDir).catch(() => null);
    if (!topologyStat?.isDirectory()) continue;
    const indexStat = await stat(join(topologyDir, "index.html")).catch(
      () => null,
    );
    if (!indexStat?.isFile()) continue;
    entries.push({
      topology,
      artifactPath: `${topology}/`,
    });
  }
  return entries;
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const docsDir = join(repoRoot, "docs");
  const publicDir = join(packageRoot, "public");

  const entries = await discoverRuns(docsDir);
  await mkdir(publicDir, { recursive: true });
  await writeFile(
    join(publicDir, "runs.json"),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
}
