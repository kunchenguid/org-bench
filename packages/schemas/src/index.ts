import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SCHEMA_VERSION = 1;

export const ORCHESTRATOR_SENDER = "orchestrator" as const;

export const MessageEnvelope = z.object({
  run_id: z.string().min(1),
  round: z.number().int().positive(),
  from: z.string().min(1),
  to: z.string().min(1),
  schema_version: z.literal(SCHEMA_VERSION),
  ts: z.string().min(1),
  tag: z
    .enum([
      "decompose",
      "ask",
      "answer",
      "deliver",
      "status",
      "review",
      "system-timeout",
      "system-kickoff",
      "system-stall",
    ])
    .optional(),
  content: z.string().min(1),
});

export type MessageEnvelope = z.infer<typeof MessageEnvelope>;

// Agent-authored outbound tags. Does NOT include system-* tags, which are
// reserved for orchestrator-injected messages.
const MessageTag = z.enum([
  "decompose",
  "ask",
  "answer",
  "deliver",
  "status",
  "review",
]);

const AgentIdentity = z.object({
  agent_name: z.string().min(1),
  node_id: z.string().min(1),
});

const NodeOutboundMessage = z.object({
  to: z.string().min(1),
  tag: MessageTag.optional(),
  content: z.string().min(1),
});

const NodeToolCall = z.object({
  tool: z.string().min(1),
  input: z.string().min(1),
  status: z.enum(["success", "error"]),
  duration_ms: z.number().int().nonnegative().optional(),
});

export const NodeTurnRecord = z.object({
  run_id: z.string().min(1),
  node_id: z.string().min(1),
  round: z.number().int().positive(),
  turn: z.number().int().positive(),
  schema_version: z.literal(SCHEMA_VERSION),
  ts: z.string().min(1),
  prompt_refs: z.array(z.string().min(1)),
  output: z.object({
    messages: z.array(NodeOutboundMessage),
    summary: z.string().min(1).optional(),
  }),
  tool_calls: z.array(NodeToolCall),
  tokens: z.object({
    in: z.number().int().nonnegative(),
    out: z.number().int().nonnegative(),
  }),
  model: z.string().min(1),
  latency_ms: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  aborted: z.boolean().optional(),
  aborted_partial_text: z.string().min(1).optional(),
});

export type NodeTurnRecord = z.infer<typeof NodeTurnRecord>;

export const PatchDecision = z.object({
  run_id: z.string().min(1),
  patch_id: z.string().min(1),
  integrator: z.string().min(1),
  round: z.number().int().positive(),
  schema_version: z.literal(SCHEMA_VERSION),
  ts: z.string().min(1),
  branch: z.string().min(1),
  sha: z.string().min(1),
  disposition: z.enum(["accepted", "rejected", "superseded"]),
  rationale: z.string().min(1),
});

export type PatchDecision = z.infer<typeof PatchDecision>;

export const PRSnapshot = z.object({
  run_id: z.string().min(1),
  pr_number: z.number().int().positive(),
  schema_version: z.literal(SCHEMA_VERSION),
  url: z.string().url(),
  author: AgentIdentity,
  title: z.string().min(1),
  body: z.string(),
  reviewers: z.array(AgentIdentity),
  state_timeline: z.array(
    z.object({
      state: z.enum([
        "opened",
        "approved",
        "changes-requested",
        "merged",
        "closed",
      ]),
      ts: z.string().min(1),
    }),
  ),
  comments: z.array(
    z.object({
      author: AgentIdentity,
      body: z.string().min(1),
      ts: z.string().min(1),
    }),
  ),
});

export type PRSnapshot = z.infer<typeof PRSnapshot>;

const RubricScore = z.number().int().min(1).max(5);

export const ArtifactJudgeOutput = z.object({
  run_id: z.string().min(1),
  schema_version: z.literal(SCHEMA_VERSION),
  rubric: z.object({
    functional_completeness: RubricScore,
    learnability: RubricScore,
    visual_cohesion: RubricScore,
    visual_polish: RubricScore,
    state_legibility: RubricScore,
    aesthetics: RubricScore,
    interaction_feel: RubricScore,
    practical_utility: RubricScore,
  }),
  rationale: z.string().min(1),
  model: z.string().min(1),
  tokens: z.object({
    in: z.number().int().nonnegative(),
    out: z.number().int().nonnegative(),
  }),
  cost_usd: z.number().nonnegative(),
});

