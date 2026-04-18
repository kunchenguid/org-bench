import path from "node:path";
import { createHash } from "node:crypto";
import {
  appendFile,
  cp,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

function shouldSkipEvaluator(): boolean {
  return (
    process.env.ORG_BENCH_SKIP_EVALUATOR === "1" ||
    existsSync("/tmp/org-bench-skip-evaluator")
  );
}

import {
  ArtifactJudgeOutput,
  EvaluatorStepRecord,
  MessageEnvelope,
  MetaJson,
  NodeTurnRecord,
  OrchestratorEvent,
  PatchDecision,
  PRSnapshot,
  SCHEMA_VERSION,
  TrajectoryAnalysisOutput,
} from "@org-bench/schemas";
import {
  EVALUATOR_SCENARIOS_VERSION,
  evaluateArtifact,
  type EvaluateArtifactResult,
} from "@org-bench/evaluator";
import {
  runTrajectoryAnalyst,
  trajectoryAnalystPromptV1,
} from "@org-bench/analyst";
import { artifactJudgePromptV1, runArtifactJudge } from "@org-bench/judge";

import {
  createOpenCodeSession,
  deleteOpenCodeSession,
  sendOpenCodePromptStreamed,
  shutdownOpenCodeServe,
  startOpenCodeServe,
  type JsonSchemaFormat,
} from "./opencode-serve.js";

const execFileAsync = promisify(execFile);
const DEFAULT_ANALYST_MODEL = "openai/gpt-5.4";

export type ModelThinkingMode = "standard" | "extended";

export type ModelOutputMode = "text" | "json";

export type ModelProfile = {
  model: string;
  tools: boolean;
  thinking: ModelThinkingMode;
  outputMode: ModelOutputMode;
  maxTurns: number;
};

export type BenchmarkModels = {
  node: ModelProfile;
  judge: ModelProfile;
  analyst: ModelProfile;
  player: ModelProfile;
};

export const DEFAULT_AGENT_NAME_POOL = [
  "Ava",
  "Ben",
  "Chloe",
  "Dean",
  "Ella",
  "Finn",
  "Gabe",
  "Hana",
  "Iris",
  "Jace",
  "Kira",
  "Leah",
  "Milo",
  "Nina",
  "Owen",
  "Piper",
  "Quinn",
  "Rosa",
  "Sage",
  "Tara",
  "Uma",
  "Vera",
  "Wade",
  "Xena",
  "Yara",
  "Zane",
  "Arlo",
  "Bryn",
  "Cleo",
  "Drew",
] as const;


export type AppleTasteCulture = {
  kind: "apple-taste";
  leaderPrompt: string;
  workerPrompt: string;
};

export type AmazonWritingCulture = {
  kind: "amazon-writing";
  leaderPrompt: string;
  subleadPrompt: string;
  workerPrompt: string;
};

export type MicrosoftCompetitionCulture = {
  kind: "microsoft-competition";
  charters: Record<string, string>;
  contested: string[];
  leaderPrompt: string;
  divisionHeadPrompt: string;
  divisionWorkerPrompt: string;
};

export type GoogleDesignDocsCulture = {
  kind: "google-design-docs";
  leaderPrompt: string;
  middlePrompt: string;
  workerPrompt: string;
};

export type FacebookVelocityCulture = {
  kind: "facebook-velocity";
  leaderPrompt: string;
  workerPrompt: string;
};

export type OracleProcessCulture = {
  kind: "oracle-process";
  reviewNodeId: string;
  leaderPrompt: string;
  reviewPrompt: string;
  legalStaffPrompt: string;
  engineeringPrompt: string;
};

export type SoloBuilderCulture = {
  kind: "solo-builder";
  prompt: string;
};

export type Culture =
  | AppleTasteCulture
  | AmazonWritingCulture
  | MicrosoftCompetitionCulture
  | GoogleDesignDocsCulture
  | FacebookVelocityCulture
  | OracleProcessCulture
  | SoloBuilderCulture;

export type TopologyEdge = {
  from: string;
  to: string;
  bidir?: boolean;
};

export type TopologyConfig = {
  slug: string;
  name: string;
  nodes: string[];
  edges: TopologyEdge[];
  leader: string;
  developers: string[];
  integrators: string[];
  culture?: Culture | null;
};

export type RunTopology = TopologyConfig;

export type RunBudget = {
  tokens: number;
  wallClockMs: number;
};

export type RunConfig = {
  topology: TopologyConfig;
  seed: number;
  maxRounds: number;
  perRoundTimeoutMs: number;
  brief: string;
  models: BenchmarkModels;
  runBudget: RunBudget;
};

export type BuildNodeCommonContextInput = {
  runId: string;
  topology: TopologyConfig;
  nodeId: string;
};

export function agentName(
  runId: string,
  nodeId: string,
  pool: readonly string[] = DEFAULT_AGENT_NAME_POOL,
): string {
  if (runId.trim().length === 0) {
    throw new Error("runId must be a non-empty string");
  }

  if (nodeId.trim().length === 0) {
    throw new Error("nodeId must be a non-empty string");
  }

  if (pool.length === 0) {
    throw new Error("pool must contain at least one agent name");
  }

  const hash = createHash("sha256").update(`${runId}-${nodeId}`).digest("hex");
  const index = Number(BigInt(`0x${hash}`) % BigInt(pool.length));

  return pool[index] ?? pool[0]!;
}

// Pool-mod hashing collides once a topology has 9+ nodes, so setup can't use
// raw agentName() for worktree/branch allocation. Probe forward from the hash
// index until we find an unused slot; iteration order is the caller's nodeIds.
export function assignAgentNames(
  runId: string,
  nodeIds: readonly string[],
  pool: readonly string[] = DEFAULT_AGENT_NAME_POOL,
): Map<string, string> {
  if (runId.trim().length === 0) {
    throw new Error("runId must be a non-empty string");
  }

  if (pool.length === 0) {
    throw new Error("pool must contain at least one agent name");
  }

  if (nodeIds.length > pool.length) {
    throw new Error(
      `topology has more nodes than the agent name pool (${nodeIds.length} > ${pool.length})`,
    );
  }

  const seen = new Set<string>();
  const assigned = new Map<string, string>();

  for (const nodeId of nodeIds) {
    if (nodeId.trim().length === 0) {
      throw new Error("nodeId must be a non-empty string");
    }
    if (assigned.has(nodeId)) {
      throw new Error(`duplicate nodeId: ${nodeId}`);
    }

    const hash = createHash("sha256")
      .update(`${runId}-${nodeId}`)
      .digest("hex");
    const start = Number(BigInt(`0x${hash}`) % BigInt(pool.length));

    let picked: string | undefined;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidate = pool[(start + offset) % pool.length]!;
      if (!seen.has(candidate)) {
        picked = candidate;
        break;
      }
    }

    if (picked === undefined) {
      throw new Error(
        `could not assign agent name for ${nodeId}: pool exhausted`,
      );
    }

    seen.add(picked);
    assigned.set(nodeId, picked);
  }

  return assigned;
}

export function buildNodeCommonContext({
  runId,
  topology,
  nodeId,
}: BuildNodeCommonContextInput): string {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedTopology = validateTopology(topology);
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");

  if (!validatedTopology.nodes.includes(validatedNodeId)) {
    throw new Error(`Unknown nodeId for topology: ${validatedNodeId}`);
  }

  const names = assignAgentNames(validatedRunId, validatedTopology.nodes);
  const identity = names.get(validatedNodeId)!;
  const role = describeNodeRole(validatedTopology, validatedNodeId);
  const neighbors = listNeighbors(validatedTopology, validatedNodeId);
  const adjacency = listExpandedAdjacency(validatedTopology);
  const integrators = resolveMainBranchIntegrators(validatedTopology);
  const integratorSet = new Set(integrators);
  const isDeveloper = validatedTopology.developers.includes(validatedNodeId);
  const isIntegrator = integratorSet.has(validatedNodeId);
  const integratorNeighbors = neighbors.filter((n) => integratorSet.has(n));

  const roleFlags: string[] = [];
  if (isDeveloper) roleFlags.push("developer");
  if (isIntegrator) roleFlags.push("integrator");
  const rolesLine =
    roleFlags.length === 0 ? "Roles: observer" : `Roles: ${roleFlags.join(", ")}`;

  const rosterLines = validatedTopology.nodes.map((peerId) => {
    const peerPersona = names.get(peerId)!;
    const peerRole = describeNodeRole(validatedTopology, peerId);
    return `- ${peerId} (${peerPersona}): ${peerRole} - ${describeRoleExpectation(peerRole)}`;
  });

  const isSolo = integrators.length === 0;
  const workflowBlock = isSolo
    ? [
        `PR workflow: solo run, no peer review possible.`,
        `Push directly to run/${validatedRunId}/main when work is ready.`,
      ].join("\n")
    : [
        `PR workflow (compliance - follow strictly):`,
        `- Every code change lands via PR. Never push directly to run/${validatedRunId}/main.`,
        `- You cannot merge your own PR. A different integrator must review and merge.`,
        `- If you are an integrator and a peer requests review: read the diff, then either (a) merge it, leaving a comment explaining what you verified, or (b) comment with specific issues and ask the author to fix and re-request. Do not approve-and-walk-away - the reviewer owns the merge.`,
        `- Non-developer integrators do not raise code PRs; you only review and merge.`,
        `- Every PR must include labels: benchmark-run, run:${validatedRunId}.`,
      ].join("\n");

  return [
    `Agent name: ${identity}`,
    `Node ID: ${validatedNodeId}`,
    `Role: ${role}`,
    rolesLine,
    `Leader ID: ${validatedTopology.leader}`,
    `Neighbors: ${neighbors.length === 0 ? "none" : neighbors.join(", ")}`,
    `Adjacency: ${adjacency.join(", ")}`,
    `Roster:\n${rosterLines.join("\n")}`,
    `Integrators for run/${validatedRunId}/main: ${integrators.length === 0 ? "none (solo)" : integrators.join(", ")}`,
    `Integrator neighbors: ${integratorNeighbors.length === 0 ? "none" : integratorNeighbors.join(", ")}`,
    workflowBlock,
    `PR description signature: Author: ${identity} (${role}, node ${validatedNodeId})`,
    `PR comment prefix: **${identity} (${role}):**`,
    `Culture: ${resolveCulturePrompt(validatedTopology, validatedNodeId)}`,
  ].join("\n");
}

function describeRoleExpectation(role: string): string {
  switch (role) {
    case "leader":
      return "sets direction, decomposes the brief, integrates PRs";
    case "sub-lead":
      return "writes PR/FAQ-style docs, reviews peer work before merge";
    case "middle-integrator":
      return "reviews design docs and integrates peer PRs into main";
    case "division-head":
      return "owns a division charter, advocates for it on contested surfaces";
    case "division-worker":
      return "builds within your division's charter, pushes back on the other division";
    case "review":
      return "approves or blocks PRs against the brief; does not open code PRs";
    case "legal-staff":
      return "reviews PRs and cites brief rules; does not open code PRs";
    case "engineering":
      return "builds with compliance rationale up front; expects review rework cycles";
    case "worker":
    default:
      return "executes delegated slices, opens PRs for integration";
  }
}

export type WorkspaceInitOptions = {
  repoRoot: string;
  runId: string;
  runScratchRoot?: string;
  remoteName?: string;
  branchProtection?: {
    repo: string;
    topology: TopologyConfig;
    runner?: CommandRunner;
  };
};

export type InitializeNodeWorktreesInput = {
  repoRoot: string;
  runId: string;
  nodeIds: string[];
  runScratchRoot?: string;
  remoteName?: string;
};

// Runs happen under an OS temp dir by default so a misbehaving agent cannot
// walk up from its worktree into the host repo and commit there. Override only
// when the caller needs deterministic isolation (tests).
export function defaultRunScratchRoot(): string {
  return path.join(tmpdir(), "org-bench-runs");
}

function resolveRunScratchRoot(
  repoRoot: string,
  runScratchRoot: string | undefined,
): string {
  const scratchRoot = path.resolve(runScratchRoot ?? defaultRunScratchRoot());
  const absRepoRoot = path.resolve(repoRoot);
  const relative = path.relative(absRepoRoot, scratchRoot);
  const insideRepo =
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (insideRepo) {
    throw new Error(
      `runScratchRoot (${scratchRoot}) must not be inside repoRoot (${absRepoRoot}); ephemeral run data should live outside the host repo`,
    );
  }

  return scratchRoot;
}

export type RunMainBranchProtectionPayload = {
  required_status_checks: null;
  enforce_admins: false;
  required_pull_request_reviews: {
    dismiss_stale_reviews: false;
    require_code_owner_reviews: false;
    required_approving_review_count: 0 | 1;
    require_last_push_approval: false;
  } | null;
  restrictions: null;
  required_linear_history: true;
  allow_force_pushes: false;
  allow_deletions: false;
  block_creations: false;
  required_conversation_resolution: boolean;
  lock_branch: false;
  allow_fork_syncing: true;
};

export type BuildRunMainBranchProtectionPayloadInput = {
  topology: TopologyConfig;
};

export type ProtectRunMainBranchInput = {
  repo: string;
  branch: string;
  topology: TopologyConfig;
  runner?: CommandRunner;
};

export type InitializeNodeInboxesInput = {
  runDir: string;
  nodeIds: string[];
};

export type AppendInboxMessageInput = {
  runDir: string;
  message: unknown;
};

export type RouteInboxMessageInput = {
  runDir: string;
  topology: TopologyConfig;
  message: unknown;
};

