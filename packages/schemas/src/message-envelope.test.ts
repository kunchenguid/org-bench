import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ArtifactJudgeOutput,
  EvaluatorStepRecord,
  MessageEnvelope,
  MetaJson,
  NodeTurnRecord,
  OrchestratorEvent,
  PatchDecision,
  PRSnapshot,
  TrajectoryJsonSchemas,
  TrajectoryAnalysisOutput,
} from "./index.js";

const trajectorySchemaDir = resolve(
  process.cwd(),
  "..",
  "..",
  "schemas",
  "trajectory",
);

function hasSchemaVersionConst(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const properties = record.properties;

  if (properties && typeof properties === "object") {
    const schemaVersion = (properties as Record<string, unknown>)
      .schema_version;

    if (
      schemaVersion &&
      typeof schemaVersion === "object" &&
      (schemaVersion as { const?: unknown }).const === 1
    ) {
      return true;
    }
  }

  return Object.values(record).some((child) => hasSchemaVersionConst(child));
}

test("MessageEnvelope parses a valid routed message", () => {
  const parsed = MessageEnvelope.parse({
    run_id: "apple-seed-03",
    round: 2,
    from: "leader",
    to: "n1",
    schema_version: 1,
    ts: "2026-04-16T12:00:00.000Z",
    tag: "decompose",
    content: "Build the rules page.",
  });

  assert.equal(parsed.run_id, "apple-seed-03");
  assert.equal(parsed.tag, "decompose");
});

test("MessageEnvelope rejects empty content", () => {
  assert.throws(() => {
    MessageEnvelope.parse({
      run_id: "apple-seed-03",
      round: 2,
      from: "leader",
      to: "n1",
      schema_version: 1,
      ts: "2026-04-16T12:00:00.000Z",
      content: "",
    });
  });
});

test("OrchestratorEvent parses every Phase 1 event variant", () => {
  const events = [
    {
      type: "routing_rejection",
      run_id: "apple-seed-03",
      round: 2,
      schema_version: 1,
      ts: "2026-04-16T12:00:00.000Z",
      node_id: "leader",
      attempted_message: {
        from: "leader",
        to: "n9",
        tag: "status",
      },
      reason: "No edge exists from leader to n9.",
    },
    {
      type: "merge",
      run_id: "apple-seed-03",
      round: 3,
      schema_version: 1,
      ts: "2026-04-16T12:01:00.000Z",
      integrator: "leader",
      branch: "run/apple-seed-03/jamie",
      sha: "abc1234",
      disposition: "accepted",
      rationale: "Play page is ready to land.",
    },
    {
      type: "failure",
      run_id: "apple-seed-03",
      round: 4,
      schema_version: 1,
      ts: "2026-04-16T12:02:00.000Z",
      node_id: "n1",
      failure_kind: "timeout",
      detail: "Node exceeded per-round timeout.",
    },
    {
      type: "submission",
      run_id: "apple-seed-03",
      round: 5,
      schema_version: 1,
      ts: "2026-04-16T12:03:00.000Z",
      node_id: "leader",
      detail: "Submitting run/apple-seed-03/main for evaluation.",
    },
    {
      type: "cap_exceeded",
      run_id: "apple-seed-03",
      round: 6,
      schema_version: 1,
      ts: "2026-04-16T12:04:00.000Z",
      cap: "tokens",
      limit: 5000000,
      actual: 5001024,
    },
    {
      type: "pr_activity_unsummarized",
      run_id: "apple-seed-03",
      round: 7,
      schema_version: 1,
      ts: "2026-04-16T12:05:00.000Z",
      node_id: "n2",
      detail:
        "Observed gh pr review without a matching PR URL in outbound messages.",
    },
    {
      type: "stage_failed",
      run_id: "apple-seed-03",
      round: 8,
      schema_version: 1,
      ts: "2026-04-16T12:06:00.000Z",
      stage: "evaluator",
      detail: "agent-browser exited with code 1: CDP command timed out.",
    },
  ];

  const parsed = events.map((event) => OrchestratorEvent.parse(event));

  assert.equal(parsed[0].type, "routing_rejection");
  assert.equal(parsed[1].type, "merge");
  assert.equal(parsed[2].type, "failure");
  assert.equal(parsed[3].type, "submission");
  assert.equal(parsed[4].type, "cap_exceeded");
  assert.equal(parsed[5].type, "pr_activity_unsummarized");
  assert.equal(parsed[6].type, "stage_failed");
});