export type ArtifactJudgeOutput = z.infer<typeof ArtifactJudgeOutput>;

export const TrajectoryAnalysisOutput = z.object({
  run_id: z.string().min(1),
  schema_version: z.literal(SCHEMA_VERSION),
  narrative: z.string().min(1),
  observations: z.object({
    edge_utilization: z.array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        forward_messages: z.number().int().nonnegative(),
        reverse_messages: z.number().int().nonnegative(),
      }),
    ),
    decomposition: z.object({
      leader_direct_subtasks: z.number().int().nonnegative(),
      max_delegation_depth: z.number().int().nonnegative(),
    }),
    idle_neighbors: z.array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
      }),
    ),
    patch_churn: z.object({
      superseded: z.number().int().nonnegative(),
      reverted: z.number().int().nonnegative(),
      rewritten: z.number().int().nonnegative(),
    }),
    incidents: z.array(
      z.object({
        kind: z.enum([
          "brief_handoff",
          "miscommunication",
          "integration_failure",
        ]),
        summary: z.string().min(1),
        refs: z.array(
          z.object({
            file: z.string().min(1),
            line: z.number().int().positive(),
          }),
        ),
      }),
    ),
  }),
  model: z.string().min(1),
  tokens: z.object({
    in: z.number().int().nonnegative(),
    out: z.number().int().nonnegative(),
  }),
  cost_usd: z.number().nonnegative(),
});

export type TrajectoryAnalysisOutput = z.infer<typeof TrajectoryAnalysisOutput>;

const AggregateTokensShape = {
  in: z.number().int().nonnegative(),
  out: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
};

const AggregateTokens = z
  .object(AggregateTokensShape)
  .refine((value) => value.total === value.in + value.out, {
    message: "total tokens must equal input plus output tokens",
    path: ["total"],
  });

export const MetaJson = z
  .object({
    run_id: z.string().min(1),
    schema_version: z.literal(SCHEMA_VERSION),
    topology: z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      leader_id: z.string().min(1),
      node_count: z.number().int().positive(),
      culture: z.unknown().nullable(),
    }),
    seed: z.number().int().nonnegative(),
    brief: z.object({
      path: z.string().min(1),
      content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    models: z.object({
      node: z.string().min(1),
      judge: z.string().min(1),
      analyst: z.string().min(1),
    }),
    totals: z.object({
      tokens: AggregateTokens,
      cost_usd: z.number().nonnegative(),
      wall_clock_ms: z.number().int().nonnegative(),
    }),
    tokens_by_node: z.record(
      z.string().min(1),
      z.object({
        ...AggregateTokensShape,
        cost_usd: z.number().nonnegative(),
      }),
    ),
    messages: z
      .object({
        total: z.number().int().nonnegative(),
        by_tag: z.object({
          decompose: z.number().int().nonnegative(),
          ask: z.number().int().nonnegative(),
          answer: z.number().int().nonnegative(),
          deliver: z.number().int().nonnegative(),
          status: z.number().int().nonnegative(),
          review: z.number().int().nonnegative(),
          untagged: z.number().int().nonnegative(),
        }),
      })
      .refine(
        (value) =>
          value.total ===
          Object.values(value.by_tag).reduce((sum, count) => sum + count, 0),
        {
          message: "message total must equal the sum of tag buckets",
          path: ["total"],
        },
      ),
    patches: z.object({
      proposed: z.number().int().nonnegative(),
      accepted: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
      superseded: z.number().int().nonnegative(),
    }),
    artifact: z.object({
      deploy_success: z.boolean(),
      build_success: z.boolean(),
      published_path: z.string().min(1),
    }),
    milestones: z.object({
      time_to_first_build_ms: z.number().int().nonnegative().nullable(),
    }),
    flags: z.object({
      cap_exceeded: z.boolean(),
      truncated_blobs: z.boolean(),
      routing_rejections: z.number().int().nonnegative(),
      pr_activity_unsummarized: z.number().int().nonnegative(),
      node_failures: z.number().int().nonnegative(),
    }),
  })
  .superRefine((value, ctx) => {
    const totalNodeTokens = Object.values(value.tokens_by_node).reduce(
      (sum, node) => sum + node.total,
      0,
    );

    if (totalNodeTokens > value.totals.tokens.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tokens_by_node total cannot exceed overall token total",
        path: ["tokens_by_node"],
      });
    }
  });