export type DeliverStagedInboxMessagesInput = {
  runDir: string;
  round: number;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CommandRunner = (input: {
  command: string;
  args: string[];
  cwd?: string;
  signal?: AbortSignal;
}) => Promise<CommandResult>;

export type InitializedWorkspace = {
  runDir: string;
  mainWorktreeDir: string;
  mainBranch: string;
  remoteName: string;
};

export type InitializedNodeWorktree = {
  nodeId: string;
  agentName: string;
  runDir: string;
  mainWorktreeDir: string;
  worktreeDir: string;
  branch: string;
  remoteName: string;
};

export type NodeMessageTag =
  | "decompose"
  | "ask"
  | "answer"
  | "deliver"
  | "status"
  | "review";

export type NodeOutboundMessage = {
  to: string;
  tag?: NodeMessageTag;
  content: string;
};

export type SoloNodeRoundOutput = {
  messages: NodeOutboundMessage[];
  summary?: string;
};

export type NodeToolCall = {
  tool: string;
  input: string;
  status: "success" | "error";
  duration_ms?: number;
};

type OpenCodeStructuredPromptSender = <TStructured>(input: {
  baseUrl: string;
  sessionId: string;
  prompt: string;
  schema: {
    type: "object";
    additionalProperties?: boolean;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  signal?: AbortSignal;
}) => Promise<{
  response: unknown;
  finalText: string | null;
  structured: TStructured | null;
  toolCalls?: NodeToolCall[];
  tokens: { in: number; out: number };
}>;

export type RunSoloNodeRoundInput = {
  runId: string;
  round: number;
  workspace: InitializedWorkspace;
  runConfig: RunConfig;
  abortSignal?: AbortSignal;
  runner?: CommandRunner;
  openCodeClient?: {
    baseUrl: string;
    sessionId?: string;
    createSession?: typeof createOpenCodeSession;
    sendPrompt?: OpenCodeStructuredPromptSender;
    deleteSession?: typeof deleteOpenCodeSession;
  };
};

export type RunBudgetTotals = {
  tokens: number;
  wallClockMs: number;
};

export type RunNodeRoundWithTimeoutInput<T> = {
  runId: string;
  runDir: string;
  round: number;
  nodeId: string;
  perRoundTimeoutMs: number;
  execute: (signal: AbortSignal) => Promise<T>;
};

export type RunRoundParallelInput<T> = {
  runId: string;
  runDir: string;
  round: number;
  nodeIds: string[];
  perRoundTimeoutMs: number;
  executeNodeRound: (nodeId: string) => Promise<T>;
};

export type RunNodeRoundWithTimeoutResult<T> =
  | {
      completed: true;
      reason: null;
      output: T;
    }
  | {
      completed: false;
      reason: "timeout";
      output: null;
    };

export type RunRoundParallelResult<T> = Array<
  {
    nodeId: string;
  } & RunNodeRoundWithTimeoutResult<T>
>;

export type DetectLeaderSubmissionInput = {
  runId: string;
  runDir: string;
  round: number;
  leaderNodeId: string;
  nodeId: string;
  messages: NodeOutboundMessage[];
};

export type DetectUnsummarizedPrActivityInput = {
  runId: string;
  runDir: string;
  round: number;
  nodeId: string;
  toolCalls: NodeToolCall[];
  messages: NodeOutboundMessage[];
};

export type VerifyRunMainMergeAuthorityInput = {
  topology: TopologyConfig;
  nodeTurns: Array<{
    nodeId: string;
    toolCalls: NodeToolCall[];
  }>;
};

export type RunMainMergeAuthorityViolation = {
  nodeId: string;
  toolCall: string;
  reason: string;
};

export type SoloNodeRoundResult = {
  sessionFile: string;
  model: string;
  output: SoloNodeRoundOutput;
  toolCalls: NodeToolCall[];
  tokens: {
    in: number;
    out: number;
  };
};

export type EnforceRunBudgetCapsInput = {
  runId: string;
  runDir: string;
  round: number;
  runBudget: RunBudget;
  totals: RunBudgetTotals;
};

export type CheckRunBudgetBetweenRoundsInput = {
  runId: string;
  runDir: string;
  round: number;
  runBudget: RunBudget;
  previousTotals: RunBudgetTotals;
  roundUsage: RunBudgetTotals;
};

export type CheckRunBudgetBetweenRoundsResult = {
  exceeded: boolean;
  totals: RunBudgetTotals;
};

export type SnapshotRunPullRequestsInput = {
  runId: string;
  runDir: string;
  runner?: CommandRunner;
};

export type CloseOpenRunPullRequestsInput = {
  runId: string;
  runner?: CommandRunner;
};

export type StripBenchmarkRunLabelsForTopologyInput = {
  topologySlug: string;
  runner?: CommandRunner;
};

export type PublishRunArtifactInput = {
  repoRoot: string;
  runId: string;
  topology: string;
  workspace: InitializedWorkspace;
  runner?: CommandRunner;
};

export type EvaluatePublishedArtifactInput = {
  artifactDir: string;
  runId: string;
  evaluate?: (input: {
    artifactDir: string;
    runId: string;
  }) => Promise<EvaluateArtifactResult>;
};

export type JudgePublishedArtifactInput = {
  artifactDir: string;
  runId: string;
  model: string;
  openCodeClient?: {
    baseUrl: string;
    sessionId?: string;
    createSession?: typeof createOpenCodeSession;
    sendPrompt?: OpenCodeStructuredPromptSender;
    deleteSession?: typeof deleteOpenCodeSession;
  };
  judge?: (input: {
    artifactDir: string;
    runId: string;
    model: string;
    openCodeClient?: {
      baseUrl: string;
      sessionId?: string;
      createSession?: typeof createOpenCodeSession;
      sendPrompt?: OpenCodeStructuredPromptSender;
      deleteSession?: typeof deleteOpenCodeSession;
    };
  }) => Promise<ArtifactJudgeOutput>;
};

export type RunTrajectoryAnalysisInput = {
  artifactDir: string;
  runId: string;
  model: string;
  openCodeClient?: {
    baseUrl: string;
    sessionId?: string;
    createSession?: typeof createOpenCodeSession;
    sendPrompt?: OpenCodeStructuredPromptSender;
    deleteSession?: typeof deleteOpenCodeSession;
  };
  startOpenCodeServe?: typeof startOpenCodeServe;
  shutdownOpenCodeServe?: typeof shutdownOpenCodeServe;
  analyze?: (input: {
    artifactDir: string;
    runId: string;
    model: string;
    openCodeClient?: {
      baseUrl: string;
      sessionId?: string;
      createSession?: typeof createOpenCodeSession;
      sendPrompt?: OpenCodeStructuredPromptSender;
      deleteSession?: typeof deleteOpenCodeSession;
    };
  }) => Promise<TrajectoryAnalysisOutput>;
};

export type AggregateRunMetaInput = {
  artifactDir: string;
  repoRoot?: string;
  seed?: number;
};

export type CleanupRunBranchesInput = {
  repoRoot: string;
  runId: string;
  runScratchRoot?: string;
  remoteName?: string;
};

export type PersistRunArtifactsInput = {
  workspace: InitializedWorkspace;
  runId: string;
};

export type TeardownRunWorkspaceInput = {
  repoRoot: string;
  runId: string;
  runScratchRoot?: string;
};

export type RunSoloBenchmarkInput = {
  repoRoot: string;
  runId: string;
  runConfig: RunConfig;
  runScratchRoot?: string;
  remoteName?: string;
  openCodeClient?: {
    baseUrl?: string;
    createSession?: typeof createOpenCodeSession;
    deleteSession?: typeof deleteOpenCodeSession;
    sendPrompt?: OpenCodeStructuredPromptSender;
  };
  startOpenCodeServe?: typeof startOpenCodeServe;
  shutdownOpenCodeServe?: typeof shutdownOpenCodeServe;
  branchProtection?: {
    repo: string;
    runner?: CommandRunner;
  };
  initWorkspace?: (
    options: WorkspaceInitOptions,
  ) => Promise<InitializedWorkspace>;
  initializeInboxes?: (
    input: InitializeNodeInboxesInput,
  ) => Promise<Record<string, string>>;
  runRound?: (input: RunSoloNodeRoundInput) => Promise<SoloNodeRoundResult>;
  snapshotPullRequests?: (
    input: SnapshotRunPullRequestsInput,
  ) => Promise<PRSnapshot[]>;
  publishArtifact?: (input: PublishRunArtifactInput) => Promise<string>;
  evaluateArtifact?: (
    input: EvaluatePublishedArtifactInput,
  ) => Promise<EvaluateArtifactResult>;
  judgeArtifact?: (
    input: JudgePublishedArtifactInput,
  ) => Promise<ArtifactJudgeOutput>;
  analyzeTrajectory?: (
    input: RunTrajectoryAnalysisInput,
  ) => Promise<TrajectoryAnalysisOutput>;
  aggregateMeta?: (input: AggregateRunMetaInput) => Promise<MetaJson>;
  closeOpenPullRequests?: (
    input: CloseOpenRunPullRequestsInput,
  ) => Promise<number[]>;
  stripPriorTopologyLabels?: (
    input: StripBenchmarkRunLabelsForTopologyInput,
  ) => Promise<number[]>;
  cleanupBranches?: (input: CleanupRunBranchesInput) => Promise<string[]>;
  persistArtifacts?: (input: PersistRunArtifactsInput) => Promise<boolean>;
  teardownWorkspace?: (input: TeardownRunWorkspaceInput) => Promise<void>;
};

export type RunSoloBenchmarkResult = {
  runId: string;
  workspace: InitializedWorkspace;
  roundsExecuted: number;
  submitted: boolean;
  artifactDir: string;
  meta: MetaJson;
  cleanedBranches: string[];
};

export type RunBenchmarkNodeRoundInput = {
  runId: string;
  round: number;
  nodeId: string;
  workspace: InitializedNodeWorktree;
  runConfig: RunConfig;
  inboxMessages: Array<typeof MessageEnvelope._type>;
  abortSignal?: AbortSignal;
  runner?: CommandRunner;
  openCodeClient?: {
    baseUrl: string;
    sessionId?: string;
    createSession?: typeof createOpenCodeSession;
    sendPrompt?: OpenCodeStructuredPromptSender;
    deleteSession?: typeof deleteOpenCodeSession;
  };
};

export type RunBenchmarkInput = Omit<
  RunSoloBenchmarkInput,
  "runRound"
> & {
  initializeWorktrees?: (
    input: InitializeNodeWorktreesInput,
  ) => Promise<InitializedNodeWorktree[]>;
  runRound?: (
    input: RunBenchmarkNodeRoundInput,
  ) => Promise<SoloNodeRoundResult>;
  routeMessage?: (input: RouteInboxMessageInput) => Promise<boolean>;
  deliverMessages?: (
    input: DeliverStagedInboxMessagesInput,
  ) => Promise<number>;
};

export type RunBenchmarkResult = RunSoloBenchmarkResult;

type RoutingRejectionEvent = Extract<
  OrchestratorEvent,
  {
    type: "routing_rejection";
  }
>;

type OrchestratorEventInput = {
  [EventType in OrchestratorEvent["type"]]: Omit<
    Extract<OrchestratorEvent, { type: EventType }>,
    "schema_version" | "ts"
  >;
}[OrchestratorEvent["type"]];

type AgentIdentity = PRSnapshot["author"];

type GhPrListEntry = {
  number: number;
};

type GhPrView = {
  number: number;
  url: string;
  author: {
    login?: string;
  } | null;
  title: string;
  body: string;
  reviewRequests: Array<{
    requestedReviewer: {
      login?: string;
    } | null;
  }>;
  reviews: Array<{
    author: {
      login?: string;
    } | null;
    body: string;
    state?: string;
    submittedAt?: string;
  }>;
  mergedAt?: string;
  closedAt?: string;
  createdAt: string;
  comments: Array<{
    author: {
      login?: string;
    } | null;
    body: string;
    createdAt: string;
  }>;
};

export function defineRunConfig(config: RunConfig): RunConfig {
  return validateRunConfig(config);
}

export async function loadRunConfig(modulePath: string): Promise<RunConfig> {
  const resolvedModulePath = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(modulePath);
  const runModule = (await import(pathToFileURL(resolvedModulePath).href)) as {
    run?: unknown;
  };

  if (runModule.run === undefined) {
    throw new Error("Run config module must export `run`");
  }

  return validateRunConfig(runModule.run);
}

export async function runSoloBenchmark({
  repoRoot,
  runId,
  runConfig,
  runScratchRoot,
  remoteName,
  openCodeClient,
  startOpenCodeServe: launchOpenCodeServe = startOpenCodeServe,
  shutdownOpenCodeServe: stopOpenCodeServe = shutdownOpenCodeServe,
  branchProtection,
  initWorkspace: initializeWorkspace = initWorkspace,
  initializeInboxes = initializeNodeInboxes,
  runRound = runSoloNodeRound,
  snapshotPullRequests = snapshotRunPullRequests,
  publishArtifact = publishRunArtifact,
  evaluateArtifact = evaluatePublishedArtifact,
  judgeArtifact = judgePublishedArtifact,
  analyzeTrajectory = runTrajectoryAnalysis,
  aggregateMeta = aggregateRunMeta,
  closeOpenPullRequests = closeOpenRunPullRequests,
  stripPriorTopologyLabels = stripBenchmarkRunLabelsForTopology,
  cleanupBranches = cleanupRunBranches,
  persistArtifacts = persistRunArtifactsToRootBranch,
  teardownWorkspace = teardownRunWorkspace,
}: RunSoloBenchmarkInput): Promise<RunSoloBenchmarkResult> {
  const validatedRepoRoot = path.resolve(
    validateNonEmptyString(repoRoot, "repoRoot"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunConfig = validateRunConfig(runConfig);

  if (validatedRunConfig.topology.nodes.length !== 1) {
    throw new Error("runSoloBenchmark requires a solo topology");
  }

  const executableRunConfig = {
    ...validatedRunConfig,
    brief: await resolveRunBriefContent(
      validatedRunConfig.brief,
      validatedRepoRoot,
    ),
  };
  await runPreflightClosePullRequests(validatedRunId, closeOpenPullRequests);
  await runPreflightStripPriorTopologyLabels(
    executableRunConfig.topology.slug,
    stripPriorTopologyLabels,
  );

  const workspace = await initializeWorkspace({
    repoRoot: validatedRepoRoot,
    runId: validatedRunId,
    runScratchRoot,
    remoteName,
    branchProtection:
      branchProtection === undefined
        ? undefined
        : {
            repo: branchProtection.repo,
            topology: executableRunConfig.topology,
            runner: branchProtection.runner,
          },
  });

  await initializeInboxes({
    runDir: workspace.runDir,
    nodeIds: executableRunConfig.topology.nodes,
  });

  const xdgDataHome = path.join(workspace.runDir, ".xdg");
  await mkdir(xdgDataHome, { recursive: true });

  const createSession = openCodeClient?.createSession ?? createOpenCodeSession;
  const removeSession = openCodeClient?.deleteSession ?? deleteOpenCodeSession;
  const ownedServer = openCodeClient?.baseUrl
    ? null
    : await launchOpenCodeServe({
        cwd: workspace.mainWorktreeDir,
        pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
        env: { ...process.env, XDG_DATA_HOME: xdgDataHome },
      });
  const resolvedOpenCodeClient =
    (openCodeClient ?? ownedServer)
      ? {
          baseUrl: openCodeClient?.baseUrl ?? ownedServer?.baseUrl ?? "",
          createSession,
          deleteSession: removeSession,
          sendPrompt: openCodeClient?.sendPrompt ?? sendOpenCodePromptStreamed,
        }
      : undefined;
  const sharedSession = resolvedOpenCodeClient
    ? await createSession({
        baseUrl: resolvedOpenCodeClient.baseUrl,
        directory: workspace.mainWorktreeDir,
      })
    : null;
  const roundOpenCodeClient =
    resolvedOpenCodeClient && sharedSession
      ? {
          ...resolvedOpenCodeClient,
          sessionId: sharedSession.id,
        }
      : undefined;

  try {
    let roundsExecuted = 0;
    let submitted = false;
    let budgetTotals: RunBudgetTotals = {
      tokens: 0,
      wallClockMs: 0,
    };

    for (let round = 1; round <= executableRunConfig.maxRounds; round += 1) {
      const roundStartedAtMs = Date.now();
      const roundResult = await runNodeRoundWithTimeout({
        runId: validatedRunId,
        runDir: workspace.runDir,
        round,
        nodeId: executableRunConfig.topology.leader,
        perRoundTimeoutMs: executableRunConfig.perRoundTimeoutMs,
        execute: (abortSignal) =>
          runRound({
            runId: validatedRunId,
            round,
            workspace,
            runConfig: executableRunConfig,
            abortSignal,
            openCodeClient: roundOpenCodeClient,
          }),
      });

      roundsExecuted = round;
      submitted =
        roundResult.completed &&
        (await detectLeaderSubmission({
          runId: validatedRunId,
          runDir: workspace.runDir,
          round,
          leaderNodeId: executableRunConfig.topology.leader,
          nodeId: executableRunConfig.topology.leader,
          messages: roundResult.output.output.messages,
        }));

      const budgetCheck = await checkRunBudgetBetweenRounds({
        runId: validatedRunId,
        runDir: workspace.runDir,
        round,
        runBudget: executableRunConfig.runBudget,
        previousTotals: budgetTotals,
        roundUsage: {
          tokens: roundResult.completed
            ? roundResult.output.tokens.in + roundResult.output.tokens.out
            : 0,
          wallClockMs: Math.max(0, Date.now() - roundStartedAtMs),
        },
      });
      budgetTotals = budgetCheck.totals;

      if (submitted || budgetCheck.exceeded) {
        break;
      }
    }

    await snapshotPullRequests({
      runId: validatedRunId,
      runDir: workspace.runDir,
    });

    const artifactDir = await publishArtifact({
      repoRoot: validatedRepoRoot,
      runId: validatedRunId,
      topology: executableRunConfig.topology.slug,
      workspace,
    });
    const publishedIndexPath = path.join(artifactDir, "index.html");
    const hasDeployableArtifact = await pathExists(publishedIndexPath);

    if (hasDeployableArtifact) {
      if (!shouldSkipEvaluator()) {
        await runFinalizeStage({
          artifactDir,
          runId: validatedRunId,
          round: Math.max(1, roundsExecuted),
          stage: "evaluator",
          run: () =>
            evaluateArtifact({
              artifactDir,
              runId: validatedRunId,
            }),
        });
      }
      await runFinalizeStage({
        artifactDir,
        runId: validatedRunId,
        round: Math.max(1, roundsExecuted),
        stage: "judge",
        run: () =>
          judgeArtifact({
            artifactDir,
            runId: validatedRunId,
            model: executableRunConfig.models.judge.model,
            openCodeClient: resolvedOpenCodeClient,
          }),
      });
    }

    await runFinalizeStage({
      artifactDir,
      runId: validatedRunId,
      round: Math.max(1, roundsExecuted),
      stage: "analyst",
      run: () =>
        analyzeTrajectory({
          artifactDir,
          runId: validatedRunId,
          model: executableRunConfig.models.analyst.model,
          openCodeClient: resolvedOpenCodeClient,
        }),
    });

    const meta = await aggregateMeta({
      artifactDir,
      repoRoot: validatedRepoRoot,
      seed: executableRunConfig.seed,
    });
    await runFinalizeStage({
      artifactDir,
      runId: validatedRunId,
      round: Math.max(1, roundsExecuted),
      stage: "close_prs",
      run: () => closeOpenPullRequests({ runId: validatedRunId }),
    });
    const cleanedBranches = await cleanupBranches({
      repoRoot: validatedRepoRoot,
      runId: validatedRunId,
      runScratchRoot,
      remoteName: workspace.remoteName,
    });
    await persistArtifacts({
      workspace,
      runId: validatedRunId,
    });
    await teardownWorkspace({
      repoRoot: validatedRepoRoot,
      runId: validatedRunId,
      runScratchRoot,
    });

    return {
      runId: validatedRunId,
      workspace,
      roundsExecuted,
      submitted,
      artifactDir,
      meta,
      cleanedBranches,
    };
  } finally {
    if (resolvedOpenCodeClient && sharedSession) {
      await removeSession({
        baseUrl: resolvedOpenCodeClient.baseUrl,
        sessionId: sharedSession.id,
      }).catch(() => undefined);
    }

    if (ownedServer) {
      await stopOpenCodeServe(ownedServer).catch(() => undefined);
    }
  }
}

export async function runBenchmark(
  input: RunBenchmarkInput,
): Promise<RunBenchmarkResult> {
  const validatedRunConfig = validateRunConfig(input.runConfig);

  if (validatedRunConfig.topology.nodes.length === 1) {
    return runSoloBenchmark({
      repoRoot: input.repoRoot,
      runId: input.runId,
      runConfig: input.runConfig,
      runScratchRoot: input.runScratchRoot,
      remoteName: input.remoteName,
      openCodeClient: input.openCodeClient,
      startOpenCodeServe: input.startOpenCodeServe,
      shutdownOpenCodeServe: input.shutdownOpenCodeServe,
      branchProtection: input.branchProtection,
      initWorkspace: input.initWorkspace,
      initializeInboxes: input.initializeInboxes,
      snapshotPullRequests: input.snapshotPullRequests,
      publishArtifact: input.publishArtifact,
      evaluateArtifact: input.evaluateArtifact,
      judgeArtifact: input.judgeArtifact,
      analyzeTrajectory: input.analyzeTrajectory,
      aggregateMeta: input.aggregateMeta,
      closeOpenPullRequests: input.closeOpenPullRequests,
      cleanupBranches: input.cleanupBranches,
      persistArtifacts: input.persistArtifacts,
      teardownWorkspace: input.teardownWorkspace,
    });
  }

  const validatedRepoRoot = path.resolve(
    validateNonEmptyString(input.repoRoot, "repoRoot"),
  );
  const validatedRunId = validateNonEmptyString(input.runId, "runId");
  const executableRunConfig = {
    ...validatedRunConfig,
    brief: await resolveRunBriefContent(
      validatedRunConfig.brief,
      validatedRepoRoot,
    ),
  };
  const initializeWorkspace = input.initWorkspace ?? initWorkspace;
  const initializeInboxes = input.initializeInboxes ?? initializeNodeInboxes;
  const initializeWorktrees =
    input.initializeWorktrees ?? initializeNodeWorktrees;
  const runRound = input.runRound ?? runTopologyNodeRound;
  const routeMessage = input.routeMessage ?? routeInboxMessage;
  const deliverMessages = input.deliverMessages ?? deliverStagedInboxMessages;
  const snapshotPullRequests =
    input.snapshotPullRequests ?? snapshotRunPullRequests;
  const publishArtifact = input.publishArtifact ?? publishRunArtifact;
  const evaluateArtifact = input.evaluateArtifact ?? evaluatePublishedArtifact;
  const judgeArtifact = input.judgeArtifact ?? judgePublishedArtifact;
  const analyzeTrajectory = input.analyzeTrajectory ?? runTrajectoryAnalysis;
  const aggregateMeta = input.aggregateMeta ?? aggregateRunMeta;
  const closeOpenPullRequests =
    input.closeOpenPullRequests ?? closeOpenRunPullRequests;
  const stripPriorTopologyLabels =
    input.stripPriorTopologyLabels ?? stripBenchmarkRunLabelsForTopology;
  const cleanupBranches = input.cleanupBranches ?? cleanupRunBranches;
  const persistArtifacts =
    input.persistArtifacts ?? persistRunArtifactsToRootBranch;
  const teardownWorkspace = input.teardownWorkspace ?? teardownRunWorkspace;
  const createSession =
    input.openCodeClient?.createSession ?? createOpenCodeSession;
  const removeSession =
    input.openCodeClient?.deleteSession ?? deleteOpenCodeSession;

  await runPreflightClosePullRequests(validatedRunId, closeOpenPullRequests);
  await runPreflightStripPriorTopologyLabels(
    executableRunConfig.topology.slug,
    stripPriorTopologyLabels,
  );

  const workspace = await initializeWorkspace({
    repoRoot: validatedRepoRoot,
    runId: validatedRunId,
    runScratchRoot: input.runScratchRoot,
    remoteName: input.remoteName,
    branchProtection:
      input.branchProtection === undefined
        ? undefined
        : {
            repo: input.branchProtection.repo,
            topology: executableRunConfig.topology,
            runner: input.branchProtection.runner,
          },
  });

  const xdgDataHome = path.join(workspace.runDir, ".xdg");
  await mkdir(xdgDataHome, { recursive: true });

  const ownedServer = input.openCodeClient?.baseUrl
    ? null
    : await (input.startOpenCodeServe ?? startOpenCodeServe)({
        cwd: workspace.mainWorktreeDir,
        pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
        env: { ...process.env, XDG_DATA_HOME: xdgDataHome },
      });

  await initializeInboxes({
    runDir: workspace.runDir,
    nodeIds: executableRunConfig.topology.nodes,
  });

  const nodeWorktrees = await initializeWorktrees({
    repoRoot: validatedRepoRoot,
    runId: validatedRunId,
    nodeIds: executableRunConfig.topology.nodes,
    runScratchRoot: input.runScratchRoot,
    remoteName: workspace.remoteName,
  });
  const nodeWorktreeById = new Map(
    nodeWorktrees.map((worktree) => [worktree.nodeId, worktree]),
  );
  const resolvedOpenCodeClient =
    (input.openCodeClient ?? ownedServer)
      ? {
          baseUrl: input.openCodeClient?.baseUrl ?? ownedServer?.baseUrl ?? "",
          createSession,
          deleteSession: removeSession,
          sendPrompt:
            input.openCodeClient?.sendPrompt ?? sendOpenCodePromptStreamed,
        }
      : undefined;
  const sharedSessions = resolvedOpenCodeClient
    ? await Promise.all(
        nodeWorktrees.map(async (worktree) => ({
          nodeId: worktree.nodeId,
          session: await createSession({
            baseUrl: resolvedOpenCodeClient.baseUrl,
            directory: worktree.worktreeDir,
          }),
        })),
      )
    : [];
  const sessionIdByNodeId = new Map(
    sharedSessions.map(({ nodeId, session }) => [nodeId, session.id]),
  );

  try {
    let roundsExecuted = 0;
    let submitted = false;
    let budgetTotals: RunBudgetTotals = {
      tokens: 0,
      wallClockMs: 0,
    };

    for (let round = 1; round <= executableRunConfig.maxRounds; round += 1) {
      const roundStartedAtMs = Date.now();
      const activeNodeIds = await selectActiveNodesForRound({
        runDir: workspace.runDir,
        round,
        nodes: executableRunConfig.topology.nodes,
        leader: executableRunConfig.topology.leader,
      });
      const roundResults = await runRoundParallel({
        runId: validatedRunId,
        runDir: workspace.runDir,
        round,
        nodeIds: activeNodeIds,
        perRoundTimeoutMs: executableRunConfig.perRoundTimeoutMs,
        executeNodeRound: async (nodeId) => {
          const nodeWorkspace = nodeWorktreeById.get(nodeId);

          if (nodeWorkspace === undefined) {
            throw new Error(`Missing worktree for node ${nodeId}`);
          }

          return runRound({
            runId: validatedRunId,
            round,
            nodeId,
            workspace: nodeWorkspace,
            runConfig: executableRunConfig,
            inboxMessages: await drainNodeInboxMessages({
              runDir: workspace.runDir,
              nodeId,
            }),
            openCodeClient:
              resolvedOpenCodeClient && sessionIdByNodeId.has(nodeId)
                ? {
                    ...resolvedOpenCodeClient,
                    sessionId: sessionIdByNodeId.get(nodeId),
                  }
                : undefined,
          });
        },
      });

      roundsExecuted = round;

      for (const nodeResult of roundResults) {
        if (!nodeResult.completed) {
          continue;
        }

        if (
          nodeResult.nodeId === executableRunConfig.topology.leader &&
          (await detectLeaderSubmission({
            runId: validatedRunId,
            runDir: workspace.runDir,
            round,
            leaderNodeId: executableRunConfig.topology.leader,
            nodeId: nodeResult.nodeId,
            messages: nodeResult.output.output.messages,
          }))
        ) {
          submitted = true;
        }

        for (const message of nodeResult.output.output.messages) {
          await routeMessage({
            runDir: workspace.runDir,
            topology: executableRunConfig.topology,
            message: {
              run_id: validatedRunId,
              round: round + 1,
              from: nodeResult.nodeId,
              to: message.to,
              tag: message.tag,
              content: message.content,
              schema_version: SCHEMA_VERSION,
              ts: new Date().toISOString(),
            },
          });
        }
      }

      await deliverMessages({
        runDir: workspace.runDir,
        round: round + 1,
      });

      const budgetCheck = await checkRunBudgetBetweenRounds({
        runId: validatedRunId,
        runDir: workspace.runDir,
        round,
        runBudget: executableRunConfig.runBudget,
        previousTotals: budgetTotals,
        roundUsage: {
          tokens: roundResults.reduce(
            (sum, result) =>
              sum +
              (result.completed
                ? result.output.tokens.in + result.output.tokens.out
                : 0),
            0,
          ),
          wallClockMs: Math.max(0, Date.now() - roundStartedAtMs),
        },
      });
      budgetTotals = budgetCheck.totals;

      if (submitted || budgetCheck.exceeded) {
        break;
      }
    }

    await snapshotPullRequests({
      runId: validatedRunId,
      runDir: workspace.runDir,
    });

    const artifactDir = await publishArtifact({
      repoRoot: validatedRepoRoot,
      runId: validatedRunId,
      topology: executableRunConfig.topology.slug,
      workspace,
    });
    const publishedIndexPath = path.join(artifactDir, "index.html");
    const hasDeployableArtifact = await pathExists(publishedIndexPath);

    if (hasDeployableArtifact) {
      if (!shouldSkipEvaluator()) {
        await runFinalizeStage({
          artifactDir,
          runId: validatedRunId,
          round: Math.max(1, roundsExecuted),
          stage: "evaluator",
          run: () =>
            evaluateArtifact({
              artifactDir,
              runId: validatedRunId,
            }),
        });
      }
      await runFinalizeStage({
        artifactDir,
        runId: validatedRunId,
        round: Math.max(1, roundsExecuted),
        stage: "judge",
        run: () =>
          judgeArtifact({
            artifactDir,
            runId: validatedRunId,
            model: executableRunConfig.models.judge.model,
            openCodeClient: resolvedOpenCodeClient,
          }),
      });
    }

    await runFinalizeStage({
      artifactDir,
      runId: validatedRunId,
      round: Math.max(1, roundsExecuted),
      stage: "analyst",
      run: () =>
        analyzeTrajectory({
          artifactDir,
          runId: validatedRunId,
          model: executableRunConfig.models.analyst.model,
          openCodeClient: resolvedOpenCodeClient,
        }),
    });

    const meta = await aggregateMeta({
      artifactDir,
      repoRoot: validatedRepoRoot,
      seed: executableRunConfig.seed,
    });
    await runFinalizeStage({
      artifactDir,
      runId: validatedRunId,
      round: Math.max(1, roundsExecuted),
      stage: "close_prs",
      run: () => closeOpenPullRequests({ runId: validatedRunId }),
    });
    const cleanedBranches = await cleanupBranches({
      repoRoot: validatedRepoRoot,
      runId: validatedRunId,
      runScratchRoot: input.runScratchRoot,
      remoteName: workspace.remoteName,
    });
    await persistArtifacts({
      workspace,
      runId: validatedRunId,
    });
    await teardownWorkspace({
      repoRoot: validatedRepoRoot,
      runId: validatedRunId,
      runScratchRoot: input.runScratchRoot,
    });

    return {
      runId: validatedRunId,
      workspace,
      roundsExecuted,
      submitted,
      artifactDir,
      meta,
      cleanedBranches,
    };
  } finally {
    if (resolvedOpenCodeClient) {
      await Promise.all(
        Array.from(sessionIdByNodeId.values()).map((sessionId) =>
          removeSession({
            baseUrl: resolvedOpenCodeClient.baseUrl,
            sessionId,
          }).catch(() => undefined),
        ),
      );
    }

    if (ownedServer) {
      await (input.shutdownOpenCodeServe ?? shutdownOpenCodeServe)(
        ownedServer,
      ).catch(() => undefined);
    }
  }
}

export async function initWorkspace(
  options: WorkspaceInitOptions,
): Promise<InitializedWorkspace> {
  const repoRoot = path.resolve(
    validateNonEmptyString(options.repoRoot, "repoRoot"),
  );
  const runId = validateNonEmptyString(options.runId, "runId");
  const remoteName = options.remoteName ?? "origin";
  const scratchRoot = resolveRunScratchRoot(repoRoot, options.runScratchRoot);
  const runDir = path.join(scratchRoot, runId);
  const gitDir = path.join(runDir, ".git");
  const mainWorktreeDir = path.join(runDir, "main");
  const mainBranch = `run/${runId}/main`;
  const publishedDocsDir = path.join(repoRoot, "docs", runId);

  await mkdir(scratchRoot, { recursive: true });

  // Wipe any stale per-topology artifacts so that if a prior bench crashed
  // between round 1 and publishArtifact, the next invocation starts from a
  // clean slate rather than resurrecting the old run's docs/<id>/ content.
  await rm(publishedDocsDir, { recursive: true, force: true });

  await rm(runDir, { recursive: true, force: true });
  await mkdir(runDir, { recursive: true });

  const remoteUrl = await readRemoteUrl(repoRoot, remoteName);

  // Init a bare repo and fetch the remote ourselves rather than `git clone
  // --bare`: a bare clone dumps every remote head directly into refs/heads/*,
  // which collides with the orphan worktree-add below when the same run id
  // has ever been pushed before. Fetching into refs/remotes/<remote>/* keeps
  // the local ref namespace clean.
  await runGit(["init", "--bare", gitDir], repoRoot);
  await runGit(["remote", "add", remoteName, remoteUrl], gitDir);
  await runGit(
    [
      "config",
      `remote.${remoteName}.fetch`,
      `+refs/heads/*:refs/remotes/${remoteName}/*`,
    ],
    gitDir,
  );
  await runGit(["fetch", remoteName], gitDir);

  await deleteRemoteRunBranches(gitDir, remoteName, runId);

  await mkdir(path.join(runDir, "inbox"), { recursive: true });
  await mkdir(path.join(runDir, "sessions"), { recursive: true });
  await mkdir(path.join(runDir, "trajectory"), { recursive: true });

  await runGit(
    ["worktree", "add", "--orphan", "-b", mainBranch, mainWorktreeDir],
    gitDir,
  );
  await runGit(["commit", "--allow-empty", "-m", "empty"], mainWorktreeDir);
  await runGit(["push", "-u", remoteName, mainBranch], mainWorktreeDir);

  if (options.branchProtection !== undefined) {
    await protectRunMainBranch({
      repo: validateNonEmptyString(
        options.branchProtection.repo,
        "branchProtection.repo",
      ),
      branch: mainBranch,
      topology: validateTopology(options.branchProtection.topology),
      runner: options.branchProtection.runner,
    });
  }

  return {
    runDir,
    mainWorktreeDir,
    mainBranch,
    remoteName,
  };
}

export async function getRunMainWorktree(
  options: WorkspaceInitOptions,
): Promise<InitializedWorkspace> {
  const repoRoot = path.resolve(
    validateNonEmptyString(options.repoRoot, "repoRoot"),
  );
  const runId = validateNonEmptyString(options.runId, "runId");
  const remoteName = options.remoteName ?? "origin";
  const scratchRoot = resolveRunScratchRoot(repoRoot, options.runScratchRoot);
  const runDir = path.join(scratchRoot, runId);
  const mainWorktreeDir = path.join(runDir, "main");
  const mainBranch = `run/${runId}/main`;

  await stat(mainWorktreeDir);

  const headRef = await runCommand({
    command: "git",
    args: ["symbolic-ref", "HEAD"],
    cwd: mainWorktreeDir,
  });
  if (headRef.stdout.trim() !== `refs/heads/${mainBranch}`) {
    throw new Error(
      `Run main worktree at ${mainWorktreeDir} is not on branch ${mainBranch}`,
    );
  }

  return {
    runDir,
    mainWorktreeDir,
    mainBranch,
    remoteName,
  };
}

export async function initializeNodeWorktrees({
  repoRoot,
  runId,
  nodeIds,
  runScratchRoot,
  remoteName = "origin",
}: InitializeNodeWorktreesInput): Promise<InitializedNodeWorktree[]> {
  const validatedRepoRoot = path.resolve(
    validateNonEmptyString(repoRoot, "repoRoot"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedNodeIds = validateStringArray(nodeIds, "nodeIds");
  const validatedRemoteName = validateNonEmptyString(remoteName, "remoteName");
  const workspace = await getRunMainWorktree({
    repoRoot: validatedRepoRoot,
    runId: validatedRunId,
    runScratchRoot,
    remoteName: validatedRemoteName,
  });
  const worktreesRoot = path.join(workspace.runDir, "worktrees");
  const nodeWorktrees: InitializedNodeWorktree[] = [];

  await mkdir(worktreesRoot, { recursive: true });

  const names = assignAgentNames(validatedRunId, validatedNodeIds);

  for (const nodeId of validatedNodeIds) {
    const resolvedAgentName = names.get(nodeId)!;
    const branch = `run/${validatedRunId}/${resolvedAgentName}`;
    const worktreeDir = path.join(worktreesRoot, resolvedAgentName);

    await runGit(
      ["worktree", "add", "-b", branch, worktreeDir, workspace.mainBranch],
      workspace.mainWorktreeDir,
    );
    await runGit(["push", "-u", validatedRemoteName, branch], worktreeDir);

    nodeWorktrees.push({
      nodeId,
      agentName: resolvedAgentName,
      runDir: workspace.runDir,
      mainWorktreeDir: workspace.mainWorktreeDir,
      worktreeDir,
      branch,
      remoteName: validatedRemoteName,
    });
  }

  return nodeWorktrees;
}

async function syncMainWorktreeWithRemote(
  workspace: InitializedWorkspace,
  runner: CommandRunner = runCommand,
): Promise<void> {
  // Best-effort push of any local commits on the main branch. Solo agents
  // work directly in the main worktree and may commit without pushing; this
  // preserves their work before the reset below throws out local-only state.
  await runner({
    command: "git",
    args: ["push", workspace.remoteName, workspace.mainBranch],
    cwd: workspace.mainWorktreeDir,
  });

  const fetchResult = await runner({
    command: "git",
    args: ["fetch", workspace.remoteName, workspace.mainBranch],
    cwd: workspace.mainWorktreeDir,
  });

  if (fetchResult.exitCode !== 0) {
    throw new Error(fetchResult.stderr || "git fetch failed");
  }

  const resetResult = await runner({
    command: "git",
    args: [
      "reset",
      "--hard",
      `${workspace.remoteName}/${workspace.mainBranch}`,
    ],
    cwd: workspace.mainWorktreeDir,
  });

  if (resetResult.exitCode !== 0) {
    throw new Error(resetResult.stderr || "git reset --hard failed");
  }
}

async function readRemoteUrl(
  repoRoot: string,
  remoteName: string,
): Promise<string> {
  const result = await runCommand({
    command: "git",
    args: ["config", "--get", `remote.${remoteName}.url`],
    cwd: repoRoot,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr ||
        `Could not read URL for remote ${remoteName} in ${repoRoot}`,
    );
  }

  const url = result.stdout.trim();

  if (url.length === 0) {
    throw new Error(
      `No URL configured for remote ${remoteName} in ${repoRoot}`,
    );
  }

  return url;
}

async function listRemoteRunBranches(
  cwd: string,
  remoteName: string,
  runId: string,
): Promise<string[]> {
  const result = await runCommand({
    command: "git",
    args: ["ls-remote", "--heads", remoteName, `run/${runId}/*`],
    cwd,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "git ls-remote failed");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[1] ?? "")
    .filter((ref) => ref.startsWith("refs/heads/"))
    .map((ref) => ref.slice("refs/heads/".length));
}

async function deleteRemoteRunBranches(
  cwd: string,
  remoteName: string,
  runId: string,
): Promise<void> {
  const branches = await listRemoteRunBranches(cwd, remoteName, runId);

  for (const branch of branches) {
    const result = await runCommand({
      command: "git",
      args: ["push", remoteName, "--delete", branch],
      cwd,
    });

    if (
      result.exitCode !== 0 &&
      !/remote ref does not exist/.test(result.stderr)
    ) {
      throw new Error(
        result.stderr || `git push --delete ${branch} failed`,
      );
    }
  }
}

export function buildRunMainBranchProtectionPayload({
  topology,
}: BuildRunMainBranchProtectionPayloadInput): RunMainBranchProtectionPayload {
  validateTopology(topology);

  return {
    required_status_checks: null,
    enforce_admins: false,
    required_pull_request_reviews: null,
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: false,
    lock_branch: false,
    allow_fork_syncing: true,
  };
}

export async function protectRunMainBranch({
  repo,
  branch,
  topology,
  runner = runCommand,
}: ProtectRunMainBranchInput): Promise<void> {
  const validatedRepo = validateNonEmptyString(repo, "repo");
  const validatedBranch = validateNonEmptyString(branch, "branch");
  const payload = buildRunMainBranchProtectionPayload({ topology });
  const tempDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-branch-protection-"),
  );
  const payloadPath = path.join(tempDir, "protection.json");

  await writeFile(payloadPath, JSON.stringify(payload), "utf8");

  try {
    const result = await runner({
      command: "gh",
      args: [
        "api",
        "--method",
        "PUT",
        `repos/${validatedRepo}/branches/${encodeURIComponent(validatedBranch)}/protection`,
        "--input",
        payloadPath,
      ],
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to protect branch ${validatedBranch}: ${result.stderr.trim() || result.stdout.trim() || "gh api exited unsuccessfully"}`,
      );
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function initializeNodeInboxes({
  runDir,
  nodeIds,
}: InitializeNodeInboxesInput): Promise<Record<string, string>> {
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedNodeIds = validateStringArray(nodeIds, "nodeIds");
  const inboxDir = path.join(validatedRunDir, "inbox");

  await mkdir(inboxDir, { recursive: true });

  const inboxPaths = Object.fromEntries(
    validatedNodeIds.map((nodeId) => [
      nodeId,
      path.join(inboxDir, `${nodeId}.jsonl`),
    ]),
  );

  await Promise.all(
    Object.values(inboxPaths).map(async (inboxPath) => {
      await writeFile(inboxPath, "", "utf8");
    }),
  );

  return inboxPaths;
}

export async function appendInboxMessage({
  runDir,
  message,
}: AppendInboxMessageInput): Promise<boolean> {
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const parsedMessage = MessageEnvelope.safeParse(message);

  if (!parsedMessage.success) {
    return false;
  }

  const inboxPath = path.join(
    validatedRunDir,
    "inbox",
    `${parsedMessage.data.to}.jsonl`,
  );

  await mkdir(path.dirname(inboxPath), { recursive: true });
  await appendFile(
    inboxPath,
    `${JSON.stringify(parsedMessage.data)}\n`,
    "utf8",
  );

  return true;
}

export async function routeInboxMessage({
  runDir,
  topology,
  message,
}: RouteInboxMessageInput): Promise<boolean> {
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedTopology = validateTopology(topology);
  const parsedMessage = MessageEnvelope.safeParse(message);

  if (!parsedMessage.success) {
    return false;
  }

  const envelope = parsedMessage.data;

  if (!hasTopologyEdge(validatedTopology, envelope.from, envelope.to)) {
    const rejectionEvent: Omit<RoutingRejectionEvent, "schema_version" | "ts"> =
      {
        run_id: envelope.run_id,
        round: envelope.round,
        type: "routing_rejection",
        node_id: envelope.from,
        attempted_message: {
          from: envelope.from,
          to: envelope.to,
          tag: envelope.tag,
        },
        reason: `Non-neighbor message rejected: ${envelope.from} -> ${envelope.to}`,
      };

    await appendOrchestratorEvent(validatedRunDir, rejectionEvent);

    return false;
  }

  await appendStagedMessage(validatedRunDir, envelope);

  return true;
}

export async function deliverStagedInboxMessages({
  runDir,
  round,
}: DeliverStagedInboxMessagesInput): Promise<number> {
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const stagedMessagesPath = path.join(
    validatedRunDir,
    "trajectory",
    "staged-messages.jsonl",
  );
  const stagedContents = await readFile(stagedMessagesPath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }

      throw error;
    },
  );

  const pendingLines = stagedContents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const remainingMessages: Array<typeof MessageEnvelope._type> = [];
  let deliveredCount = 0;

  for (const line of pendingLines) {
    const envelope = MessageEnvelope.parse(JSON.parse(line));

    if (envelope.round !== validatedRound) {
      remainingMessages.push(envelope);
      continue;
    }

    await appendInboxMessage({
      runDir: validatedRunDir,
      message: envelope,
    });
    await appendDeliveredMessage(validatedRunDir, envelope);
    deliveredCount += 1;
  }

  await mkdir(path.dirname(stagedMessagesPath), { recursive: true });
  await writeFile(
    stagedMessagesPath,
    remainingMessages.map((message) => JSON.stringify(message)).join("\n") +
      (remainingMessages.length > 0 ? "\n" : ""),
    "utf8",
  );

  return deliveredCount;
}

export async function runSoloNodeRound({
  runId,
  round,
  workspace,
  runConfig,
  abortSignal,
  runner = runCommand,
  openCodeClient,
}: RunSoloNodeRoundInput): Promise<SoloNodeRoundResult> {
  validateNonEmptyString(runId, "runId");
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedConfig = validateRunConfig(runConfig);

  if (validatedConfig.topology.nodes.length !== 1) {
    throw new Error("Solo node runner requires a single-node topology");
  }

  if (validatedConfig.topology.leader !== validatedConfig.topology.nodes[0]) {
    throw new Error("Solo node runner requires the only node to be the leader");
  }

  const sessionFile = path.join(workspace.runDir, "sessions", "leader.json");
  const model = validatedConfig.models.node.model;
  const prompt = buildSoloPrompt({
    round: validatedRound,
    maxRounds: validatedConfig.maxRounds,
    brief: validatedConfig.brief,
  });
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const schema = soloNodeRoundOutputJsonSchema();
  let parsed: {
    finalText: string;
    toolCalls: NodeToolCall[];
    tokens: { in: number; out: number };
  };
  let output: SoloNodeRoundOutput;

  if (openCodeClient) {
    const sendPrompt = openCodeClient.sendPrompt ?? sendOpenCodePromptStreamed;
    const sessionId = openCodeClient.sessionId;

    if (sessionId) {
      const response = await sendPrompt({
        baseUrl: openCodeClient.baseUrl,
        sessionId,
        prompt,
        schema,
        signal: abortSignal,
      });
      output =
        (response.structured as SoloNodeRoundOutput | null) ??
        parseSoloNodeRoundOutput(response.finalText ?? "");
      parsed = {
        finalText: response.finalText ?? JSON.stringify(output),
        toolCalls: response.toolCalls ?? [],
        tokens: response.tokens,
      };
    } else {
      const createSession =
        openCodeClient.createSession ?? createOpenCodeSession;
      const removeSession =
        openCodeClient.deleteSession ?? deleteOpenCodeSession;
      const session = await createSession({
        baseUrl: openCodeClient.baseUrl,
        directory: workspace.mainWorktreeDir,
      });

      try {
        const response = await sendPrompt({
          baseUrl: openCodeClient.baseUrl,
          sessionId: session.id,
          prompt,
          schema,
          signal: abortSignal,
        });
        output =
          (response.structured as SoloNodeRoundOutput | null) ??
          parseSoloNodeRoundOutput(response.finalText ?? "");
        parsed = {
          finalText: response.finalText ?? JSON.stringify(output),
          toolCalls: response.toolCalls ?? [],
          tokens: response.tokens,
        };
      } finally {
        await removeSession({
          baseUrl: openCodeClient.baseUrl,
          sessionId: session.id,
        }).catch(() => undefined);
      }
    }
  } else {
    const result = await runner({
      command: "opencode",
      args: [
        "run",
        "--format",
        "json",
        "--model",
        model,
        "--dangerously-skip-permissions",
        prompt,
      ],
      cwd: workspace.mainWorktreeDir,
      signal: abortSignal,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || `OpenCode exited with code ${result.exitCode}`,
      );
    }

    parsed = parseOpenCodeResponse(result.stdout);
    output = parseSoloNodeRoundOutput(parsed.finalText);
  }

  await writeNodeTurnRecord({
    runId,
    nodeId: validatedConfig.topology.leader,
    round: validatedRound,
    runDir: workspace.runDir,
    model,
    output,
    toolCalls: parsed.toolCalls,
    tokens: parsed.tokens,
    startedAt,
    latencyMs: Date.now() - startedAtMs,
  });

  await detectUnsummarizedPrActivity({
    runId,
    runDir: workspace.runDir,
    round: validatedRound,
    nodeId: validatedConfig.topology.leader,
    toolCalls: parsed.toolCalls,
    messages: output.messages,
  });

  return {
    sessionFile,
    model,
    output,
    toolCalls: parsed.toolCalls,
    tokens: parsed.tokens,
  };
}

export async function runTopologyNodeRound({
  runId,
  round,
  nodeId,
  workspace,
  runConfig,
  inboxMessages,
  abortSignal,
  runner = runCommand,
  openCodeClient,
}: RunBenchmarkNodeRoundInput): Promise<SoloNodeRoundResult> {
  validateNonEmptyString(runId, "runId");
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");
  const validatedConfig = validateRunConfig(runConfig);

  if (!validatedConfig.topology.nodes.includes(validatedNodeId)) {
    throw new Error(`Unknown node ${validatedNodeId} for topology`);
  }

  const sessionFile = path.join(
    workspace.runDir,
    "sessions",
    `${validatedNodeId}.json`,
  );
  const model = validatedConfig.models.node.model;
  const prompt = buildTopologyNodePrompt({
    runId,
    round: validatedRound,
    maxRounds: validatedConfig.maxRounds,
    nodeId: validatedNodeId,
    topology: validatedConfig.topology,
    brief: validatedConfig.brief,
    inboxMessages,
  });
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const schema = soloNodeRoundOutputJsonSchema();
  let parsed: {
    finalText: string;
    toolCalls: NodeToolCall[];
    tokens: { in: number; out: number };
  };
  let output: SoloNodeRoundOutput;

  if (openCodeClient) {
    const sendPrompt = openCodeClient.sendPrompt ?? sendOpenCodePromptStreamed;
    const sessionId = openCodeClient.sessionId;

    if (sessionId) {
      const response = await sendPrompt({
        baseUrl: openCodeClient.baseUrl,
        sessionId,
        prompt,
        schema,
        signal: abortSignal,
      });
      output =
        (response.structured as SoloNodeRoundOutput | null) ??
        parseSoloNodeRoundOutput(response.finalText ?? "");
      parsed = {
        finalText: response.finalText ?? JSON.stringify(output),
        toolCalls: response.toolCalls ?? [],
        tokens: response.tokens,
      };
    } else {
      const createSession =
        openCodeClient.createSession ?? createOpenCodeSession;
      const removeSession =
        openCodeClient.deleteSession ?? deleteOpenCodeSession;
      const session = await createSession({
        baseUrl: openCodeClient.baseUrl,
        directory: workspace.worktreeDir,
      });

      try {
        const response = await sendPrompt({
          baseUrl: openCodeClient.baseUrl,
          sessionId: session.id,
          prompt,
          schema,
          signal: abortSignal,
        });
        output =
          (response.structured as SoloNodeRoundOutput | null) ??
          parseSoloNodeRoundOutput(response.finalText ?? "");
        parsed = {
          finalText: response.finalText ?? JSON.stringify(output),
          toolCalls: response.toolCalls ?? [],
          tokens: response.tokens,
        };
      } finally {
        await removeSession({
          baseUrl: openCodeClient.baseUrl,
          sessionId: session.id,
        }).catch(() => undefined);
      }
    }
  } else {
    const result = await runner({
      command: "opencode",
      args: [
        "run",
        "--format",
        "json",
        "--model",
        model,
        "--dangerously-skip-permissions",
        prompt,
      ],
      cwd: workspace.worktreeDir,
      signal: abortSignal,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || `OpenCode exited with code ${result.exitCode}`,
      );
    }

    parsed = parseOpenCodeResponse(result.stdout);
    output = parseSoloNodeRoundOutput(parsed.finalText);
  }

  await writeNodeTurnRecord({
    runId,
    nodeId: validatedNodeId,
    round: validatedRound,
    runDir: workspace.runDir,
    model,
    output,
    toolCalls: parsed.toolCalls,
    tokens: parsed.tokens,
    startedAt,
    latencyMs: Date.now() - startedAtMs,
  });

  await detectUnsummarizedPrActivity({
    runId,
    runDir: workspace.runDir,
    round: validatedRound,
    nodeId: validatedNodeId,
    toolCalls: parsed.toolCalls,
    messages: output.messages,
  });

  return {
    sessionFile,
    model,
    output,
    toolCalls: parsed.toolCalls,
    tokens: parsed.tokens,
  };
}

export async function runNodeRoundWithTimeout<T>({
  runId,
  runDir,
  round,
  nodeId,
  perRoundTimeoutMs,
  execute,
}: RunNodeRoundWithTimeoutInput<T>): Promise<RunNodeRoundWithTimeoutResult<T>> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");
  const validatedTimeoutMs = validatePositiveInteger(
    perRoundTimeoutMs,
    "perRoundTimeoutMs",
  );

  const timeoutToken = Symbol("timeout");
  const abortController = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;

  try {
    const result = await Promise.race([
      execute(abortController.signal).then(
        (output) => ({ kind: "output" as const, output }),
        (error: unknown) => ({ kind: "error" as const, error }),
      ),
      new Promise<typeof timeoutToken>((resolve) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          abortController.abort();
          resolve(timeoutToken);
        }, validatedTimeoutMs);
      }),
    ]);

    if (result === timeoutToken) {
      await appendOrchestratorEvent(validatedRunDir, {
        run_id: validatedRunId,
        round: validatedRound,
        type: "failure",
        node_id: validatedNodeId,
        failure_kind: "timeout",
        detail: `Node round exceeded per-round timeout of ${validatedTimeoutMs}ms`,
      });

      return {
        completed: false,
        reason: "timeout",
        output: null,
      };
    }

    if (result.kind === "error") {
      if (timedOut && isAbortError(result.error)) {
        await appendOrchestratorEvent(validatedRunDir, {
          run_id: validatedRunId,
          round: validatedRound,
          type: "failure",
          node_id: validatedNodeId,
          failure_kind: "timeout",
          detail: `Node round exceeded per-round timeout of ${validatedTimeoutMs}ms`,
        });

        return {
          completed: false,
          reason: "timeout",
          output: null,
        };
      }

      throw result.error;
    }

    return {
      completed: true,
      reason: null,
      output: result.output,
    };
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function runRoundParallel<T>({
  runId,
  runDir,
  round,
  nodeIds,
  perRoundTimeoutMs,
  executeNodeRound,
}: RunRoundParallelInput<T>): Promise<RunRoundParallelResult<T>> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedTimeoutMs = validatePositiveInteger(
    perRoundTimeoutMs,
    "perRoundTimeoutMs",
  );
  const validatedNodeIds = nodeIds.map((nodeId, index) =>
    validateNonEmptyString(nodeId, `nodeIds[${index}]`),
  );

  return Promise.all(
    validatedNodeIds.map(async (nodeId) => ({
      nodeId,
      ...(await runNodeRoundWithTimeout({
        runId: validatedRunId,
        runDir: validatedRunDir,
        round: validatedRound,
        nodeId,
        perRoundTimeoutMs: validatedTimeoutMs,
        execute: () => executeNodeRound(nodeId),
      })),
    })),
  );
}

export async function detectLeaderSubmission({
  runId,
  runDir,
  round,
  leaderNodeId,
  nodeId,
  messages,
}: DetectLeaderSubmissionInput): Promise<boolean> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedLeaderNodeId = validateNonEmptyString(
    leaderNodeId,
    "leaderNodeId",
  );
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");

  if (validatedNodeId !== validatedLeaderNodeId) {
    return false;
  }

  const submissionMessage = messages.find((message) =>
    isSubmissionDeclaration(message.content),
  );

  if (!submissionMessage) {
    return false;
  }

  await appendOrchestratorEvent(validatedRunDir, {
    run_id: validatedRunId,
    round: validatedRound,
    type: "submission",
    node_id: validatedNodeId,
    detail: submissionMessage.content,
  });

  return true;
}

export async function detectUnsummarizedPrActivity({
  runId,
  runDir,
  round,
  nodeId,
  toolCalls,
  messages,
}: DetectUnsummarizedPrActivityInput): Promise<boolean> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");

  const prToolCall = toolCalls.find((toolCall) =>
    isGhPrToolCall(toolCall.input),
  );

  if (!prToolCall) {
    return false;
  }

  if (messages.some((message) => containsPullRequestUrl(message.content))) {
    return false;
  }

  await appendOrchestratorEvent(validatedRunDir, {
    run_id: validatedRunId,
    round: validatedRound,
    type: "pr_activity_unsummarized",
    node_id: validatedNodeId,
    detail: `Observed ${prToolCall.input} without a matching PR URL in outbound messages.`,
  });

  return true;
}

export function verifyRunMainMergeAuthority({
  topology,
  nodeTurns,
}: VerifyRunMainMergeAuthorityInput): RunMainMergeAuthorityViolation[] {
  const validatedTopology = validateTopology(topology);
  const allowedNodeIds = new Set(
    resolveMainBranchIntegrators(validatedTopology),
  );

  const violations: RunMainMergeAuthorityViolation[] = [];

  for (const nodeTurn of nodeTurns) {
    const validatedNodeId = validateNonEmptyString(nodeTurn.nodeId, "nodeId");

    if (allowedNodeIds.has(validatedNodeId)) {
      continue;
    }

    for (const toolCall of nodeTurn.toolCalls) {
      if (!isGhPrMergeToolCall(toolCall.input)) {
        continue;
      }

      violations.push({
        nodeId: validatedNodeId,
        toolCall: toolCall.input,
        reason: `Node ${validatedNodeId} is not in topology.integrators and is not allowed to merge PRs into main.`,
      });
    }
  }

  return violations;
}

export async function enforceRunBudgetCaps({
  runId,
  runDir,
  round,
  runBudget,
  totals,
}: EnforceRunBudgetCapsInput): Promise<boolean> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedBudget = validateRunBudget(runBudget);
  const validatedTotals = validateRunBudgetTotals(totals);

  if (validatedTotals.tokens > validatedBudget.tokens) {
    await appendOrchestratorEvent(validatedRunDir, {
      run_id: validatedRunId,
      round: validatedRound,
      type: "cap_exceeded",
      cap: "tokens",
      limit: validatedBudget.tokens,
      actual: validatedTotals.tokens,
    });

    return true;
  }

  if (validatedTotals.wallClockMs > validatedBudget.wallClockMs) {
    await appendOrchestratorEvent(validatedRunDir, {
      run_id: validatedRunId,
      round: validatedRound,
      type: "cap_exceeded",
      cap: "wall_clock_ms",
      limit: validatedBudget.wallClockMs,
      actual: validatedTotals.wallClockMs,
    });

    return true;
  }

  return false;
}

export async function checkRunBudgetBetweenRounds({
  runId,
  runDir,
  round,
  runBudget,
  previousTotals,
  roundUsage,
}: CheckRunBudgetBetweenRoundsInput): Promise<CheckRunBudgetBetweenRoundsResult> {
  const validatedPreviousTotals = validateRunBudgetTotals(previousTotals);
  const validatedRoundUsage = validateRunBudgetTotals(roundUsage);
  const totals = {
    tokens: validatedPreviousTotals.tokens + validatedRoundUsage.tokens,
    wallClockMs:
      validatedPreviousTotals.wallClockMs + validatedRoundUsage.wallClockMs,
  };

  const exceeded = await enforceRunBudgetCaps({
    runId,
    runDir,
    round,
    runBudget,
    totals,
  });

  return {
    exceeded,
    totals,
  };
}

export async function snapshotRunPullRequests({
  runId,
  runDir,
  runner = runCommand,
}: SnapshotRunPullRequestsInput): Promise<PRSnapshot[]> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const prsDir = path.join(validatedRunDir, "trajectory", "prs");
  const listResult = await runner({
    command: "gh",
    args: [
      "pr",
      "list",
      "--label",
      `run:${validatedRunId}`,
      "--json",
      "number",
      "--limit",
      "1000",
    ],
  });

  if (listResult.exitCode !== 0) {
    throw new Error(listResult.stderr || "gh pr list failed");
  }

  const listedPrs = parsePrList(listResult.stdout);

  if (listedPrs.length === 0) {
    return [];
  }

  await mkdir(prsDir, { recursive: true });

  const snapshots: PRSnapshot[] = [];

  for (const listedPr of listedPrs) {
    const viewResult = await runner({
      command: "gh",
      args: [
        "pr",
        "view",
        String(listedPr.number),
        "--json",
        "number,url,author,title,body,reviewRequests,reviews,mergedAt,closedAt,createdAt,comments",
      ],
    });

    if (viewResult.exitCode !== 0) {
      throw new Error(
        viewResult.stderr || `gh pr view ${listedPr.number} failed`,
      );
    }

    const snapshot = PRSnapshot.parse(
      mapPullRequestSnapshot(validatedRunId, parsePrView(viewResult.stdout)),
    );

    await appendFile(
      path.join(prsDir, `${snapshot.pr_number}.json`),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    );
    snapshots.push(snapshot);
  }

  return snapshots;
}

const EXCLUDED_WORKTREE_TOP_LEVEL = new Set([
  ".git",
  "node_modules",
  "dist",
  ".org-bench-artifacts",
]);

export async function publishRunArtifact({
  repoRoot,
  runId,
  topology,
  workspace,
  runner = runCommand,
}: PublishRunArtifactInput): Promise<string> {
  const validatedRepoRoot = path.resolve(
    validateNonEmptyString(repoRoot, "repoRoot"),
  );
  validateNonEmptyString(runId, "runId");
  const validatedTopology = validateNonEmptyString(topology, "topology");
  const destinationDir = path.join(
    validatedRepoRoot,
    "docs",
    validatedTopology,
  );
  const trajectoryDir = path.join(workspace.runDir, "trajectory");

  // In topology runs, agents merge PRs into run/<id>/main on the remote and
  // never touch the local main worktree. Sync it now so we publish the
  // merged code, not the stale local state.
  await syncMainWorktreeWithRemote(workspace, runner);

  await mkdir(path.dirname(destinationDir), { recursive: true });
  await rm(destinationDir, { recursive: true, force: true });
  await mkdir(destinationDir, { recursive: true });

  // Vanilla HTML/CSS/JS artifact: no build step, the worktree source IS the
  // deliverable. Copy the worktree minus git metadata and any accidental
  // build or harness-owned directories.
  if (await pathExists(workspace.mainWorktreeDir)) {
    await cp(workspace.mainWorktreeDir, destinationDir, {
      recursive: true,
      filter: (source) => {
        const rel = path.relative(workspace.mainWorktreeDir, source);

        if (rel === "") {
          return true;
        }

        const [topLevel] = rel.split(path.sep);

        return topLevel === undefined
          ? true
          : !EXCLUDED_WORKTREE_TOP_LEVEL.has(topLevel);
      },
    });
  }

  if (await pathExists(trajectoryDir)) {
    await cp(trajectoryDir, path.join(destinationDir, "trajectory"), {
      recursive: true,
    });
  }

  return destinationDir;
}

export async function evaluatePublishedArtifact({
  artifactDir,
  runId,
  evaluate = evaluateArtifact,
}: EvaluatePublishedArtifactInput): Promise<EvaluateArtifactResult> {
  const validatedArtifactDir = path.resolve(
    validateNonEmptyString(artifactDir, "artifactDir"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");

  return evaluate({
    artifactDir: validatedArtifactDir,
    runId: validatedRunId,
  });
}

export async function judgePublishedArtifact({
  artifactDir,
  runId,
  model,
  openCodeClient,
  judge = runJudgeAgainstArtifact,
}: JudgePublishedArtifactInput): Promise<ArtifactJudgeOutput> {
  const validatedArtifactDir = path.resolve(
    validateNonEmptyString(artifactDir, "artifactDir"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedModel = validateNonEmptyString(model, "model");
  const outputPath = path.join(
    validatedArtifactDir,
    "trajectory",
    "judge.json",
  );
  const result = await judge({
    artifactDir: validatedArtifactDir,
    runId: validatedRunId,
    model: validatedModel,
    openCodeClient,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  return result;
}

export async function runTrajectoryAnalysis({
  artifactDir,
  runId,
  model,
  openCodeClient,
  startOpenCodeServe: launchOpenCodeServe = startOpenCodeServe,
  shutdownOpenCodeServe: stopOpenCodeServe = shutdownOpenCodeServe,
  analyze = runAnalystAgainstArtifact,
}: RunTrajectoryAnalysisInput): Promise<TrajectoryAnalysisOutput> {
  const validatedArtifactDir = path.resolve(
    validateNonEmptyString(artifactDir, "artifactDir"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedModel = validateNonEmptyString(model, "model");
  const outputPath = path.join(
    validatedArtifactDir,
    "trajectory",
    "analysis.json",
  );
  const createSession = openCodeClient?.createSession ?? createOpenCodeSession;
  const removeSession = openCodeClient?.deleteSession ?? deleteOpenCodeSession;
  const ownedServer = openCodeClient?.baseUrl
    ? null
    : await launchOpenCodeServe({ cwd: validatedArtifactDir });
  const resolvedOpenCodeClient =
    (openCodeClient ?? ownedServer)
      ? {
          baseUrl: openCodeClient?.baseUrl ?? ownedServer?.baseUrl ?? "",
          createSession,
          deleteSession: removeSession,
          sendPrompt: openCodeClient?.sendPrompt ?? sendOpenCodePromptStreamed,
          ...(openCodeClient?.sessionId
            ? { sessionId: openCodeClient.sessionId }
            : {}),
        }
      : undefined;

  try {
    const result = await analyze({
      artifactDir: validatedArtifactDir,
      runId: validatedRunId,
      model: validatedModel,
      openCodeClient: resolvedOpenCodeClient,
    });

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    return result;
  } finally {
    if (ownedServer !== null) {
      await stopOpenCodeServe(ownedServer).catch(() => undefined);
    }
  }
}

export type RegenerateTrajectoryAnalysisInput = {
  artifactDir: string;
  repoRoot?: string;
  openCodeClient?: RunTrajectoryAnalysisInput["openCodeClient"];
  startOpenCodeServe?: RunTrajectoryAnalysisInput["startOpenCodeServe"];
  shutdownOpenCodeServe?: RunTrajectoryAnalysisInput["shutdownOpenCodeServe"];
  analyze?: RunTrajectoryAnalysisInput["analyze"];
};

export async function regenerateTrajectoryAnalysis({
  artifactDir,
  repoRoot,
  openCodeClient,
  startOpenCodeServe,
  shutdownOpenCodeServe,
  analyze = runAnalystAgainstArtifact,
}: RegenerateTrajectoryAnalysisInput): Promise<TrajectoryAnalysisOutput> {
  const validatedArtifactDir = path.resolve(
    validateNonEmptyString(artifactDir, "artifactDir"),
  );
  const validatedRepoRoot = await resolveAggregateRepoRoot({
    artifactDir: validatedArtifactDir,
    repoRoot,
  });
  const metadata = inferArtifactMetadata(
    validatedArtifactDir,
    validatedRepoRoot,
  );
  const existingRunId = await readExistingRunId(validatedArtifactDir);
  const runId = existingRunId ?? metadata.topologySlug;

  return runTrajectoryAnalysis({
    artifactDir: validatedArtifactDir,
    runId,
    model: DEFAULT_ANALYST_MODEL,
    openCodeClient,
    startOpenCodeServe,
    shutdownOpenCodeServe,
    analyze,
  });
}

async function readExistingRunId(
  artifactDir: string,
): Promise<string | undefined> {
  const trajectoryDir = path.join(artifactDir, "trajectory");
  const nodeRecords = await readJsonlFile(
    path.join(trajectoryDir, "nodes", "*.jsonl"),
    NodeTurnRecord,
  );
  if (nodeRecords[0]) return nodeRecords[0].run_id;
  const messageRecords = await readOptionalJsonlFile(
    path.join(trajectoryDir, "messages.jsonl"),
    MessageEnvelope,
  );
  if (messageRecords[0]) return messageRecords[0].run_id;
  const eventRecords = await readOptionalJsonlFile(
    path.join(trajectoryDir, "events.jsonl"),
    OrchestratorEvent,
  );
  return eventRecords[0]?.run_id;
}

export async function aggregateRunMeta({
  artifactDir,
  repoRoot,
  seed: explicitSeed,
}: AggregateRunMetaInput): Promise<MetaJson> {
  const validatedArtifactDir = path.resolve(
    validateNonEmptyString(artifactDir, "artifactDir"),
  );
  const validatedRepoRoot = await resolveAggregateRepoRoot({
    artifactDir: validatedArtifactDir,
    repoRoot,
  });
  const trajectoryDir = path.join(validatedArtifactDir, "trajectory");
  const metadata = inferArtifactMetadata(
    validatedArtifactDir,
    validatedRepoRoot,
  );
  const topologyConfig = await loadTopologyConfigForSlug(
    metadata.topologySlug,
    validatedRepoRoot,
  );
  const briefPath = path.join(validatedRepoRoot, "configs", "brief.md");
  const briefContent = await readFile(briefPath, "utf8");
  const nodeRecords = await readJsonlFile(
    path.join(trajectoryDir, "nodes", "*.jsonl"),
    NodeTurnRecord,
  );
  const messageRecords = await readOptionalJsonlFile(
    path.join(trajectoryDir, "messages.jsonl"),
    MessageEnvelope,
  );
  const eventRecords = await readOptionalJsonlFile(
    path.join(trajectoryDir, "events.jsonl"),
    OrchestratorEvent,
  );
  const evaluatorRecords = await readJsonlFile(
    path.join(trajectoryDir, "evaluator", "*.jsonl"),
    EvaluatorStepRecord,
  );
  const patchRecords = await readJsonFiles(
    path.join(trajectoryDir, "patches"),
    PatchDecision,
  );
  const judgeOutput = await readOptionalJsonFile(
    path.join(trajectoryDir, "judge.json"),
    ArtifactJudgeOutput,
  );
  const analysisOutput = await readOptionalJsonFile(
    path.join(trajectoryDir, "analysis.json"),
    TrajectoryAnalysisOutput,
  );
  const runId =
    nodeRecords[0]?.run_id ??
    messageRecords[0]?.run_id ??
    eventRecords[0]?.run_id ??
    evaluatorRecords[0]?.run_id ??
    judgeOutput?.run_id ??
    analysisOutput?.run_id ??
    metadata.topologySlug;
  const seed =
    explicitSeed ??
    (await readExistingMetaSeed(validatedArtifactDir)) ??
    0;

  const nodeTokens = sumUsage(nodeRecords);
  const evaluatorTokens = sumUsage(evaluatorRecords);
  const judgeTokens = judgeOutput?.tokens ?? { in: 0, out: 0 };
  const analysisTokens = analysisOutput?.tokens ?? { in: 0, out: 0 };
  const totalTokensIn =
    nodeTokens.in + evaluatorTokens.in + judgeTokens.in + analysisTokens.in;
  const totalTokensOut =
    nodeTokens.out + evaluatorTokens.out + judgeTokens.out + analysisTokens.out;
  const totalCostUsd =
    sumCost(nodeRecords) +
    sumCost(evaluatorRecords) +
    (judgeOutput?.cost_usd ?? 0) +
    (analysisOutput?.cost_usd ?? 0);
  const totalWallClockMs =
    sumLatency(nodeRecords) + sumLatency(evaluatorRecords);
  const tokensByNode = buildTokensByNode(nodeRecords);
  const evaluatorSummary = summarizeEvaluatorRecords(evaluatorRecords);
  const publishedPath = path.relative(validatedRepoRoot, validatedArtifactDir);
  const milestoneBaseTs = earliestTimestamp([
    ...nodeRecords.map((record) => record.ts),
    ...messageRecords.map((record) => record.ts),
    ...eventRecords.map((record) => record.ts),
  ]);
  const firstPassingScenarioTs =
    earliestPassingScenarioTimestamp(evaluatorRecords);

  const meta = MetaJson.parse({
    run_id: runId,
    schema_version: SCHEMA_VERSION,
    topology: {
      slug: topologyConfig?.slug ?? metadata.topologySlug,
      name: topologyConfig?.name ?? toDisplayName(metadata.topologySlug),
      leader_id: topologyConfig?.leader ?? inferLeaderId(nodeRecords),
      node_count: topologyConfig?.nodes.length ?? countNodeIds(nodeRecords),
      culture: topologyConfig?.culture ?? null,
    },
    seed,
    brief: {
      path: path.relative(validatedRepoRoot, briefPath),
      content_hash: createHash("sha256").update(briefContent).digest("hex"),
    },
    models: {
      node: nodeRecords[0]?.model ?? "unknown",
      evaluator: evaluatorRecords[0]?.model ?? "unknown",
      judge: judgeOutput?.model ?? "unknown",
      analyst: analysisOutput?.model ?? "unknown",
    },
    prompts: {
      evaluator_scenarios_version: EVALUATOR_SCENARIOS_VERSION,
      judge_prompt_version:
        judgeOutput?.prompt_version ?? artifactJudgePromptV1.version,
      analyst_prompt_version:
        analysisOutput?.prompt_version ?? trajectoryAnalystPromptV1.version,
    },
    totals: {
      tokens: {
        in: totalTokensIn,
        out: totalTokensOut,
        total: totalTokensIn + totalTokensOut,
      },
      cost_usd: totalCostUsd,
      wall_clock_ms: totalWallClockMs,
    },
    tokens_by_node: tokensByNode,
    messages: summarizeMessages(messageRecords),
    patches: summarizePatches(patchRecords),
    evaluator: evaluatorSummary,
    artifact: {
      deploy_success: await pathExists(
        path.join(validatedArtifactDir, "index.html"),
      ),
      build_success: await pathExists(
        path.join(validatedArtifactDir, "index.html"),
      ),
      published_path: publishedPath,
    },
    milestones: {
      time_to_first_playable_build_ms: 0,
      time_to_first_passing_scenario_ms:
        milestoneBaseTs === null || firstPassingScenarioTs === null
          ? null
          : Math.max(0, firstPassingScenarioTs - milestoneBaseTs),
    },
    flags: {
      cap_exceeded: eventRecords.some((event) => event.type === "cap_exceeded"),
      truncated_blobs: false,
      routing_rejections: eventRecords.filter(
        (event) => event.type === "routing_rejection",
      ).length,
      pr_activity_unsummarized: eventRecords.filter(
        (event) => event.type === "pr_activity_unsummarized",
      ).length,
      node_failures: eventRecords.filter((event) => event.type === "failure")
        .length,
    },
  });

  await writeFile(
    path.join(validatedArtifactDir, "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );

  return meta;
}

async function resolveAggregateRepoRoot({
  artifactDir,
  repoRoot,
}: {
  artifactDir: string;
  repoRoot?: string;
}): Promise<string> {
  if (repoRoot !== undefined) {
    return path.resolve(validateNonEmptyString(repoRoot, "repoRoot"));
  }

  let currentDir = path.resolve(artifactDir);

  while (true) {
    if (await pathExists(path.join(currentDir, "configs", "brief.md"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(
        `Could not infer repoRoot from artifactDir: ${artifactDir}`,
      );
    }

    currentDir = parentDir;
  }
}

export async function closeOpenRunPullRequests({
  runId,
  runner = runCommand,
}: CloseOpenRunPullRequestsInput): Promise<number[]> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const listResult = await runner({
    command: "gh",
    args: [
      "pr",
      "list",
      "--label",
      `run:${validatedRunId}`,
      "--state",
      "open",
      "--json",
      "number",
      "--limit",
      "1000",
    ],
  });

  if (listResult.exitCode !== 0) {
    throw new Error(listResult.stderr || "gh pr list (open) failed");
  }

  const listed = parsePrList(listResult.stdout);

  if (listed.length === 0) {
    return [];
  }

  const closed: number[] = [];

  for (const { number } of listed) {
    const closeResult = await runner({
      command: "gh",
      args: [
        "pr",
        "close",
        String(number),
        "--comment",
        `Auto-closed at end of benchmark run ${validatedRunId}.`,
      ],
    });

    if (closeResult.exitCode === 0) {
      closed.push(number);
      continue;
    }

    if (/already closed|not open/i.test(closeResult.stderr)) {
      continue;
    }

    throw new Error(
      closeResult.stderr || `gh pr close ${number} failed`,
    );
  }

  return closed;
}

export async function stripBenchmarkRunLabelsForTopology({
  topologySlug,
  runner = runCommand,
}: StripBenchmarkRunLabelsForTopologyInput): Promise<number[]> {
  const validatedSlug = validateNonEmptyString(topologySlug, "topologySlug");
  const listResult = await runner({
    command: "gh",
    args: [
      "pr",
      "list",
      "--label",
      "benchmark-run",
      "--state",
      "all",
      "--json",
      "number,labels",
      "--limit",
      "1000",
    ],
  });

  if (listResult.exitCode !== 0) {
    throw new Error(listResult.stderr || "gh pr list (benchmark-run) failed");
  }

  const listed = parsePrListWithLabels(listResult.stdout);
  const seedLabelPrefix = `run:${validatedSlug}-seed-`;
  const targets = listed.filter((pr) =>
    pr.labels.some((label) => label.startsWith(seedLabelPrefix)),
  );

  if (targets.length === 0) {
    return [];
  }

  const stripped: number[] = [];

  for (const { number } of targets) {
    const editResult = await runner({
      command: "gh",
      args: [
        "pr",
        "edit",
        String(number),
        "--remove-label",
        "benchmark-run",
      ],
    });

    if (editResult.exitCode === 0) {
      stripped.push(number);
      continue;
    }

    if (/label.*not.*found|does not have/i.test(editResult.stderr)) {
      continue;
    }

    throw new Error(
      editResult.stderr || `gh pr edit ${number} --remove-label failed`,
    );
  }

  return stripped;
}

function parsePrListWithLabels(
  raw: string,
): Array<{ number: number; labels: string[] }> {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("gh pr list returned a non-array payload");
  }

  return parsed.map((pr) => {
    if (!isRecord(pr) || typeof pr.number !== "number") {
      throw new Error("gh pr list entry missing numeric `number`");
    }
    const rawLabels = pr.labels;
    const labels: string[] = Array.isArray(rawLabels)
      ? rawLabels
          .map((label) =>
            isRecord(label) && typeof label.name === "string"
              ? label.name
              : null,
          )
          .filter((name): name is string => name !== null)
      : [];
    return { number: pr.number, labels };
  });
}

export async function cleanupRunBranches({
  repoRoot,
  runId,
  runScratchRoot,
  remoteName = "origin",
}: CleanupRunBranchesInput): Promise<string[]> {
  const validatedRepoRoot = path.resolve(
    validateNonEmptyString(repoRoot, "repoRoot"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRemoteName = validateNonEmptyString(remoteName, "remoteName");
  const scratchRoot = resolveRunScratchRoot(
    validatedRepoRoot,
    runScratchRoot,
  );
  const gitDir = path.join(scratchRoot, validatedRunId, ".git");

  if (!(await pathExists(gitDir))) {
    return [];
  }

  const mainBranch = `run/${validatedRunId}/main`;
  const branches = (
    await listRemoteRunBranches(gitDir, validatedRemoteName, validatedRunId)
  ).filter((branch) => branch !== mainBranch);

  for (const branch of branches) {
    const deleteRemoteResult = await runCommand({
      command: "git",
      args: ["push", validatedRemoteName, "--delete", branch],
      cwd: gitDir,
    });

    if (
      deleteRemoteResult.exitCode !== 0 &&
      !/remote ref does not exist/.test(deleteRemoteResult.stderr)
    ) {
      throw new Error(
        deleteRemoteResult.stderr || "git push --delete failed",
      );
    }
  }

  return branches;
}

export async function persistRunArtifactsToRootBranch({
  workspace,
  runId,
}: PersistRunArtifactsInput): Promise<boolean> {
  const validatedRunId = validateNonEmptyString(runId, "runId");

  await syncMainWorktreeWithRemote(workspace);

  const artifactsDir = path.join(
    workspace.mainWorktreeDir,
    ".org-bench-artifacts",
  );

  await rm(artifactsDir, { recursive: true, force: true });
  await mkdir(artifactsDir, { recursive: true });

  for (const sub of ["inbox", "trajectory"]) {
    const src = path.join(workspace.runDir, sub);

    if (await pathExists(src)) {
      await cp(src, path.join(artifactsDir, sub), { recursive: true });
    }
  }

  await runGit(["add", ".org-bench-artifacts"], workspace.mainWorktreeDir);

  const statusResult = await runCommand({
    command: "git",
    args: ["status", "--porcelain"],
    cwd: workspace.mainWorktreeDir,
  });

  if (statusResult.exitCode !== 0) {
    throw new Error(statusResult.stderr || "git status failed");
  }

  if (statusResult.stdout.trim().length === 0) {
    return false;
  }

  await runGit(
    ["commit", "-m", `persist run artifacts for ${validatedRunId}`],
    workspace.mainWorktreeDir,
  );
  await runGit(
    ["push", workspace.remoteName, workspace.mainBranch],
    workspace.mainWorktreeDir,
  );

  return true;
}

export async function teardownRunWorkspace({
  repoRoot,
  runId,
  runScratchRoot,
}: TeardownRunWorkspaceInput): Promise<void> {
  const validatedRepoRoot = path.resolve(
    validateNonEmptyString(repoRoot, "repoRoot"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const scratchRoot = resolveRunScratchRoot(
    validatedRepoRoot,
    runScratchRoot,
  );
  const runDir = path.join(scratchRoot, validatedRunId);

  await rm(runDir, { recursive: true, force: true });
}

async function writeNodeTurnRecord({
  runId,
  nodeId,
  round,
  runDir,
  model,
  output,
  toolCalls,
  tokens,
  startedAt,
  latencyMs,
}: {
  runId: string;
  nodeId: string;
  round: number;
  runDir: string;
  model: string;
  output: SoloNodeRoundOutput;
  toolCalls: NodeToolCall[];
  tokens: { in: number; out: number };
  startedAt: Date;
  latencyMs: number;
}): Promise<void> {
  const nodesDir = path.join(runDir, "trajectory", "nodes");
  const nodePath = path.join(nodesDir, `${nodeId}.jsonl`);

  await mkdir(nodesDir, { recursive: true });

  const record = NodeTurnRecord.parse({
    run_id: runId,
    node_id: nodeId,
    round,
    turn: 1,
    schema_version: SCHEMA_VERSION,
    ts: startedAt.toISOString(),
    prompt_refs: [],
    output,
    tool_calls: toolCalls,
    tokens,
    model,
    latency_ms: Math.max(0, latencyMs),
    cost_usd: 0,
  });

  await appendFile(nodePath, `${JSON.stringify(record)}\n`, "utf8");
}

async function resolveRunBriefContent(
  brief: string,
  repoRoot: string,
): Promise<string> {
  const validatedBrief = validateNonEmptyString(brief, "runConfig.brief");
  const candidatePath = path.isAbsolute(validatedBrief)
    ? validatedBrief
    : path.join(repoRoot, validatedBrief);

  if (await pathExists(candidatePath)) {
    const candidateStat = await stat(candidatePath);

    if (candidateStat.isFile()) {
      return readFile(candidatePath, "utf8");
    }
  }

  return validatedBrief;
}

async function appendOrchestratorEvent(
  runDir: string,
  event: OrchestratorEventInput,
): Promise<void> {
  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");

  await mkdir(path.dirname(eventsPath), { recursive: true });

  const record = OrchestratorEvent.parse({
    ...event,
    schema_version: SCHEMA_VERSION,
    ts: new Date().toISOString(),
  });

  await appendFile(eventsPath, `${JSON.stringify(record)}\n`, "utf8");
}

type FinalizeStageName =
  | "evaluator"
  | "judge"
  | "analyst"
  | "aggregate"
  | "close_prs";

async function runPreflightClosePullRequests(
  runId: string,
  closeOpenPullRequests: (
    input: CloseOpenRunPullRequestsInput,
  ) => Promise<number[]>,
): Promise<void> {
  try {
    await closeOpenPullRequests({ runId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `[bench] preflight close_prs failed for ${runId}; continuing: ${detail}\n`,
    );
  }
}

async function runPreflightStripPriorTopologyLabels(
  topologySlug: string,
  stripPriorTopologyLabels: (
    input: StripBenchmarkRunLabelsForTopologyInput,
  ) => Promise<number[]>,
): Promise<void> {
  try {
    await stripPriorTopologyLabels({ topologySlug });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `[bench] preflight strip_prior_topology_labels failed for ${topologySlug}; continuing: ${detail}\n`,
    );
  }
}

async function runFinalizeStage<T>({
  artifactDir,
  runId,
  round,
  stage,
  run,
}: {
  artifactDir: string;
  runId: string;
  round: number;
  stage: FinalizeStageName;
  run: () => Promise<T>;
}): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `[finalize] stage "${stage}" failed for ${runId}: ${detail}\n`,
    );

    await appendOrchestratorEvent(artifactDir, {
      run_id: runId,
      round,
      type: "stage_failed",
      stage,
      detail: detail.length > 0 ? detail : `${stage} stage failed`,
    });

    return null;
  }
}

async function appendDeliveredMessage(
  runDir: string,
  message: typeof MessageEnvelope._type,
): Promise<void> {
  const messagesPath = path.join(runDir, "trajectory", "messages.jsonl");

  await mkdir(path.dirname(messagesPath), { recursive: true });
  await appendFile(messagesPath, `${JSON.stringify(message)}\n`, "utf8");
}

async function appendStagedMessage(
  runDir: string,
  message: typeof MessageEnvelope._type,
): Promise<void> {
  const stagedMessagesPath = path.join(
    runDir,
    "trajectory",
    "staged-messages.jsonl",
  );

  await mkdir(path.dirname(stagedMessagesPath), { recursive: true });
  await appendFile(stagedMessagesPath, `${JSON.stringify(message)}\n`, "utf8");
}

function hasTopologyEdge(
  topology: TopologyConfig,
  fromNodeId: string,
  toNodeId: string,
): boolean {
  for (const edge of topology.edges) {
    if (edge.from === fromNodeId && edge.to === toNodeId) {
      return true;
    }

    if (
      edge.bidir === true &&
      edge.from === toNodeId &&
      edge.to === fromNodeId
    ) {
      return true;
    }
  }

  return false;
}

function isGhPrToolCall(input: string): boolean {
  return /(^|\s)gh\s+pr(\s|$)/i.test(input);
}

function containsPullRequestUrl(content: string): boolean {
  return /https?:\/\/\S+\/pull\/\d+/i.test(content);
}

async function runJudgeAgainstArtifact({
  artifactDir,
  runId,
  model,
  openCodeClient,
}: {
  artifactDir: string;
  runId: string;
  model: string;
  openCodeClient?: {
    baseUrl: string;
    sessionId?: string;
    createSession?: typeof createOpenCodeSession;
    sendPrompt?: OpenCodeStructuredPromptSender;
    deleteSession?: typeof deleteOpenCodeSession;
  };
}): Promise<ArtifactJudgeOutput> {
  const artifactSummary = await buildArtifactSummary(artifactDir);

  return runArtifactJudge({
    runId,
    cwd: artifactDir,
    artifactSummary,
    model,
    openCodeClient,
  });
}

async function runAnalystAgainstArtifact({
  artifactDir,
  runId,
  model,
  openCodeClient,
}: {
  artifactDir: string;
  runId: string;
  model: string;
  openCodeClient?: {
    baseUrl: string;
    sessionId?: string;
    createSession?: typeof createOpenCodeSession;
    sendPrompt?: OpenCodeStructuredPromptSender;
    deleteSession?: typeof deleteOpenCodeSession;
  };
}): Promise<TrajectoryAnalysisOutput> {
  const trajectorySummary = await buildTrajectorySummary(artifactDir);

  return runTrajectoryAnalyst({
    runId,
    cwd: artifactDir,
    trajectorySummary,
    model,
    openCodeClient,
  });
}

async function buildArtifactSummary(artifactDir: string): Promise<string> {
  const indexHtmlPath = path.join(artifactDir, "index.html");
  const indexHtml = await readFile(indexHtmlPath, "utf8");

  return [
    `Artifact directory: ${artifactDir}`,
    `Index HTML path: ${indexHtmlPath}`,
    "Rendered HTML:",
    indexHtml,
  ].join("\n\n");
}

async function buildTrajectorySummary(artifactDir: string): Promise<string> {
  const trajectoryDir = path.join(artifactDir, "trajectory");
  const entries = (
    await collectFileEntries(trajectoryDir, trajectoryDir)
  ).filter(({ relativePath }) =>
    shouldIncludeTrajectorySummaryEntry(relativePath),
  );
  const sections = await Promise.all(
    entries.map(async ({ absolutePath, relativePath }) => {
      const content = await readFile(absolutePath, "utf8");

      return [`Trajectory file: ${relativePath}`, content].join("\n\n");
    }),
  );
  const metaPath = path.join(artifactDir, "meta.json");
  const metaSection = (await pathExists(metaPath))
    ? ["Artifact file: meta.json", await readFile(metaPath, "utf8")].join(
        "\n\n",
      )
    : null;

  return [
    `Artifact directory: ${artifactDir}`,
    `Trajectory directory: ${trajectoryDir}`,
    ...(metaSection === null ? [] : [metaSection]),
    ...sections,
  ].join("\n\n");
}

function shouldIncludeTrajectorySummaryEntry(relativePath: string): boolean {
  if (relativePath.startsWith(`evaluator${path.sep}`)) {
    return false;
  }

  if (relativePath.startsWith(`blobs${path.sep}`)) {
    return false;
  }

  return relativePath !== "analysis.json";
}

async function readJsonlFile<T>(
  filePattern: string,
  schema: { parse: (value: unknown) => T },
): Promise<T[]> {
  if (filePattern.includes("*")) {
    const directory = path.dirname(filePattern);
    const suffix = path.basename(filePattern).replace("*", "");

    if (!(await pathExists(directory))) {
      return [];
    }

    const entries = (await readdir(directory))
      .filter((entry) => entry.endsWith(suffix))
      .sort();
    const records = await Promise.all(
      entries.map(async (entry) =>
        readOptionalJsonlFile(path.join(directory, entry), schema),
      ),
    );

    return records.flat();
  }

  return readOptionalJsonlFile(filePattern, schema);
}

async function readOptionalJsonlFile<T>(
  filePath: string,
  schema: { parse: (value: unknown) => T },
): Promise<T[]> {
  if (!(await pathExists(filePath))) {
    return [];
  }

  const content = await readFile(filePath, "utf8");

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => schema.parse(JSON.parse(line)));
}

async function readJsonFiles<T>(
  directory: string,
  schema: { parse: (value: unknown) => T },
): Promise<T[]> {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = (await readdir(directory)).sort();

  return Promise.all(
    entries.map(async (entry) =>
      schema.parse(
        JSON.parse(await readFile(path.join(directory, entry), "utf8")),
      ),
    ),
  );
}

async function readOptionalJsonFile<T>(
  filePath: string,
  schema: { parse: (value: unknown) => T },
): Promise<T | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

function sumUsage(records: Array<{ tokens: { in: number; out: number } }>): {
  in: number;
  out: number;
} {
  return records.reduce(
    (total, record) => ({
      in: total.in + record.tokens.in,
      out: total.out + record.tokens.out,
    }),
    { in: 0, out: 0 },
  );
}

function sumCost(records: Array<{ cost_usd: number }>): number {
  return records.reduce((total, record) => total + record.cost_usd, 0);
}

function sumLatency(records: Array<{ latency_ms: number }>): number {
  return records.reduce((total, record) => total + record.latency_ms, 0);
}

function buildTokensByNode(
  records: NodeTurnRecord[],
): Record<
  string,
  { in: number; out: number; total: number; cost_usd: number }
> {
  return Object.fromEntries(
    Array.from(groupBy(records, (record) => record.node_id).entries()).map(
      ([nodeId, nodeRecords]) => {
        const tokens = sumUsage(nodeRecords);

        return [
          nodeId,
          {
            in: tokens.in,
            out: tokens.out,
            total: tokens.in + tokens.out,
            cost_usd: sumCost(nodeRecords),
          },
        ];
      },
    ),
  );
}

function summarizeMessages(messages: MessageEnvelope[]): {
  total: number;
  by_tag: {
    decompose: number;
    ask: number;
    answer: number;
    deliver: number;
    status: number;
    review: number;
    untagged: number;
  };
} {
  const byTag = {
    decompose: 0,
    ask: 0,
    answer: 0,
    deliver: 0,
    status: 0,
    review: 0,
    untagged: 0,
  };

  for (const message of messages) {
    if (message.tag === undefined) {
      byTag.untagged += 1;
      continue;
    }

    byTag[message.tag] += 1;
  }

  return {
    total: messages.length,
    by_tag: byTag,
  };
}

function summarizePatches(patches: PatchDecision[]): {
  proposed: number;
  accepted: number;
  rejected: number;
  superseded: number;
} {
  return {
    proposed: patches.length,
    accepted: patches.filter((patch) => patch.disposition === "accepted")
      .length,
    rejected: patches.filter((patch) => patch.disposition === "rejected")
      .length,
    superseded: patches.filter((patch) => patch.disposition === "superseded")
      .length,
  };
}

function summarizeEvaluatorRecords(records: EvaluatorStepRecord[]): {
  attempts_per_scenario: number;
  overall_pass_rate: number;
  scenarios: Record<
    string,
    { passed_attempts: number; total_attempts: number; pass_rate: number }
  >;
} {
  const attemptsByScenario = groupBy(records, (record) => record.scenario);
  const scenarios = Object.fromEntries(
    Array.from(attemptsByScenario.entries()).map(
      ([scenarioId, scenarioRecords]) => {
        const attempts = groupBy(scenarioRecords, (record) =>
          String(record.attempt),
        );
        const totalAttempts = attempts.size;
        const passedAttempts = Array.from(attempts.values()).filter(
          (attemptRecords) => didEvaluatorAttemptPass(attemptRecords),
        ).length;

        return [
          scenarioId,
          {
            passed_attempts: passedAttempts,
            total_attempts: totalAttempts,
            pass_rate: totalAttempts === 0 ? 0 : passedAttempts / totalAttempts,
          },
        ];
      },
    ),
  );
  const scenarioEntries = Object.values(scenarios);
  const passedScenarios = scenarioEntries.filter(
    (scenario) => scenario.pass_rate > 0.5,
  ).length;

  return {
    attempts_per_scenario:
      scenarioEntries.reduce(
        (max, scenario) => Math.max(max, scenario.total_attempts),
        1,
      ) || 1,
    overall_pass_rate:
      scenarioEntries.length === 0
        ? 0
        : passedScenarios / scenarioEntries.length,
    scenarios,
  };
}

function didEvaluatorAttemptPass(records: EvaluatorStepRecord[]): boolean {
  const sorted = [...records].sort((left, right) => left.step - right.step);
  const lastRecord = sorted.at(-1);

  if (lastRecord === undefined) {
    return false;
  }

  return (
    lastRecord.action.type === "done" && lastRecord.console_errors.length === 0
  );
}

function earliestTimestamp(values: string[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce<number | null>((earliest, value) => {
    const timestamp = Date.parse(value);

    if (Number.isNaN(timestamp)) {
      return earliest;
    }

    return earliest === null ? timestamp : Math.min(earliest, timestamp);
  }, null);
}

function earliestPassingScenarioTimestamp(
  records: EvaluatorStepRecord[],
): number | null {
  const attempts = groupBy(
    records,
    (record) => `${record.scenario}:${record.attempt}`,
  );
  const passingTimes = Array.from(attempts.values())
    .filter((attemptRecords) => didEvaluatorAttemptPass(attemptRecords))
    .map((attemptRecords) =>
      earliestTimestamp(attemptRecords.map((record) => record.ts)),
    )
    .filter((timestamp): timestamp is number => timestamp !== null);

  return passingTimes.length === 0 ? null : Math.min(...passingTimes);
}

function inferArtifactMetadata(
  artifactDir: string,
  repoRoot: string,
): {
  topologySlug: string;
} {
  const relativePath = path.relative(repoRoot, artifactDir).split(path.sep);
  const topologySlug = relativePath.at(-1) ?? "unknown";

  if (topologySlug.length === 0 || topologySlug === "docs") {
    throw new Error("artifactDir must point to docs/<topology>");
  }

  return { topologySlug };
}

async function readExistingMetaSeed(
  artifactDir: string,
): Promise<number | undefined> {
  const metaPath = path.join(artifactDir, "meta.json");
  if (!(await pathExists(metaPath))) return undefined;
  try {
    const content = await readFile(metaPath, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "seed" in parsed &&
      typeof (parsed as { seed: unknown }).seed === "number"
    ) {
      return (parsed as { seed: number }).seed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function toDisplayName(slug: string): string {
  return slug.length === 0 ? slug : `${slug[0]?.toUpperCase()}${slug.slice(1)}`;
}

async function loadTopologyConfigForSlug(
  topologySlug: string,
  repoRoot: string,
): Promise<TopologyConfig | null> {
  const topologyModulePath = path.join(
    repoRoot,
    "configs",
    "topologies",
    `${topologySlug}.ts`,
  );

  if (!(await pathExists(topologyModulePath))) {
    return null;
  }

  const topologyModule = (await import(
    pathToFileURL(topologyModulePath).href
  )) as {
    default?: unknown;
    topology?: unknown;
    [key: string]: unknown;
  };
  const exportedTopology =
    topologyModule[topologySlug] ??
    topologyModule.topology ??
    topologyModule.default;

  if (exportedTopology === undefined) {
    throw new Error(
      `Topology module configs/topologies/${topologySlug}.ts must export a topology config`,
    );
  }

  return validateTopology(exportedTopology);
}

function inferLeaderId(records: NodeTurnRecord[]): string {
  const nodeIds = Array.from(
    new Set(records.map((record) => record.node_id)),
  ).sort();

  return nodeIds.includes("leader") ? "leader" : (nodeIds[0] ?? "leader");
}

function countNodeIds(records: NodeTurnRecord[]): number {
  return Math.max(1, new Set(records.map((record) => record.node_id)).size);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function groupBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const key = getKey(value);
    const group = groups.get(key);

    if (group) {
      group.push(value);
      continue;
    }

    groups.set(key, [value]);
  }

  return groups;
}

async function collectFileEntries(
  directory: string,
  rootDir: string,
): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ absolutePath: string; relativePath: string }> = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFileEntries(absolutePath, rootDir)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      absolutePath,
      relativePath: path.relative(rootDir, absolutePath),
    });
  }

  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function validateRunConfig(value: unknown): RunConfig {
  if (!isRecord(value)) {
    throw new Error("Invalid run config: expected an object");
  }

  const topology = validateTopology(value.topology);
  const seed = validatePositiveInteger(value.seed, "seed");
  const maxRounds = validatePositiveInteger(value.maxRounds, "maxRounds");
  const perRoundTimeoutMs = validatePositiveInteger(
    value.perRoundTimeoutMs,
    "perRoundTimeoutMs",
  );
  const brief = validateNonEmptyString(value.brief, "brief");
  const models = validateModels(value.models);
  const runBudget = validateRunBudget(value.runBudget);

  return {
    topology,
    seed,
    maxRounds,
    perRoundTimeoutMs,
    brief,
    models,
    runBudget,
  };
}

function validateTopology(value: unknown): TopologyConfig {
  if (!isRecord(value)) {
    throw new Error("Invalid run config: topology must be an object");
  }

  const slug = validateNonEmptyString(value.slug, "topology.slug");
  const name = validateNonEmptyString(value.name, "topology.name");
  const leader = validateNonEmptyString(value.leader, "topology.leader");
  const nodes = validateStringArray(value.nodes, "topology.nodes");
  const edges = validateTopologyEdges(value.edges, nodes);
  const developers = validateNodeSubset(
    value.developers,
    "topology.developers",
    nodes,
  );
  const integrators = validateNodeSubset(
    value.integrators,
    "topology.integrators",
    nodes,
  );

  if (!nodes.includes(leader)) {
    throw new Error(
      "Invalid run config: topology.leader must appear in topology.nodes",
    );
  }

  const topology: TopologyConfig = {
    slug,
    name,
    nodes,
    edges,
    leader,
    developers,
    integrators,
    culture: validateCulture(value.culture),
  };

  validateIntegratorReachability(topology);

  return topology;
}

function validateNodeSubset(
  value: unknown,
  fieldName: string,
  nodes: string[],
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid run config: ${fieldName} must be an array`);
  }
  const subset = value.map((entry) => validateNonEmptyString(entry, fieldName));
  for (const entry of subset) {
    if (!nodes.includes(entry)) {
      throw new Error(
        `Invalid run config: ${fieldName} entry "${entry}" must reference a node in topology.nodes`,
      );
    }
  }
  return subset;
}

function validateIntegratorReachability(topology: TopologyConfig): void {
  if (topology.integrators.length === 0) {
    if (topology.nodes.length !== 1) {
      throw new Error(
        `Invalid run config: topology.integrators may only be empty for a single-node (solo) topology, but topology.nodes has ${topology.nodes.length} entries.`,
      );
    }
    return;
  }

  const integratorSet = new Set(topology.integrators);

  for (const developer of topology.developers) {
    if (integratorSet.has(developer)) {
      continue;
    }

    const neighbors = listNeighbors(topology, developer);
    const hasIntegratorNeighbor = neighbors.some((n) => integratorSet.has(n));

    if (!hasIntegratorNeighbor) {
      throw new Error(
        `Invalid run config: developer "${developer}" has no integrator neighbor (every developer must connect to at least one integrator). Neighbors: ${neighbors.length === 0 ? "none" : neighbors.join(", ")}.`,
      );
    }
  }
}

function validateTopologyEdges(
  value: unknown,
  nodes: string[],
): TopologyEdge[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid run config: topology.edges must be an array");
  }

  return value.map((edge, index) => {
    if (!isRecord(edge)) {
      throw new Error(
        `Invalid run config: topology.edges[${index}] must be an object`,
      );
    }

    const from = validateNonEmptyString(
      edge.from,
      `topology.edges[${index}].from`,
    );
    const to = validateNonEmptyString(edge.to, `topology.edges[${index}].to`);

    if (!nodes.includes(from)) {
      throw new Error(
        `Invalid run config: topology.edges[${index}].from must reference a node in topology.nodes`,
      );
    }

    if (!nodes.includes(to)) {
      throw new Error(
        `Invalid run config: topology.edges[${index}].to must reference a node in topology.nodes`,
      );
    }

    if (from === to) {
      throw new Error(
        `Invalid run config: topology.edges[${index}] cannot be self-referential`,
      );
    }

    return {
      from,
      to,
      bidir: edge.bidir === true ? true : undefined,
    };
  });
}

function validateCulture(value: unknown): Culture | null {
  if (value == null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid run config: topology.culture must be an object");
  }

  const kind = validateEnum(value.kind, "topology.culture.kind", [
    "apple-taste",
    "amazon-writing",
    "microsoft-competition",
    "google-design-docs",
    "facebook-velocity",
    "oracle-process",
    "solo-builder",
  ]);

  if (kind === "apple-taste") {
    return {
      kind,
      leaderPrompt: validateNonEmptyString(
        value.leaderPrompt,
        "topology.culture.leaderPrompt",
      ),
      workerPrompt: validateNonEmptyString(
        value.workerPrompt,
        "topology.culture.workerPrompt",
      ),
    };
  }

  if (kind === "amazon-writing") {
    return {
      kind,
      leaderPrompt: validateNonEmptyString(
        value.leaderPrompt,
        "topology.culture.leaderPrompt",
      ),
      subleadPrompt: validateNonEmptyString(
        value.subleadPrompt,
        "topology.culture.subleadPrompt",
      ),
      workerPrompt: validateNonEmptyString(
        value.workerPrompt,
        "topology.culture.workerPrompt",
      ),
    };
  }

  if (kind === "microsoft-competition") {
    return {
      kind,
      charters: validateStringRecord(
        value.charters,
        "topology.culture.charters",
      ),
      contested: validateStringArray(
        value.contested,
        "topology.culture.contested",
      ),
      leaderPrompt: validateNonEmptyString(
        value.leaderPrompt,
        "topology.culture.leaderPrompt",
      ),
      divisionHeadPrompt: validateNonEmptyString(
        value.divisionHeadPrompt,
        "topology.culture.divisionHeadPrompt",
      ),
      divisionWorkerPrompt: validateNonEmptyString(
        value.divisionWorkerPrompt,
        "topology.culture.divisionWorkerPrompt",
      ),
    };
  }

  if (kind === "google-design-docs") {
    return {
      kind,
      leaderPrompt: validateNonEmptyString(
        value.leaderPrompt,
        "topology.culture.leaderPrompt",
      ),
      middlePrompt: validateNonEmptyString(
        value.middlePrompt,
        "topology.culture.middlePrompt",
      ),
      workerPrompt: validateNonEmptyString(
        value.workerPrompt,
        "topology.culture.workerPrompt",
      ),
    };
  }

  if (kind === "facebook-velocity") {
    return {
      kind,
      leaderPrompt: validateNonEmptyString(
        value.leaderPrompt,
        "topology.culture.leaderPrompt",
      ),
      workerPrompt: validateNonEmptyString(
        value.workerPrompt,
        "topology.culture.workerPrompt",
      ),
    };
  }

  if (kind === "oracle-process") {
    return {
      kind,
      reviewNodeId: validateNonEmptyString(
        value.reviewNodeId,
        "topology.culture.reviewNodeId",
      ),
      leaderPrompt: validateNonEmptyString(
        value.leaderPrompt,
        "topology.culture.leaderPrompt",
      ),
      reviewPrompt: validateNonEmptyString(
        value.reviewPrompt,
        "topology.culture.reviewPrompt",
      ),
      legalStaffPrompt: validateNonEmptyString(
        value.legalStaffPrompt,
        "topology.culture.legalStaffPrompt",
      ),
      engineeringPrompt: validateNonEmptyString(
        value.engineeringPrompt,
        "topology.culture.engineeringPrompt",
      ),
    };
  }

  return {
    kind,
    prompt: validateNonEmptyString(value.prompt, "topology.culture.prompt"),
  };
}

function validateModels(value: unknown): BenchmarkModels {
  if (!isRecord(value)) {
    throw new Error("Invalid run config: models must be an object");
  }

  return {
    node: validateModelProfile(value.node, "models.node"),
    judge: validateModelProfile(value.judge, "models.judge"),
    analyst: validateModelProfile(value.analyst, "models.analyst"),
    player: validateModelProfile(value.player, "models.player"),
  };
}

function validateModelProfile(value: unknown, field: string): ModelProfile {
  if (!isRecord(value)) {
    throw new Error(`Invalid run config: ${field} must be an object`);
  }

  const thinking = validateEnum(value.thinking, field + ".thinking", [
    "standard",
    "extended",
  ]);
  const outputMode = validateEnum(value.outputMode, field + ".outputMode", [
    "text",
    "json",
  ]);

  return {
    model: validateNonEmptyString(value.model, field + ".model"),
    tools: validateBoolean(value.tools, field + ".tools"),
    thinking,
    outputMode,
    maxTurns: validatePositiveInteger(value.maxTurns, field + ".maxTurns"),
  };
}

function validateRunBudget(value: unknown): RunBudget {
  if (!isRecord(value)) {
    throw new Error("Invalid run config: runBudget must be an object");
  }

  return {
    tokens: validatePositiveInteger(value.tokens, "runBudget.tokens"),
    wallClockMs: validatePositiveInteger(
      value.wallClockMs,
      "runBudget.wallClockMs",
    ),
  };
}

function validateRunBudgetTotals(value: unknown): RunBudgetTotals {
  if (!isRecord(value)) {
    throw new Error("Invalid run budget totals: expected an object");
  }

  return {
    tokens: validateNonNegativeInteger(value.tokens, "totals.tokens"),
    wallClockMs: validateNonNegativeInteger(
      value.wallClockMs,
      "totals.wallClockMs",
    ),
  };
}

function validateStringRecord(
  value: unknown,
  field: string,
): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`Invalid run config: ${field} must be an object`);
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    throw new Error(`Invalid run config: ${field} must not be empty`);
  }

  return Object.fromEntries(
    entries.map(([key, entryValue]) => [
      key,
      validateNonEmptyString(entryValue, `${field}.${key}`),
    ]),
  );
}

function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `Invalid run config: ${field} must be a non-empty string array`,
    );
  }

  return value.map((entry) => validateNonEmptyString(entry, field));
}

function validatePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid run config: ${field} must be a positive integer`);
  }

  return value;
}

function validateNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return value;
}

function validateNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid run config: ${field} must be a non-empty string`);
  }

  return value;
}

function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid run config: ${field} must be a boolean`);
  }

  return value;
}

function validateEnum<T extends string>(
  value: unknown,
  field: string,
  allowedValues: readonly T[],
): T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new Error(
      `Invalid run config: ${field} must be one of ${allowedValues.join(", ")}`,
    );
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function runGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function runCommand({
  command,
  args,
  cwd,
  signal,
}: {
  command: string;
  args: string[];
  cwd?: string;
  signal?: AbortSignal;
}): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      signal,
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      message?: string;
    };

    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : Number.NaN,
    };
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted/i.test(error.message))
  );
}

function buildSoloPrompt({
  round,
  maxRounds,
  brief,
}: {
  round: number;
  maxRounds: number;
  brief: string;
}): string {
  const commonContext = buildNodeCommonContext({
    runId: "solo",
    topology: {
      slug: "solo",
      name: "Solo",
      nodes: ["leader"],
      edges: [],
      leader: "leader",
      developers: ["leader"],
      integrators: [],
      culture: null,
    },
    nodeId: "leader",
  });

  return [
    "You are the leader and only node for this run.",
    commonContext,
    "Integration authority: leader submits the final artifact",
    "Reply with only valid JSON.",
    "Do not wrap the JSON in markdown fences.",
    'Return exactly this shape: {"messages":[{"to":"leader","tag":"status","content":"..."}],"summary":"..."}. Use an empty messages array when there is nothing to send.',
    "You are already operating inside the run worktree for this benchmark. Do all file edits, builds, and checks inside the current working directory and do not modify the benchmark repo outside this worktree.",
    `You have ${maxRounds} rounds total to ship this artifact; plan the scope so the deliverable is complete by round ${maxRounds}.`,
    "Full brief:",
    brief,
    `Round ${round} of ${maxRounds} instruction: inspect the workspace, decide the most useful next step, and continue building toward the brief. Treat this round as exactly one incremental unit of work. Make at most one cohesive code or verification change, then stop and reply immediately with the required JSON. If the current working directory contains a deployable artifact that is ready for evaluation, send a self-addressed message whose content explicitly declares final submission.`,
  ].join("\n\n");
}

function buildTopologyNodePrompt({
  runId,
  round,
  maxRounds,
  nodeId,
  topology,
  brief,
  inboxMessages,
}: {
  runId: string;
  round: number;
  maxRounds: number;
  nodeId: string;
  topology: TopologyConfig;
  brief: string;
  inboxMessages: Array<typeof MessageEnvelope._type>;
}): string {
  const commonContext = buildNodeCommonContext({
    runId,
    topology,
    nodeId,
  });
  const inboxSection =
    inboxMessages.length === 0
      ? "No new inbox messages this round."
      : inboxMessages
          .map(
            (message, index) =>
              `${index + 1}. From ${message.from}${message.tag ? ` [${message.tag}]` : ""}: ${message.content}`,
          )
          .join("\n");
  const leaderBudgetLine = `You have ${maxRounds} rounds total to ship this project; plan the scope so the deliverable is complete by round ${maxRounds}.`;
  const leaderInstructions =
    nodeId === topology.leader
      ? [leaderBudgetLine, "Leader-only brief:", brief]
      : [
          "You do not receive the full brief directly. Work only from the common context plus inbox messages from your neighbors.",
        ];
  const roundInstruction =
    nodeId === topology.leader && round === 1
      ? `Round 1 of ${maxRounds} instruction: inspect your worktree and inbox only as much as needed to orient yourself. As leader in round 1, you must personally land an initial minimal shared scaffold (an \`index.html\` entry file hosting a \`<canvas>\` element, a small vanilla JavaScript module that initializes a WebGL context and runs a \`requestAnimationFrame\` loop, and an \`assets/\` directory placeholder) onto \`run/${runId}/main\` this round by committing scaffold files in your own worktree, pushing your branch, opening a PR against \`run/${runId}/main\`, and merging that PR yourself using your leader merge authority. No \`package.json\`, no bundler, no framework - plain HTML/CSS/JS that plays when the entry HTML is opened from a local \`file://\` URL. This unblocks every worker's round 2. In the same round, decompose the remaining brief into concrete delegated tasks and send them to your neighbors so they can start building on the scaffold in round 2. If you perform PR activity this round, summarize it in at least one outbound message with the PR URL and one-line reason. Only the leader should declare final submission, and only when the shared artifact is ready for evaluation.`
      : `Round ${round} of ${maxRounds} instruction: inspect your worktree and inbox, choose the smallest useful next step for your role, and complete exactly one cohesive unit of work before replying. If an inbox message already gives you a concrete delegated task, execute that task directly instead of spending the round on extra workspace inspection. If the delegated task depends on newer shared scaffold that is missing from your branch, first sync the latest \`run/${runId}/main\` into your worktree before continuing. When you finish a cohesive unit of work in this round, push your branch and open a PR against \`run/${runId}/main\` so an integrator can merge it - do not wait for an explicit ask; do not describe the work in a message and hope the leader commits it for you. If you are an integrator, you may also review and merge peer PRs targeting areas you own. If you perform PR activity this round, summarize it in at least one outbound message with the PR URL and one-line reason. Only the leader should declare final submission, and only when the shared artifact is ready for evaluation.`;

  return [
    `You are node ${nodeId} for run ${runId}.`,
    commonContext,
    "Reply with only valid JSON.",
    "Do not wrap the JSON in markdown fences.",
    'Return exactly this shape: {"messages":[{"to":"<neighbor>","tag":"status","content":"..."}],"summary":"..."}. Use an empty messages array when there is nothing to send.',
    "Use only neighbors listed in the common context as message recipients.",
    "You are already operating inside your assigned run worktree. Do all file edits, builds, and checks inside the current working directory and do not modify other worktrees or the benchmark repo outside this worktree.",
    "New inbox messages for this round:",
    inboxSection,
    ...leaderInstructions,
    roundInstruction,
  ].join("\n\n");
}