test("OrchestratorEvent rejects unknown event types", () => {
  assert.throws(() => {
    OrchestratorEvent.parse({
      type: "unknown",
      run_id: "apple-seed-03",
      round: 2,
      schema_version: 1,
      ts: "2026-04-16T12:00:00.000Z",
    });
  });
});

test("TrajectoryJsonSchemas exports frozen JSON Schemas for every trajectory artifact", () => {
  assert.deepEqual(Object.keys(TrajectoryJsonSchemas).sort(), [
    "artifact-judge-output",
    "evaluator-step-record",
    "message-envelope",
    "meta",
    "node-turn-record",
    "orchestrator-event",
    "patch-decision",
    "pr-snapshot",
    "trajectory-analysis-output",
  ]);

  for (const [fileName, schema] of Object.entries(TrajectoryJsonSchemas)) {
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.equal(hasSchemaVersionConst(schema), true);

    const filePath = resolve(trajectorySchemaDir, `${fileName}.schema.json`);
    assert.equal(existsSync(filePath), true);

    const fileContents = JSON.parse(readFileSync(filePath, "utf8"));
    assert.deepEqual(fileContents, schema);
  }
});

test("NodeTurnRecord parses a node turn with prompt refs and tool calls", () => {
  const parsed = NodeTurnRecord.parse({
    run_id: "apple-seed-03",
    node_id: "n2",
    round: 3,
    turn: 1,
    schema_version: 1,
    ts: "2026-04-16T12:06:00.000Z",
    prompt_refs: ["trajectory/blobs/prompt-1.md"],
    output: {
      messages: [
        {
          to: "leader",
          tag: "status",
          content: "Jamie updated the play page branch and opened a PR.",
        },
      ],
      summary: "Reported progress and handed off the branch for review.",
    },
    tool_calls: [
      {
        tool: "bash",
        input: "git status --short",
        status: "success",
      },
      {
        tool: "bash",
        input:
          "gh pr create --title 'Play page' --body 'Author: Jamie (worker, node n2)'",
        status: "success",
        duration_ms: 1820,
      },
    ],
    tokens: {
      in: 1200,
      out: 280,
    },
    model: "openai/gpt-5.4",
    latency_ms: 6420,
    cost_usd: 0.0831,
  });

  assert.equal(parsed.node_id, "n2");
  assert.equal(parsed.output.messages[0]?.tag, "status");
  assert.equal(parsed.tool_calls[1]?.duration_ms, 1820);
});

test("NodeTurnRecord rejects negative token counts", () => {
  assert.throws(() => {
    NodeTurnRecord.parse({
      run_id: "apple-seed-03",
      node_id: "n2",
      round: 3,
      turn: 1,
      schema_version: 1,
      ts: "2026-04-16T12:06:00.000Z",
      prompt_refs: ["trajectory/blobs/prompt-1.md"],
      output: {
        messages: [],
      },
      tool_calls: [],
      tokens: {
        in: -1,
        out: 280,
      },
      model: "openai/gpt-5.4",
      latency_ms: 6420,
      cost_usd: 0.0831,
    });
  });
});

test("EvaluatorStepRecord parses a player action step with snapshots and console errors", () => {
  const parsed = EvaluatorStepRecord.parse({
    run_id: "apple-seed-03",
    scenario: "completes-a-turn",
    attempt: 2,
    step: 4,
    schema_version: 1,
    ts: "2026-04-16T12:07:00.000Z",
    goal: "Complete a full turn and pass to the AI.",
    snapshot_before_ref: "trajectory/blobs/evaluator/step-4-before.json",
    action: {
      type: "click",
      uid: "uid-42",
    },
    snapshot_after_ref: "trajectory/blobs/evaluator/step-4-after.json",
    console_errors: [
      "Error: Failed to load card portrait asset from relative path ./assets/cards/flame.png",
    ],
    tokens: {
      in: 980,
      out: 94,
    },
    model: "openai/gpt-5.4",
    latency_ms: 2140,
    cost_usd: 0.0192,
  });

  assert.equal(parsed.action.type, "click");
  assert.equal(parsed.action.uid, "uid-42");
  assert.equal(parsed.console_errors.length, 1);
});

