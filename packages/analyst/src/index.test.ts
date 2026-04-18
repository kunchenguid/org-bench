import assert from "node:assert/strict";
import test from "node:test";

import { SCHEMA_VERSION } from "@org-bench/schemas";

import {
  loadAnalystPrompt,
  runTrajectoryAnalyst,
  trajectoryAnalystPromptV1,
} from "./index.js";

test("loads the trajectory analyst v1 prompt with required analysis guidance", () => {
  assert.equal(trajectoryAnalystPromptV1.version, "trajectory-analyst.v1");
  assert.equal(
    loadAnalystPrompt("trajectory-analyst.v1"),
    trajectoryAnalystPromptV1,
  );

  for (const requiredPhrase of [
    "readable account of the run",
    "how the leader used the brief",
    "which edges were active vs idle",
    "where work got duplicated or reverted",
    "what finally shipped",
    "edge utilization map",
    "decomposition fan-out",
    "idle neighbors",
    "patch churn",
    "incident pointers",
    "do not assign a coordination score",
  ]) {
    assert.match(
      trajectoryAnalystPromptV1.system,
      new RegExp(requiredPhrase, "i"),
    );
  }
});

test("rejects unknown analyst prompt versions", () => {
  assert.throws(
    () => loadAnalystPrompt("trajectory-analyst.v9"),
    /Unknown analyst prompt version/,
  );
});

test("runs the trajectory analyst through OpenCode JSON mode and stamps prompt metadata", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    cwd?: string;
  }> = [];

  const result = await runTrajectoryAnalyst({
    runId: "apple-seed-02",
    cwd: "/tmp/analysis-run",
    trajectorySummary: "Messages, events, PR snapshots, and meta aggregates.",
    model: "openai/gpt-5.4",
    runner: async ({ command, args, cwd }) => {
      calls.push({ command, args, cwd });

      return {
        stdout: [
          JSON.stringify({
            type: "text",
            part: {
              type: "text",
              text: "Reading the run.",
              metadata: { openai: { phase: "commentary" } },
            },
          }),
          JSON.stringify({
            type: "text",
            part: {
              type: "text",
              text: JSON.stringify({
                narrative:
                  "The leader pushed early decomposition and merged one cohesive direction.",
                observations: {
                  edge_utilization: [
                    {
                      from: "leader",
                      to: "node-2",
                      forward_messages: 4,
                      reverse_messages: 2,
                    },
                  ],
                  decomposition: {
                    leader_direct_subtasks: 3,
                    max_delegation_depth: 2,
                  },
                  idle_neighbors: [{ from: "node-3", to: "node-4" }],
                  patch_churn: {
                    superseded: 1,
                    reverted: 0,
                    rewritten: 1,
                  },
                  incidents: [
                    {
                      kind: "brief_handoff",
                      summary: "The leader delegated the combat loop early.",
                      refs: [{ file: "messages.jsonl", line: 8 }],
                    },
                  ],
                },
              }),
              metadata: { openai: { phase: "final_answer" } },
            },
          }),
          JSON.stringify({
            type: "step_finish",
            part: {
              tokens: {
                input: 222,
                output: 88,
              },
            },
          }),
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "opencode");
  assert.deepEqual(calls[0]?.args.slice(0, 3), ["run", "--format", "json"]);
  assert.equal(calls[0]?.cwd, "/tmp/analysis-run");
  assert.match(calls[0]?.args[3] ?? "", /reply with only valid json/i);
  assert.match(calls[0]?.args[3] ?? "", /incident pointers/i);

  assert.deepEqual(result, {
    run_id: "apple-seed-02",
    schema_version: SCHEMA_VERSION,
    prompt_version: "trajectory-analyst.v1",
    narrative:
      "The leader pushed early decomposition and merged one cohesive direction.",
    observations: {
      edge_utilization: [
        {
          from: "leader",
          to: "node-2",
          forward_messages: 4,
          reverse_messages: 2,
        },
      ],
      decomposition: {
        leader_direct_subtasks: 3,
        max_delegation_depth: 2,
      },
      idle_neighbors: [{ from: "node-3", to: "node-4" }],
      patch_churn: {
        superseded: 1,
        reverted: 0,
        rewritten: 1,
      },
      incidents: [
        {
          kind: "brief_handoff",
          summary: "The leader delegated the combat loop early.",
          refs: [{ file: "messages.jsonl", line: 8 }],
        },
      ],
    },
    model: "openai/gpt-5.4",
    tokens: {
      in: 222,
      out: 88,
    },
    cost_usd: 0,
  });
});

test("runTrajectoryAnalyst can reuse an OpenCode serve session with structured output", async () => {
  let shellRunnerCalled = false;
  const prompts: string[] = [];
  const structuredOutput = {
    narrative: "The run stayed centralized and coherent.",
    observations: {
      edge_utilization: [],
      decomposition: {
        leader_direct_subtasks: 1,
        max_delegation_depth: 1,
      },
      idle_neighbors: [],
      patch_churn: {
        superseded: 0,
        reverted: 0,
        rewritten: 0,
      },
      incidents: [],
    },
  };

  const result = await runTrajectoryAnalyst({
    runId: "apple-seed-03",
    cwd: "/tmp/analysis-run",
    trajectorySummary: "Node turns and events.",
    model: "openai/gpt-5.4",
    runner: async () => {
      shellRunnerCalled = true;
      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
      };
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4321",
      sessionId: "session-123",
      sendPrompt: async <TStructured>({ prompt }: { prompt: string }) => {
        prompts.push(prompt);

        return {
          response: {
            info: {
              structured: structuredOutput,
            },
          },
          finalText: null,
          structured: structuredOutput as TStructured,
          tokens: {
            in: 44,
            out: 17,
          },
        };
      },
    },
  });

  assert.equal(shellRunnerCalled, false);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /trajectory summary:/i);
  assert.deepEqual(result, {
    run_id: "apple-seed-03",
    schema_version: SCHEMA_VERSION,
    prompt_version: "trajectory-analyst.v1",
    ...structuredOutput,
    model: "openai/gpt-5.4",
    tokens: {
      in: 44,
      out: 17,
    },
    cost_usd: 0,
  });
});
