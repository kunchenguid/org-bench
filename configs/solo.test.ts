import assert from "node:assert/strict";
import test from "node:test";

import { defineSoloRunConfig, soloTopology } from "./solo.js";

test("configs/solo exports the canonical solo topology", () => {
  assert.equal(soloTopology.slug, "solo");
  assert.equal(soloTopology.name, "Solo");
  assert.deepEqual(soloTopology.nodes, ["leader"]);
  assert.deepEqual(soloTopology.edges, []);
  assert.equal(soloTopology.leader, "leader");
  assert.deepEqual(soloTopology.writeAccess, { kind: "everyone" });
  assert.equal(soloTopology.culture?.kind, "solo-builder");
});

test("configs/solo builds the standard solo baseline for any seed", () => {
  const run = defineSoloRunConfig(2);

  assert.deepEqual(run.topology, soloTopology);
  assert.equal(run.seed, 2);
  assert.equal(run.maxRounds, 8);
  assert.equal(run.perRoundTimeoutMs, 3_600_000);
  assert.equal(run.brief, "configs/brief.md");
  assert.equal(run.models.node.model, "openai/gpt-5.4");
  assert.equal(run.runBudget.tokens, 5_000_000);
  assert.equal(run.runBudget.wallClockMs, 28_800_000);
});