test("EvaluatorStepRecord rejects unsupported player action types", () => {
  assert.throws(() => {
    EvaluatorStepRecord.parse({
      run_id: "apple-seed-03",
      scenario: "completes-a-turn",
      attempt: 1,
      step: 1,
      schema_version: 1,
      ts: "2026-04-16T12:07:00.000Z",
      goal: "Complete a full turn and pass to the AI.",
      snapshot_before_ref: "trajectory/blobs/evaluator/step-1-before.json",
      action: {
        type: "drag",
        uid: "uid-99",
      },
      snapshot_after_ref: "trajectory/blobs/evaluator/step-1-after.json",
      console_errors: [],
      tokens: {
        in: 300,
        out: 25,
      },
      model: "openai/gpt-5.4",
      latency_ms: 840,
      cost_usd: 0.005,
    });
  });
});

test("PatchDecision parses an integrator decision for a branch handoff", () => {
  const parsed = PatchDecision.parse({
    run_id: "apple-seed-03",
    patch_id: "patch-0007",
    integrator: "leader",
    round: 4,
    schema_version: 1,
    ts: "2026-04-16T12:08:00.000Z",
    branch: "run/apple-seed-03/jamie",
    sha: "abc123def456",
    disposition: "accepted",
    rationale: "Jamie's branch cleanly adds the rules page and can land as-is.",
  });

  assert.equal(parsed.integrator, "leader");
  assert.equal(parsed.disposition, "accepted");
});

test("PatchDecision rejects unsupported dispositions", () => {
  assert.throws(() => {
    PatchDecision.parse({
      run_id: "apple-seed-03",
      patch_id: "patch-0007",
      integrator: "leader",
      round: 4,
      schema_version: 1,
      ts: "2026-04-16T12:08:00.000Z",
      branch: "run/apple-seed-03/jamie",
      sha: "abc123def456",
      disposition: "merged",
      rationale: "Invalid disposition value for the patch decision schema.",
    });
  });
});

test("PRSnapshot parses a frozen PR snapshot with reviewers, timeline, and comments", () => {
  const parsed = PRSnapshot.parse({
    run_id: "apple-seed-03",
    pr_number: 41,
    schema_version: 1,
    url: "https://github.com/kunchenguid/org-bench/pull/41",
    author: {
      agent_name: "Jamie",
      node_id: "n2",
    },
    title: "Add play page hand rendering",
    body: "Author: Jamie (worker, node n2)\n\nAdds playable hand rendering.",
    reviewers: [
      {
        agent_name: "Riley",
        node_id: "leader",
      },
    ],
    state_timeline: [
      {
        state: "opened",
        ts: "2026-04-16T12:09:00.000Z",
      },
      {
        state: "approved",
        ts: "2026-04-16T12:12:00.000Z",
      },
      {
        state: "merged",
        ts: "2026-04-16T12:14:00.000Z",
      },
    ],
    comments: [
      {
        author: {
          agent_name: "Riley",
          node_id: "leader",
        },
        body: "**Riley (leader):** Merging this after a quick visual pass.",
        ts: "2026-04-16T12:13:00.000Z",
      },
    ],
  });

  assert.equal(parsed.pr_number, 41);
  assert.equal(parsed.author.agent_name, "Jamie");
  assert.equal(parsed.state_timeline[1]?.state, "approved");
});

test("PRSnapshot rejects unsupported PR timeline states", () => {
  assert.throws(() => {
    PRSnapshot.parse({
      run_id: "apple-seed-03",
      pr_number: 41,
      schema_version: 1,
      url: "https://github.com/kunchenguid/org-bench/pull/41",
      author: {
        agent_name: "Jamie",
        node_id: "n2",
      },
      title: "Add play page hand rendering",
      body: "Author: Jamie (worker, node n2)",
      reviewers: [],
      state_timeline: [
        {
          state: "ready_for_review",
          ts: "2026-04-16T12:09:00.000Z",
        },
      ],
      comments: [],
    });
  });
});