export async function selectActiveNodesForRound({
  runDir,
  round,
  nodes,
  leader,
}: {
  runDir: string;
  round: number;
  nodes: string[];
  leader: string;
}): Promise<string[]> {
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedLeader = validateNonEmptyString(leader, "leader");
  const validatedNodes = validateStringArray(nodes, "nodes");

  if (!validatedNodes.includes(validatedLeader)) {
    throw new Error(
      `leader ${validatedLeader} is not listed in nodes [${validatedNodes.join(", ")}]`,
    );
  }

  if (validatedRound === 1) {
    return [validatedLeader];
  }

  const withMessages: string[] = [];
  for (const nodeId of validatedNodes) {
    const inboxPath = path.join(validatedRunDir, "inbox", `${nodeId}.jsonl`);
    const raw = await readFile(inboxPath, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return "";
        }

        throw error;
      },
    );
    const hasMessage = raw
      .split("\n")
      .some((line) => line.trim().length > 0);

    if (hasMessage) {
      withMessages.push(nodeId);
    }
  }

  // If nobody received a message the round before, keep the run moving by
  // waking the leader. Otherwise the loop would burn rounds with zero active
  // nodes while still ticking the timeout budget.
  return withMessages.length > 0 ? withMessages : [validatedLeader];
}

async function drainNodeInboxMessages({
  runDir,
  nodeId,
}: {
  runDir: string;
  nodeId: string;
}): Promise<Array<typeof MessageEnvelope._type>> {
  const inboxPath = path.join(runDir, "inbox", `${nodeId}.jsonl`);
  const raw = await readFile(inboxPath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }

      throw error;
    },
  );
  const messages = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => MessageEnvelope.parse(JSON.parse(line)));

  await writeFile(inboxPath, "", "utf8");

  return messages;
}

