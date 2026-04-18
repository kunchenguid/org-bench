import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNodeCommonContext,
  defineRunConfig,
  stripBenchmarkRunLabelsForTopology,
  verifyRunMainMergeAuthority,
  type CommandResult,
  type RunConfig,
  type TopologyConfig,
} from "./index.js";

const minimalModels = {
  node: {
    model: "test/model",
    tools: true,
    thinking: "standard" as const,
    outputMode: "text" as const,
    maxTurns: 1,
  },
  judge: {
    model: "test/model",
    tools: false,
    thinking: "standard" as const,
    outputMode: "json" as const,
    maxTurns: 1,
  },
  analyst: {
    model: "test/model",
    tools: false,
    thinking: "standard" as const,
    outputMode: "json" as const,
    maxTurns: 1,
  },
  player: {
    model: "test/model",
    tools: false,
    thinking: "standard" as const,
    outputMode: "json" as const,
    maxTurns: 1,
  },
};

function makeTopology(overrides: Partial<TopologyConfig> = {}): TopologyConfig {
  return {
    slug: "demo",
    name: "Demo",
    nodes: ["leader", "n1", "n2"],
    edges: [
      { from: "leader", to: "n1", bidir: true },
      { from: "leader", to: "n2", bidir: true },
    ],
    leader: "leader",
    developers: ["n1", "n2"],
    integrators: ["leader"],
    culture: null,
    ...overrides,
  };
}

function makeRunConfigInput(topology: TopologyConfig): RunConfig {
  return {
    topology,
    seed: 1,
    maxRounds: 4,
    perRoundTimeoutMs: 60_000,
    brief: "demo brief",
    models: minimalModels,
    runBudget: {
      tokens: 1_000_000,
      wallClockMs: 1_800_000,
    },
  };
}

test("validateTopology accepts developers and integrators arrays as subsets of nodes", () => {
  const topology = makeTopology();
  const config = defineRunConfig(makeRunConfigInput(topology));

  assert.deepEqual(config.topology.developers, ["n1", "n2"]);
  assert.deepEqual(config.topology.integrators, ["leader"]);
});

test("validateTopology rejects developers entries that are not nodes", () => {
  const topology = makeTopology({ developers: ["n1", "ghost"] });

  assert.throws(
    () => defineRunConfig(makeRunConfigInput(topology)),
    /topology\.developers/i,
  );
});

test("validateTopology rejects integrators entries that are not nodes", () => {
  const topology = makeTopology({ integrators: ["leader", "ghost"] });

  assert.throws(
    () => defineRunConfig(makeRunConfigInput(topology)),
    /topology\.integrators/i,
  );
});

test("validateTopology rejects when a developer has no integrator neighbor", () => {
  const topology = makeTopology({
    nodes: ["leader", "n1", "n2"],
    edges: [
      { from: "leader", to: "n1", bidir: true },
      // n2 only connects to n1, not to leader
      { from: "n1", to: "n2", bidir: true },
    ],
    developers: ["n1", "n2"],
    integrators: ["leader"],
  });

  assert.throws(
    () => defineRunConfig(makeRunConfigInput(topology)),
    /n2.*integrator/i,
  );
});

test("validateTopology allows solo topology with no integrators when there is exactly one node", () => {
  const topology = makeTopology({
    slug: "solo",
    name: "Solo",
    nodes: ["leader"],
    edges: [],
    developers: ["leader"],
    integrators: [],
  });

  const config = defineRunConfig(makeRunConfigInput(topology));
  assert.deepEqual(config.topology.integrators, []);
});

test("buildNodeCommonContext lists role flags and integrator neighbors", () => {
  const topology = makeTopology();
  const context = buildNodeCommonContext({
    runId: "demo",
    topology,
    nodeId: "n1",
  });

  assert.match(context, /Roles: developer/);
  assert.doesNotMatch(context, /Roles: developer, integrator/);
  assert.match(context, /Integrator neighbors: leader/);
});

test("buildNodeCommonContext shows both roles for a developer-and-integrator node", () => {
  const topology = makeTopology({
    developers: ["leader", "n1", "n2"],
    integrators: ["leader", "n1", "n2"],
  });
  const context = buildNodeCommonContext({
    runId: "demo",
    topology,
    nodeId: "n1",
  });

  assert.match(context, /Roles: developer, integrator/);
});

