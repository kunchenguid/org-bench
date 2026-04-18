import assert from "node:assert/strict";
import test from "node:test";

import { run } from "./run.js";
import { run as appleSeed01 } from "./run-apple-seed-01.js";
import { run as runSeed02 } from "./run-seed-02.js";
import { run as runSeed03 } from "./run-seed-03.js";
import { run as runSeed04 } from "./run-seed-04.js";
import { run as runSeed05 } from "./run-seed-05.js";

test("configs/run exports the default solo run baseline", () => {
  assert.equal(run.topology.slug, "solo");
  assert.equal(run.topology.name, "Solo");
  assert.deepEqual(run.topology.nodes, ["leader"]);
  assert.deepEqual(run.topology.edges, []);
  assert.equal(run.topology.leader, "leader");
  assert.deepEqual(run.topology.writeAccess, { kind: "everyone" });
  assert.equal(run.topology.culture?.kind, "solo-builder");
  assert.equal(run.seed, 1);
  assert.equal(run.maxRounds, 8);
  assert.equal(run.perRoundTimeoutMs, 3_600_000);
  assert.equal(run.brief, "configs/brief.md");
  assert.equal(run.models.node.model, "openai/gpt-5.4");
  assert.equal(run.runBudget.tokens, 5_000_000);
  assert.equal(run.runBudget.wallClockMs, 28_800_000);
});

test("configs/run-seed-02 exports the next solo seed baseline", () => {
  assert.equal(runSeed02.topology.slug, "solo");
  assert.equal(runSeed02.seed, 2);
  assert.equal(runSeed02.maxRounds, run.maxRounds);
  assert.equal(runSeed02.perRoundTimeoutMs, run.perRoundTimeoutMs);
  assert.equal(runSeed02.brief, run.brief);
  assert.equal(runSeed02.models.node.model, run.models.node.model);
  assert.equal(runSeed02.runBudget.tokens, run.runBudget.tokens);
  assert.equal(runSeed02.runBudget.wallClockMs, run.runBudget.wallClockMs);
});

test("configs/run-seed-03 exports the next solo seed baseline", () => {
  assert.equal(runSeed03.topology.slug, "solo");
  assert.equal(runSeed03.seed, 3);
  assert.equal(runSeed03.maxRounds, run.maxRounds);
  assert.equal(runSeed03.perRoundTimeoutMs, run.perRoundTimeoutMs);
  assert.equal(runSeed03.brief, run.brief);
  assert.equal(runSeed03.models.node.model, run.models.node.model);
  assert.equal(runSeed03.runBudget.tokens, run.runBudget.tokens);
  assert.equal(runSeed03.runBudget.wallClockMs, run.runBudget.wallClockMs);
});

test("configs/run-seed-04 exports the next solo seed baseline", () => {
  assert.equal(runSeed04.topology.slug, "solo");
  assert.equal(runSeed04.seed, 4);
  assert.equal(runSeed04.maxRounds, run.maxRounds);
  assert.equal(runSeed04.perRoundTimeoutMs, run.perRoundTimeoutMs);
  assert.equal(runSeed04.brief, run.brief);
  assert.equal(runSeed04.models.node.model, run.models.node.model);
  assert.equal(runSeed04.runBudget.tokens, run.runBudget.tokens);
  assert.equal(runSeed04.runBudget.wallClockMs, run.runBudget.wallClockMs);
});

test("configs/run-seed-05 exports the next solo seed baseline", () => {
  assert.equal(runSeed05.topology.slug, "solo");
  assert.equal(runSeed05.seed, 5);
  assert.equal(runSeed05.maxRounds, run.maxRounds);
  assert.equal(runSeed05.perRoundTimeoutMs, run.perRoundTimeoutMs);
  assert.equal(runSeed05.brief, run.brief);
  assert.equal(runSeed05.models.node.model, run.models.node.model);
  assert.equal(runSeed05.runBudget.tokens, run.runBudget.tokens);
  assert.equal(runSeed05.runBudget.wallClockMs, run.runBudget.wallClockMs);
});

test("configs/run-apple-seed-01 exports the apple seed baseline", () => {
  assert.equal(appleSeed01.topology.slug, "apple");
  assert.equal(appleSeed01.topology.name, "Apple");
  assert.equal(appleSeed01.seed, 1);
  assert.equal(appleSeed01.maxRounds, run.maxRounds);
  assert.equal(appleSeed01.perRoundTimeoutMs, run.perRoundTimeoutMs);
  assert.equal(appleSeed01.brief, run.brief);
  assert.equal(appleSeed01.models.node.model, run.models.node.model);
  assert.equal(appleSeed01.runBudget.tokens, run.runBudget.tokens);
  assert.equal(appleSeed01.runBudget.wallClockMs, run.runBudget.wallClockMs);
  assert.deepEqual(appleSeed01.topology.writeAccess, { kind: "leader-only" });
});
