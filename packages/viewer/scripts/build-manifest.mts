import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunEntry } from "../src/runs-manifest.js";

const LEGACY_MODEL = "gpt-5.4";
const RESERVED_DIRS = new Set(["assets", "votes"]);

export async function discoverRuns(docsDir: string): Promise<RunEntry[]> {
  let names: string[];
  try {
    names = await readdir(docsDir);
  } catch {
    return [];
  }

  const entries: RunEntry[] = [];
  for (const name of names.sort()) {
    if (RESERVED_DIRS.has(name)) continue;
    const entryDir = join(docsDir, name);
    const entryStat = await stat(entryDir).catch(() => null);
    if (!entryStat?.isDirectory()) continue;

    const indexStat = await stat(join(entryDir, "index.html")).catch(
      () => null,
    );
    if (indexStat?.isFile()) {
      entries.push({
        model: LEGACY_MODEL,
        topology: name,
        artifactPath: `${name}/`,
      });
      continue;
    }

    const topologyNames = await readdir(entryDir).catch(() => []);
    for (const topology of topologyNames.sort()) {
      const topologyDir = join(entryDir, topology);
      const topologyStat = await stat(topologyDir).catch(() => null);
      if (!topologyStat?.isDirectory()) continue;
      const nestedIndexStat = await stat(join(topologyDir, "index.html")).catch(
        () => null,
      );
      if (!nestedIndexStat?.isFile()) continue;
      entries.push({
        model: name,
        suite: name,
        topology,
        artifactPath: `${name}/${topology}/`,
      });
    }
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
