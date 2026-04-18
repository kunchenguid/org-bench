import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunEntry } from "../src/runs-manifest.js";

export async function discoverRuns(docsRunsDir: string): Promise<RunEntry[]> {
  let topologies: string[];
  try {
    topologies = await readdir(docsRunsDir);
  } catch {
    return [];
  }

  const entries: RunEntry[] = [];
  for (const topology of topologies.sort()) {
    const topologyDir = join(docsRunsDir, topology);
    const topologyStat = await stat(topologyDir).catch(() => null);
    if (!topologyStat?.isDirectory()) continue;

    const seeds = await readdir(topologyDir);
    for (const seed of seeds.sort()) {
      if (!seed.startsWith("seed-")) continue;
      const seedDir = join(topologyDir, seed);
      const seedStat = await stat(seedDir).catch(() => null);
      if (!seedStat?.isDirectory()) continue;
      entries.push({
        topology,
        seed,
        artifactPath: `runs/${topology}/${seed}/`,
      });
    }
  }
  return entries;
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const docsRunsDir = join(repoRoot, "docs", "runs");
  const publicDir = join(packageRoot, "public");

  const entries = await discoverRuns(docsRunsDir);
  await mkdir(publicDir, { recursive: true });
  await writeFile(
    join(publicDir, "runs.json"),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
}
