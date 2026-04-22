#!/usr/bin/env tsx
// Re-run the judge stage for a topology whose judge output is missing or
// malformed. Reads docs/<topo>/ and writes docs/<topo>/trajectory/judge.json.
//
// Usage: npx tsx scripts/rerun-judge.ts <topo>

import path from "node:path";

import { judgePublishedArtifact } from "@org-bench/orchestrator";

import { models } from "../configs/models.js";

async function main(): Promise<void> {
  const topo = process.argv[2];
  if (!topo) {
    console.error("Usage: tsx scripts/rerun-judge.ts <topo>");
    process.exit(1);
  }
  const repoRoot = path.resolve(
    new URL("..", import.meta.url).pathname,
  );
  const artifactDir = path.join(repoRoot, "docs", topo);

  const result = await judgePublishedArtifact({
    artifactDir,
    runId: topo,
    model: models.default.judge.model,
  });

  console.log(`\nwrote docs/${topo}/trajectory/judge.json - avg rubric:`);
  const scores = Object.values(result.rubric);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  for (const [k, v] of Object.entries(result.rubric)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`  AVG: ${avg.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