export type MetaJson = z.infer<typeof MetaJson>;

const OrchestratorEventBase = {
  run_id: z.string().min(1),
  round: z.number().int().positive(),
  schema_version: z.literal(SCHEMA_VERSION),
  ts: z.string().min(1),
};

export const OrchestratorEvent = z.discriminatedUnion("type", [
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("routing_rejection"),
    node_id: z.string().min(1),
    attempted_message: z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      tag: MessageTag.optional(),
    }),
    reason: z.string().min(1),
  }),
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("merge"),
    integrator: z.string().min(1),
    branch: z.string().min(1),
    sha: z.string().min(1),
    disposition: z.enum(["accepted", "rejected", "superseded"]),
    rationale: z.string().min(1),
  }),
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("failure"),
    node_id: z.string().min(1),
    failure_kind: z.enum(["timeout", "crash", "malformed_envelope"]),
    detail: z.string().min(1),
    raw_output: z.string().optional(),
    diagnostics: z.string().optional(),
  }),
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("submission"),
    node_id: z.string().min(1),
    detail: z.string().min(1),
  }),
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("cap_exceeded"),
    cap: z.enum(["tokens", "wall_clock_ms"]),
    limit: z.number().nonnegative(),
    actual: z.number().nonnegative(),
  }),
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("pr_activity_unsummarized"),
    node_id: z.string().min(1),
    detail: z.string().min(1),
  }),
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("stage_failed"),
    stage: z.enum([
      "judge",
      "analyst",
      "aggregate",
      "close_browser_sessions",
      "close_prs",
    ]),
    detail: z.string().min(1),
    raw_output: z.string().optional(),
    diagnostics: z.string().optional(),
  }),
  z.object({
    ...OrchestratorEventBase,
    type: z.literal("worktree_drift"),
    node_id: z.string().min(1),
    expected_branch_prefix: z.string().min(1),
    actual_head: z.string().min(1),
  }),
]);

export type OrchestratorEvent = z.infer<typeof OrchestratorEvent>;

type JsonSchemaDocument = {
  $schema: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

function toFrozenJsonSchema(
  name: string,
  schema: z.ZodTypeAny,
): JsonSchemaDocument {
  const jsonSchema = zodToJsonSchema(schema, {
    name,
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as {
    definitions?: Record<string, Omit<JsonSchemaDocument, "$schema">>;
  };

  const definition = jsonSchema.definitions?.[name];

  if (!definition) {
    throw new Error(`Missing JSON Schema definition for ${name}`);
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...definition,
  };
}

export const TrajectoryJsonSchemas = {
  "message-envelope": toFrozenJsonSchema("MessageEnvelope", MessageEnvelope),
  "orchestrator-event": toFrozenJsonSchema(
    "OrchestratorEvent",
    OrchestratorEvent,
  ),
  "node-turn-record": toFrozenJsonSchema("NodeTurnRecord", NodeTurnRecord),
  "patch-decision": toFrozenJsonSchema("PatchDecision", PatchDecision),
  "pr-snapshot": toFrozenJsonSchema("PRSnapshot", PRSnapshot),
  "artifact-judge-output": toFrozenJsonSchema(
    "ArtifactJudgeOutput",
    ArtifactJudgeOutput,
  ),
  "trajectory-analysis-output": toFrozenJsonSchema(
    "TrajectoryAnalysisOutput",
    TrajectoryAnalysisOutput,
  ),
  meta: toFrozenJsonSchema("MetaJson", MetaJson),
} satisfies Record<string, JsonSchemaDocument>;

export type TrajectoryJsonSchemaName = keyof typeof TrajectoryJsonSchemas;