function describeNodeRole(topology: TopologyConfig, nodeId: string): string {
  if (nodeId === topology.leader) {
    return "leader";
  }

  const culture = topology.culture;

  if (!culture) {
    return "worker";
  }

  switch (culture.kind) {
    case "apple-taste":
    case "facebook-velocity":
      return "worker";

    case "amazon-writing": {
      const leaderNeighbors = listNeighbors(topology, topology.leader);
      return leaderNeighbors.includes(nodeId) ? "sub-lead" : "worker";
    }

    case "google-design-docs": {
      const leaderNeighbors = listNeighbors(topology, topology.leader);
      return leaderNeighbors.includes(nodeId) ? "middle-integrator" : "worker";
    }

    case "microsoft-competition": {
      if (Object.hasOwn(culture.charters, nodeId)) {
        return "division-head";
      }
      const head = findMicrosoftDivisionHead(topology, nodeId);
      return head === null ? "worker" : "division-worker";
    }

    case "oracle-process": {
      if (nodeId === culture.reviewNodeId) {
        return "review";
      }
      const legalSubtree = oracleLegalSubtree(topology, culture.reviewNodeId);
      return legalSubtree.has(nodeId) ? "legal-staff" : "engineering";
    }

    case "solo-builder":
      return "leader";
  }
}