test("buildNodeCommonContext omits developer role for an integrator-only node", () => {
  const topology = makeTopology({
    developers: ["n1", "n2"],
    integrators: ["leader"],
  });
  const context = buildNodeCommonContext({
    runId: "demo",
    topology,
    nodeId: "leader",
  });

  assert.match(context, /Roles: integrator/);
  assert.doesNotMatch(context, /Roles: developer/);
});

test("buildNodeCommonContext includes the PR workflow compliance block", () => {
  const topology = makeTopology();
  const context = buildNodeCommonContext({
    runId: "demo",
    topology,
    nodeId: "n1",
  });

  assert.match(context, /Every code change lands via PR\./);
  assert.match(context, /You cannot merge your own PR\./);
  assert.match(context, /the reviewer owns the merge/);
  assert.match(context, /Never push directly to run\/demo\/main/);
});

test("buildNodeCommonContext skips PR rules for solo (zero integrators)", () => {
  const topology = makeTopology({
    slug: "solo",
    name: "Solo",
    nodes: ["leader"],
    edges: [],
    developers: ["leader"],
    integrators: [],
  });
  const context = buildNodeCommonContext({
    runId: "solo",
    topology,
    nodeId: "leader",
  });

  assert.doesNotMatch(context, /You cannot merge your own PR/);
  assert.match(context, /Push directly to run\/solo\/main/);
});

test("verifyRunMainMergeAuthority allows merges from any node in topology.integrators", () => {
  const topology = makeTopology({
    developers: ["leader", "n1", "n2"],
    integrators: ["leader", "n1"],
  });

  const violations = verifyRunMainMergeAuthority({
    topology,
    nodeTurns: [
      {
        nodeId: "n1",
        toolCalls: [
          { tool: "bash", input: "gh pr merge 7 --squash", status: "success" },
        ],
      },
      {
        nodeId: "n2",
        toolCalls: [
          { tool: "bash", input: "gh pr merge 8 --squash", status: "success" },
        ],
      },
    ],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]!.nodeId, "n2");
  assert.match(violations[0]!.reason, /not allowed to merge/i);
});

test("stripBenchmarkRunLabelsForTopology removes benchmark-run label from PRs across all seeds for a topology", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  const runner = async (input: {
    command: string;
    args: string[];
  }): Promise<CommandResult> => {
    calls.push({ command: input.command, args: [...input.args] });

    const isList =
      input.command === "gh" &&
      input.args[0] === "pr" &&
      input.args[1] === "list";

    if (isList) {
      // Mix of facebook PRs (some with run:facebook-seed-*), some with other run labels
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          {
            number: 101,
            labels: [
              { name: "benchmark-run" },
              { name: "run:facebook-seed-01" },
            ],
          },
          {
            number: 102,
            labels: [
              { name: "benchmark-run" },
              { name: "run:facebook-seed-02" },
            ],
          },
          {
            number: 103,
            labels: [{ name: "benchmark-run" }, { name: "run:apple-seed-01" }],
          },
          {
            number: 104,
            labels: [
              { name: "benchmark-run" },
              { name: "run:facebook-seed-99" },
            ],
          },
        ]),
        stderr: "",
      };
    }

    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const stripped = await stripBenchmarkRunLabelsForTopology({
    topologySlug: "facebook",
    runner,
  });

  // Only facebook-seed-* PRs (not apple-seed-01)
  assert.deepEqual(stripped.sort((a, b) => a - b), [101, 102, 104]);

  const listCall = calls.find(
    (c) => c.command === "gh" && c.args[0] === "pr" && c.args[1] === "list",
  );
  assert.ok(listCall, "expected a gh pr list call");
  assert.ok(
    listCall!.args.includes("--label") &&
      listCall!.args[listCall!.args.indexOf("--label") + 1] === "benchmark-run",
    "expected --label benchmark-run",
  );
  assert.ok(
    listCall!.args.includes("--state") && listCall!.args.includes("all"),
    "expected --state all to include closed PRs",
  );

  const editCalls = calls.filter(
    (c) => c.command === "gh" && c.args[0] === "pr" && c.args[1] === "edit",
  );
  assert.equal(editCalls.length, 3);
  for (const call of editCalls) {
    assert.ok(call.args.includes("--remove-label"));
    const idx = call.args.indexOf("--remove-label");
    assert.equal(call.args[idx + 1], "benchmark-run");
  }
});