test("ArtifactJudgeOutput parses rubric scores, rationale, and judge metadata", () => {
  const parsed = ArtifactJudgeOutput.parse({
    run_id: "apple-seed-03",
    schema_version: 1,
    prompt_version: "artifact-judge.v1",
    rubric: {
      gameplay_completeness: 4,
      rules_clarity: 5,
      content_cohesion: 4,
      visual_polish: 3,
      navigation: 5,
    },
    rationale:
      "The game loop is functional and the rules are understandable, but the presentation still looks a bit rough in the play flow.",
    model: "openai/gpt-5.4",
    tokens: {
      in: 1820,
      out: 410,
    },
    cost_usd: 0.0643,
  });

  assert.equal(parsed.rubric.rules_clarity, 5);
  assert.equal(parsed.prompt_version, "artifact-judge.v1");
});

test("ArtifactJudgeOutput rejects rubric scores outside the 1-5 range", () => {
  assert.throws(() => {
    ArtifactJudgeOutput.parse({
      run_id: "apple-seed-03",
      schema_version: 1,
      prompt_version: "artifact-judge.v1",
      rubric: {
        gameplay_completeness: 0,
        rules_clarity: 5,
        content_cohesion: 4,
        visual_polish: 3,
        navigation: 5,
      },
      rationale: "Invalid rubric score should be rejected.",
      model: "openai/gpt-5.4",
      tokens: {
        in: 1820,
        out: 410,
      },
      cost_usd: 0.0643,
    });
  });
});

test("TrajectoryAnalysisOutput parses a narrative with structured coordination observations", () => {
  const parsed = TrajectoryAnalysisOutput.parse({
    run_id: "apple-seed-03",
    schema_version: 1,
    prompt_version: "trajectory-analyst.v1",
    narrative:
      "Riley kept the brief centralized, delegated the rules page early, and later pulled gameplay integration back to the leader when cross-edge coordination stayed sparse.",
    observations: {
      edge_utilization: [
        {
          from: "leader",
          to: "n1",
          forward_messages: 4,
          reverse_messages: 2,
        },
      ],
      decomposition: {
        leader_direct_subtasks: 3,
        max_delegation_depth: 2,
      },
      idle_neighbors: [
        {
          from: "n3",
          to: "n4",
        },
      ],
      patch_churn: {
        superseded: 1,
        reverted: 0,
        rewritten: 2,
      },
      incidents: [
        {
          kind: "miscommunication",
          summary:
            "Jamie implemented the gallery on a stale assumption about the card data shape, which forced a later rewrite.",
          refs: [
            {
              file: "messages.jsonl",
              line: 18,
            },
            {
              file: "events.jsonl",
              line: 7,
            },
          ],
        },
      ],
    },
    model: "openai/gpt-5.4",
    tokens: {
      in: 4200,
      out: 680,
    },
    cost_usd: 0.1184,
  });

  assert.equal(parsed.prompt_version, "trajectory-analyst.v1");
  assert.equal(parsed.observations.edge_utilization[0]?.forward_messages, 4);
  assert.equal(parsed.observations.incidents[0]?.kind, "miscommunication");
});

test("TrajectoryAnalysisOutput rejects incident references without positive line numbers", () => {
  assert.throws(() => {
    TrajectoryAnalysisOutput.parse({
      run_id: "apple-seed-03",
      schema_version: 1,
      prompt_version: "trajectory-analyst.v1",
      narrative: "Leader delegation remained narrow throughout the run.",
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
        incidents: [
          {
            kind: "brief_handoff",
            summary:
              "Leader forwarded the full task brief in a single message.",
            refs: [
              {
                file: "messages.jsonl",
                line: 0,
              },
            ],
          },
        ],
      },
      model: "openai/gpt-5.4",
      tokens: {
        in: 1200,
        out: 200,
      },
      cost_usd: 0.031,
    });
  });
});