function listNeighbors(topology: TopologyConfig, nodeId: string): string[] {
  const neighbors = new Set<string>();

  for (const edge of topology.edges) {
    if (edge.from === nodeId) {
      neighbors.add(edge.to);
    }

    if (edge.bidir === true && edge.to === nodeId) {
      neighbors.add(edge.from);
    }
  }

  return Array.from(neighbors).sort();
}

function listExpandedAdjacency(topology: TopologyConfig): string[] {
  const adjacency = new Set<string>();

  for (const edge of topology.edges) {
    adjacency.add(`${edge.from} -> ${edge.to}`);

    if (edge.bidir === true) {
      adjacency.add(`${edge.to} -> ${edge.from}`);
    }
  }

  return Array.from(adjacency).sort();
}

function isSubmissionDeclaration(content: string): boolean {
  const normalized = content.trim().toLowerCase();

  if (normalized.length === 0) {
    return false;
  }

  if (
    normalized.includes("no final submission") ||
    normalized.includes("not a final submission") ||
    normalized.includes("submission has not happened") ||
    normalized.includes("submission hasn't happened") ||
    normalized.includes("submission yet")
  ) {
    return false;
  }

  return (
    normalized.includes("submission") &&
    (normalized.includes("declare") || normalized.includes("final"))
  );
}

