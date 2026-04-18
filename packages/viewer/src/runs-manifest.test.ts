import assert from "node:assert/strict";
import test from "node:test";

import { groupRunsByTopology, type RunEntry } from "./runs-manifest.js";

test("groupRunsByTopology groups flat entries under each topology", () => {
  const entries: RunEntry[] = [
    { topology: "solo", seed: "seed-02", artifactPath: "runs/solo/seed-02/" },
    { topology: "apple", seed: "seed-01", artifactPath: "runs/apple/seed-01/" },
    { topology: "solo", seed: "seed-01", artifactPath: "runs/solo/seed-01/" },
  ];

  const grouped = groupRunsByTopology(entries);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]?.topology, "apple");
  assert.deepEqual(grouped[0]?.runs, [
    { topology: "apple", seed: "seed-01", artifactPath: "runs/apple/seed-01/" },
  ]);
  assert.equal(grouped[1]?.topology, "solo");
  assert.deepEqual(grouped[1]?.runs, [
    { topology: "solo", seed: "seed-01", artifactPath: "runs/solo/seed-01/" },
    { topology: "solo", seed: "seed-02", artifactPath: "runs/solo/seed-02/" },
  ]);
});

test("groupRunsByTopology sorts topologies alphabetically and seeds lexicographically", () => {
  const entries: RunEntry[] = [
    { topology: "zeta", seed: "seed-03", artifactPath: "runs/zeta/seed-03/" },
    { topology: "alpha", seed: "seed-10", artifactPath: "runs/alpha/seed-10/" },
    { topology: "alpha", seed: "seed-02", artifactPath: "runs/alpha/seed-02/" },
  ];

  const grouped = groupRunsByTopology(entries);

  assert.deepEqual(
    grouped.map((g) => g.topology),
    ["alpha", "zeta"],
  );
  assert.deepEqual(
    grouped[0]?.runs.map((r) => r.seed),
    ["seed-02", "seed-10"],
  );
});

test("groupRunsByTopology returns an empty array when no runs are provided", () => {
  assert.deepEqual(groupRunsByTopology([]), []);
});