test("MetaJson parses derived run aggregates and pinned config metadata", () => {
  const parsed = MetaJson.parse({
    run_id: "apple-seed-03",
    schema_version: 1,
    topology: {
      slug: "apple",
      name: "Apple",
      leader_id: "leader",
      node_count: 9,
      culture: null,
    },
    seed: 3,
    brief: {
      path: "configs/brief.md",
      content_hash:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    models: {
      node: "openai/gpt-5.4",
      evaluator: "openai/gpt-5.4",
      judge: "openai/gpt-5.4",
      analyst: "openai/gpt-5.4",
    },
    prompts: {
      evaluator_scenarios_version: "evaluator-scenarios.v1",
      judge_prompt_version: "artifact-judge.v1",
      analyst_prompt_version: "trajectory-analyst.v1",
    },
    totals: {
      tokens: {
        in: 8200,
        out: 2100,
        total: 10300,
      },
      cost_usd: 1.284,
      wall_clock_ms: 542000,
    },
    tokens_by_node: {
      leader: {
        in: 3100,
        out: 900,
        total: 4000,
        cost_usd: 0.44,
      },
      n1: {
        in: 1400,
        out: 380,
        total: 1780,
        cost_usd: 0.21,
      },
    },
    messages: {
      total: 18,
      by_tag: {
        decompose: 4,
        ask: 2,
        answer: 2,
        deliver: 3,
        status: 5,
        review: 1,
        untagged: 1,
      },
    },
    patches: {
      proposed: 4,
      accepted: 2,
      rejected: 1,
      superseded: 1,
    },
    evaluator: {
      attempts_per_scenario: 3,
      overall_pass_rate: 6 / 7,
      scenarios: {
        "loads-cleanly": {
          passed_attempts: 3,
          total_attempts: 3,
          pass_rate: 1,
        },
        persists: {
          passed_attempts: 1,
          total_attempts: 3,
          pass_rate: 1 / 3,
        },
      },
    },
    artifact: {
      deploy_success: true,
      build_success: true,
      published_path: "docs/runs/apple/seed-03",
    },
    milestones: {
      time_to_first_playable_build_ms: 301000,
      time_to_first_passing_scenario_ms: 415000,
    },
    flags: {
      cap_exceeded: false,
      truncated_blobs: false,
      routing_rejections: 0,
      pr_activity_unsummarized: 1,
      node_failures: 0,
    },
  });

  assert.equal(parsed.topology.slug, "apple");
  assert.equal(parsed.totals.tokens.total, 10300);
  assert.equal(parsed.evaluator.scenarios["loads-cleanly"]?.pass_rate, 1);
});

test("MetaJson rejects impossible evaluator pass rates", () => {
  assert.throws(() => {
    MetaJson.parse({
      run_id: "apple-seed-03",
      schema_version: 1,
      topology: {
        slug: "apple",
        name: "Apple",
        leader_id: "leader",
        node_count: 9,
        culture: null,
      },
      seed: 3,
      brief: {
        path: "configs/brief.md",
        content_hash:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
      models: {
        node: "openai/gpt-5.4",
        evaluator: "openai/gpt-5.4",
        judge: "openai/gpt-5.4",
        analyst: "openai/gpt-5.4",
      },
      prompts: {
        evaluator_scenarios_version: "evaluator-scenarios.v1",
        judge_prompt_version: "artifact-judge.v1",
        analyst_prompt_version: "trajectory-analyst.v1",
      },
      totals: {
        tokens: {
          in: 10,
          out: 5,
          total: 15,
        },
        cost_usd: 0.01,
        wall_clock_ms: 1000,
      },
      tokens_by_node: {},
      messages: {
        total: 0,
        by_tag: {
          decompose: 0,
          ask: 0,
          answer: 0,
          deliver: 0,
          status: 0,
          review: 0,
          untagged: 0,
        },
      },
      patches: {
        proposed: 0,
        accepted: 0,
        rejected: 0,
        superseded: 0,
      },
      evaluator: {
        attempts_per_scenario: 3,
        overall_pass_rate: 1.2,
        scenarios: {},
      },
      artifact: {
        deploy_success: false,
        build_success: false,
        published_path: "docs/runs/apple/seed-03",
      },
      milestones: {
        time_to_first_playable_build_ms: null,
        time_to_first_passing_scenario_ms: null,
      },
      flags: {
        cap_exceeded: false,
        truncated_blobs: false,
        routing_rejections: 0,
        pr_activity_unsummarized: 0,
        node_failures: 0,
      },
    });
  });
});