function resolveMainBranchIntegrators(topology: TopologyConfig): string[] {
  return [...topology.integrators];
}

function resolveCulturePrompt(
  topology: TopologyConfig,
  nodeId: string,
): string {
  const culture = topology.culture;

  if (culture === null || culture === undefined) {
    return "none";
  }

  switch (culture.kind) {
    case "apple-taste": {
      const body =
        nodeId === topology.leader
          ? culture.leaderPrompt
          : culture.workerPrompt;
      return `Apple culture - taste bar + secrecy. ${body}`;
    }

    case "amazon-writing": {
      if (nodeId === topology.leader) {
        return `Amazon culture - PR/FAQ writing + customer obsession + frugality. ${culture.leaderPrompt}`;
      }
      const leaderNeighbors = listNeighbors(topology, topology.leader);
      const body = leaderNeighbors.includes(nodeId)
        ? culture.subleadPrompt
        : culture.workerPrompt;
      return `Amazon culture - PR/FAQ writing + customer obsession + frugality. ${body}`;
    }

    case "microsoft-competition": {
      const contested = culture.contested.join(", ");
      if (nodeId === topology.leader) {
        const leaderView = Object.entries(culture.charters)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([divisionId, charter]) => `${divisionId}: ${charter}`)
          .join("; ");
        return `Microsoft culture - competing divisions. Division charters: ${leaderView}. Contested surfaces: ${contested}. ${culture.leaderPrompt}`;
      }

      if (Object.hasOwn(culture.charters, nodeId)) {
        return `Microsoft culture - competing divisions. Your charter: ${culture.charters[nodeId]}. Contested surfaces: ${contested}. ${culture.divisionHeadPrompt}`;
      }

      const head = findMicrosoftDivisionHead(topology, nodeId);

      if (head !== null) {
        return `Microsoft culture - competing divisions. Your division charter (head ${head}): ${culture.charters[head]}. Contested surfaces: ${contested}. ${culture.divisionWorkerPrompt}`;
      }

      return `Microsoft culture - competing divisions. Contested surfaces: ${contested}. ${culture.divisionWorkerPrompt}`;
    }

    case "google-design-docs": {
      if (nodeId === topology.leader) {
        return `Google culture - design docs + data-driven consensus. ${culture.leaderPrompt}`;
      }
      const leaderNeighbors = listNeighbors(topology, topology.leader);
      const body = leaderNeighbors.includes(nodeId)
        ? culture.middlePrompt
        : culture.workerPrompt;
      return `Google culture - design docs + data-driven consensus. ${body}`;
    }

    case "facebook-velocity": {
      const body =
        nodeId === topology.leader
          ? culture.leaderPrompt
          : culture.workerPrompt;
      return `Facebook culture - move fast. ${body}`;
    }

    case "oracle-process": {
      if (nodeId === topology.leader) {
        return `Oracle culture - process-first / legal dominant. ${culture.leaderPrompt}`;
      }
      if (nodeId === culture.reviewNodeId) {
        return `Oracle culture - process-first / legal dominant. ${culture.reviewPrompt}`;
      }
      const legalSubtree = oracleLegalSubtree(topology, culture.reviewNodeId);
      const body = legalSubtree.has(nodeId)
        ? culture.legalStaffPrompt
        : culture.engineeringPrompt;
      return `Oracle culture - process-first / legal dominant. ${body}`;
    }

    case "solo-builder":
      return `Solo - lone builder. ${culture.prompt}`;
  }
}

