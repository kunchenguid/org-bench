import assert from "node:assert/strict";
import test from "node:test";

import { run } from "./run.js";
import { run as appleRun } from "./run-apple.js";

test("configs/run exports the default solo run baseline", () => {
  assert.equal(run.topology.slug, "solo");
  assert.equal(run.topology.name, "Solo");
  assert.deepEqual(run.topology.nodes, ["leader"]);
  assert.deepEqual(run.topology.edges, []);
  assert.equal(run.topology.leader, "leader");
  assert.deepEqual(run.topology.developers, ["leader"]);
  assert.deepEqual(run.topology.integrators, []);
  assert.equal(run.topology.culture?.kind, "solo-builder");
  assert.equal(run.seed, 1);
  assert.equal(run.maxRounds, 8);
  assert.equal(run.perRoundTimeoutMs, 3_600_000);
  assert.equal(run.brief, "configs/brief.md");
  assert.equal(run.models.node.model, "openai/gpt-5.4");
  assert.equal(run.runBudget.tokens, 5_000_000);
  assert.equal(run.runBudget.wallClockMs, 28_800_000);
});

test("configs/run-apple exports the apple seed baseline", () => {
  assert.equal(appleRun.topology.slug, "apple");
  assert.equal(appleRun.topology.name, "Apple");
  assert.equal(appleRun.seed, 1);
  assert.equal(appleRun.maxRounds, run.maxRounds);
  assert.equal(appleRun.perRoundTimeoutMs, run.perRoundTimeoutMs);
  assert.equal(appleRun.brief, run.brief);
  assert.equal(appleRun.models.node.model, run.models.node.model);
  assert.equal(appleRun.runBudget.tokens, run.runBudget.tokens);
  assert.equal(appleRun.runBudget.wallClockMs, run.runBudget.wallClockMs);
  assert.deepEqual(appleRun.topology.integrators, ["Steve"]);
});
