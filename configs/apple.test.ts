import assert from "node:assert/strict";
import test from "node:test";

import { defineAppleRunConfig } from "./apple.js";

test("configs/apple builds the standard apple baseline for any seed", () => {
  const run = defineAppleRunConfig(3);

  assert.equal(run.topology.slug, "apple");
  assert.equal(run.topology.name, "Apple");
  assert.equal(run.seed, 3);
  assert.equal(run.maxRounds, 8);
  assert.equal(run.perRoundTimeoutMs, 3_600_000);
  assert.equal(run.brief, "configs/brief.md");
  assert.equal(run.models.node.model, "openai/gpt-5.4");
  assert.equal(run.runBudget.tokens, 5_000_000);
  assert.equal(run.runBudget.wallClockMs, 28_800_000);
  assert.deepEqual(run.topology.writeAccess, { kind: "leader-only" });
  assert.equal(run.topology.culture?.kind, "apple-taste");
});