function buildUndirectedAdjacency(
  topology: TopologyConfig,
): Map<string, Set<string>> {
  const undirectedNeighbors = new Map<string, Set<string>>();

  for (const node of topology.nodes) {
    undirectedNeighbors.set(node, new Set<string>());
  }

  for (const edge of topology.edges) {
    undirectedNeighbors.get(edge.from)?.add(edge.to);
    undirectedNeighbors.get(edge.to)?.add(edge.from);
  }

  return undirectedNeighbors;
}

function findMicrosoftDivisionHead(
  topology: TopologyConfig,
  nodeId: string,
): string | null {
  if (topology.culture?.kind !== "microsoft-competition") {
    return null;
  }

  const divisionHeads = Object.keys(topology.culture.charters);
  const undirectedNeighbors = buildUndirectedAdjacency(topology);

  for (const divisionHead of divisionHeads) {
    const queue = [divisionHead];
    const seen = new Set<string>([topology.leader, divisionHead]);

    while (queue.length > 0) {
      const current = queue.shift();

      if (current === undefined) {
        continue;
      }

      for (const neighbor of undirectedNeighbors.get(current) ?? []) {
        if (seen.has(neighbor) || divisionHeads.includes(neighbor)) {
          continue;
        }

        if (neighbor === nodeId) {
          return divisionHead;
        }

        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return null;
}

function oracleLegalSubtree(
  topology: TopologyConfig,
  reviewNodeId: string,
): Set<string> {
  const undirectedNeighbors = buildUndirectedAdjacency(topology);
  const visited = new Set<string>();
  const queue = [reviewNodeId];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined) {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const neighbor of undirectedNeighbors.get(current) ?? []) {
      if (neighbor === topology.leader) {
        continue;
      }
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

function isGhPrMergeToolCall(command: string): boolean {
  return /(^|\s)gh\s+pr\s+merge(\s|$)/i.test(command);
}

function parseOpenCodeResponse(stdout: string): {
  finalText: string;
  toolCalls: NodeToolCall[];
  tokens: { in: number; out: number };
} {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const textEvents: string[] = [];
  let finalText: string | undefined;
  const toolCalls: NodeToolCall[] = [];
  let tokens = { in: 0, out: 0 };

  for (const line of lines) {
    const event = JSON.parse(line) as {
      type?: string;
      part?: {
        type?: string;
        text?: string;
        tool?: string;
        input?: string;
        status?: string;
        duration_ms?: number;
        tokens?: {
          input?: number;
          output?: number;
        };
        metadata?: { openai?: { phase?: string } };
      };
      error?: { message?: string };
    };

    if (event.type === "error") {
      throw new Error(
        event.error?.message ?? "OpenCode returned an error event",
      );
    }

    if (event.type === "tool_call") {
      const tool = optionalString(event.part?.tool);
      const input = optionalString(event.part?.input);

      if (tool && input) {
        toolCalls.push({
          tool,
          input,
          status: event.part?.status === "error" ? "error" : "success",
          duration_ms:
            typeof event.part?.duration_ms === "number" &&
            Number.isInteger(event.part.duration_ms) &&
            event.part.duration_ms >= 0
              ? event.part.duration_ms
              : undefined,
        });
      }

      continue;
    }

    if (event.type === "step_finish") {
      tokens = {
        in: event.part?.tokens?.input ?? 0,
        out: event.part?.tokens?.output ?? 0,
      };
      continue;
    }

    if (
      event.type === "text" &&
      event.part?.type === "text" &&
      event.part.text !== undefined
    ) {
      if (event.part.metadata?.openai?.phase === "final_answer") {
        finalText = event.part.text;
        continue;
      }

      textEvents.push(event.part.text);
    }
  }

  const resolvedFinalText = finalText ?? textEvents.at(-1);

  if (resolvedFinalText === undefined) {
    throw new Error("OpenCode did not emit a final text response");
  }

  return {
    finalText: resolvedFinalText,
    toolCalls,
    tokens,
  };
}

function parseSoloNodeRoundOutput(text: string): SoloNodeRoundOutput {
  const parsed = JSON.parse(text) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Solo node output must be an object");
  }

  const messages = Array.isArray(parsed.messages)
    ? parsed.messages.map((message) => validateNodeOutboundMessage(message))
    : [];
  const summary =
    parsed.summary === undefined
      ? undefined
      : validateNonEmptyString(parsed.summary, "summary");

  return {
    messages,
    summary,
  };
}

function soloNodeRoundOutputJsonSchema(): JsonSchemaFormat {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            to: { type: "string" },
            tag: {
              type: "string",
              enum: [
                "decompose",
                "ask",
                "answer",
                "deliver",
                "status",
                "review",
              ],
            },
            content: { type: "string" },
          },
          required: ["to", "content"],
        },
      },
      summary: { type: "string" },
    },
    required: ["messages"],
  };
}

function parsePrList(stdout: string): GhPrListEntry[] {
  const parsed = JSON.parse(stdout) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("gh pr list output must be an array");
  }

  return parsed.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("gh pr list entries must be objects");
    }

    return {
      number: validatePositiveInteger(entry.number, "pr.number"),
    };
  });
}

function parsePrView(stdout: string): GhPrView {
  const parsed = JSON.parse(stdout) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("gh pr view output must be an object");
  }

  return {
    number: validatePositiveInteger(parsed.number, "pr.number"),
    url: validateNonEmptyString(parsed.url, "pr.url"),
    author: isRecord(parsed.author)
      ? { login: optionalString(parsed.author.login) }
      : null,
    title: validateNonEmptyString(parsed.title, "pr.title"),
    body: typeof parsed.body === "string" ? parsed.body : "",
    reviewRequests: Array.isArray(parsed.reviewRequests)
      ? parsed.reviewRequests.map((request) => ({
          requestedReviewer:
            isRecord(request) && isRecord(request.requestedReviewer)
              ? { login: optionalString(request.requestedReviewer.login) }
              : null,
        }))
      : [],
    reviews: Array.isArray(parsed.reviews)
      ? parsed.reviews.map((review) => ({
          author:
            isRecord(review) && isRecord(review.author)
              ? { login: optionalString(review.author.login) }
              : null,
          body:
            isRecord(review) && typeof review.body === "string"
              ? review.body
              : "",
          state: isRecord(review) ? optionalString(review.state) : undefined,
          submittedAt: isRecord(review)
            ? optionalString(review.submittedAt)
            : undefined,
        }))
      : [],
    mergedAt: optionalString(parsed.mergedAt),
    closedAt: optionalString(parsed.closedAt),
    createdAt: validateNonEmptyString(parsed.createdAt, "pr.createdAt"),
    comments: Array.isArray(parsed.comments)
      ? parsed.comments.map((comment) => ({
          author:
            isRecord(comment) && isRecord(comment.author)
              ? { login: optionalString(comment.author.login) }
              : null,
          body:
            isRecord(comment) && typeof comment.body === "string"
              ? comment.body
              : "",
          createdAt:
            isRecord(comment) && typeof comment.createdAt === "string"
              ? comment.createdAt
              : "",
        }))
      : [],
  };
}

function mapPullRequestSnapshot(
  runId: string,
  pullRequest: GhPrView,
): PRSnapshot {
  const comments = [
    ...pullRequest.reviews.flatMap((review) =>
      review.body.trim().length > 0 && review.submittedAt
        ? [
            {
              author: parseCommentIdentity(review.body, review.author?.login),
              body: review.body,
              ts: review.submittedAt,
            },
          ]
        : [],
    ),
    ...pullRequest.comments.map((comment) => ({
      author: parseCommentIdentity(comment.body, comment.author?.login),
      body: comment.body,
      ts: validateNonEmptyString(comment.createdAt, "comment.createdAt"),
    })),
  ].sort((left, right) => left.ts.localeCompare(right.ts));

  return {
    run_id: runId,
    pr_number: pullRequest.number,
    schema_version: SCHEMA_VERSION,
    url: pullRequest.url,
    author: parseAuthorIdentity(pullRequest.body, pullRequest.author?.login),
    title: pullRequest.title,
    body: pullRequest.body,
    reviewers: pullRequest.reviewRequests.map((request) => ({
      agent_name: request.requestedReviewer?.login ?? "unknown",
      node_id: "unknown",
    })),
    state_timeline: buildPrStateTimeline(pullRequest),
    comments,
  };
}

function parseAuthorIdentity(
  body: string,
  fallbackName?: string,
): AgentIdentity {
  const match = /Author:\s*([^\n(]+)\([^)]*node\s+([^\s)]+)\)/i.exec(body);

  if (match?.[1] && match[2]) {
    return {
      agent_name: match[1].trim(),
      node_id: match[2].trim(),
    };
  }

  return {
    agent_name: fallbackName ?? "unknown",
    node_id: "unknown",
  };
}

function parseCommentIdentity(
  body: string,
  fallbackName?: string,
): AgentIdentity {
  const match = /^\*\*([^\n(]+)\([^)]*\):\*\*/.exec(body.trim());

  if (match?.[1]) {
    return {
      agent_name: match[1].trim(),
      node_id: "unknown",
    };
  }

  return {
    agent_name: fallbackName ?? "unknown",
    node_id: "unknown",
  };
}

function buildPrStateTimeline(
  pullRequest: GhPrView,
): PRSnapshot["state_timeline"] {
  const timeline: PRSnapshot["state_timeline"] = [
    {
      state: "opened",
      ts: pullRequest.createdAt,
    },
  ];

  for (const review of pullRequest.reviews) {
    if (review.state === "APPROVED" && review.submittedAt) {
      timeline.push({ state: "approved", ts: review.submittedAt });
    }

    if (review.state === "CHANGES_REQUESTED" && review.submittedAt) {
      timeline.push({ state: "changes-requested", ts: review.submittedAt });
    }
  }

  if (pullRequest.mergedAt) {
    timeline.push({ state: "merged", ts: pullRequest.mergedAt });
  }

  if (pullRequest.closedAt) {
    timeline.push({ state: "closed", ts: pullRequest.closedAt });
  }

  return timeline;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validateNodeOutboundMessage(value: unknown): NodeOutboundMessage {
  if (!isRecord(value)) {
    throw new Error("Solo node output messages must be objects");
  }

  const tag =
    value.tag === undefined
      ? undefined
      : validateEnum(value.tag, "messages.tag", [
          "decompose",
          "ask",
          "answer",
          "deliver",
          "status",
          "review",
        ]);

  return {
    to: validateNonEmptyString(value.to, "messages.to"),
    tag,
    content: validateNonEmptyString(value.content, "messages.content"),
  };
}
