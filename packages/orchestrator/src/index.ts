import path from "node:path";
import { createHash } from "node:crypto";
import {
  appendFile,
  copyFile,
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
import { homedir, tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  ArtifactJudgeOutput,
  MessageEnvelope,
  MetaJson,
  NodeTurnRecord,
  OrchestratorEvent,
  PatchDecision,
  PRSnapshot,
  SCHEMA_VERSION,
  TrajectoryAnalysisOutput,
} from "@org-bench/schemas";

import { logEvent } from "./logger.js";
import { runTrajectoryAnalyst } from "@org-bench/analyst";
import { runArtifactJudge } from "@org-bench/judge";

import {
  assertOpenCodeProviderAvailable,
  createOpenCodeSession,
  deleteOpenCodeSession,
  sendOpenCodePromptStreamed,
  shutdownOpenCodeServe,
  startOpenCodeServe,
  type JsonSchemaFormat,
} from "./opencode-serve.js";

const execFileAsync = promisify(execFile);
const DEFAULT_ANALYST_MODEL = "openai/gpt-5.4";
const FINAL_SUBMISSION_TOKEN = "THIS_IS_MY_FINAL_SUBMISSION";

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
  summary: string;
};

export type AmazonWritingCulture = {
  kind: "amazon-writing";
  summary: string;
};

export type MicrosoftCompetitionCulture = {
  kind: "microsoft-competition";
  summary: string;
};

export type GoogleDesignDocsCulture = {
  kind: "google-design-docs";
  summary: string;
};

export type FacebookVelocityCulture = {
  kind: "facebook-velocity";
  summary: string;
};

export type OracleProcessCulture = {
  kind: "oracle-process";
  summary: string;
  reviewNodeId: string;
};

export type SoloBuilderCulture = {
  kind: "solo-builder";
  summary: string;
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
  nodeExpectations: Record<string, string>;
  culture?: Culture | null;
};

export type RunTopology = TopologyConfig;

export type RunBudget = {
  tokens: number;
  wallClockMs: number;
};

export type RunConfig = {
  suite?: string;
  topology: TopologyConfig;
  seed: number;
  maxRounds: number;
  perNodeTurnTimeoutMs: number;
  // Safety ceiling for a whole round. If a round exceeds this the run fails
  // loudly rather than silently waiting forever. Defaults to
  // perNodeTurnTimeoutMs + 30 minutes so healthy rounds never trip it.
  roundSafetyTimeoutMs?: number;
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
  validateNonEmptyString(runId, "runId");
  const validatedTopology = validateTopology(topology);
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");

  if (!validatedTopology.nodes.includes(validatedNodeId)) {
    throw new Error(`Unknown nodeId for topology: ${validatedNodeId}`);
  }

  const neighbors = listNeighbors(validatedTopology, validatedNodeId);
  const integrators = resolveMainBranchIntegrators(validatedTopology);
  const integratorSet = new Set(integrators);
  const integratorNeighbors = neighbors.filter((n) => integratorSet.has(n));

  const charterLines = validatedTopology.nodes.map((peerId) => {
    const marker =
      peerId === validatedTopology.leader
        ? peerId === validatedNodeId
          ? " (leader, you)"
          : " (leader)"
        : peerId === validatedNodeId
          ? " (you)"
          : "";
    const expectation = renderNodeExpectation(
      validatedTopology.nodeExpectations[peerId] ?? "",
      runId,
    );
    return `- **${peerId}**${marker}: ${expectation}`;
  });

  const teamSection = [
    `## Your team`,
    ``,
    `You are part of the **${validatedTopology.name}** team.`,
    ``,
    `Team charter (every member sees the same charter for every other member):`,
    charterLines.join("\n"),
    ``,
    `Leader: **${validatedTopology.leader}**.`,
    `Your direct neighbors (you can message them; they can message you): ${neighbors.length === 0 ? "none" : neighbors.map((n) => `**${n}**`).join(", ")}.`,
    `Integrators who can review and merge PRs: ${integrators.length === 0 ? "none (solo run)" : integrators.map((n) => `**${n}**`).join(", ")}.`,
    `Integrator neighbors you can ask to review: ${integratorNeighbors.length === 0 ? "none" : integratorNeighbors.map((n) => `**${n}**`).join(", ")}.`,
  ].join("\n");

  const cultureSection = validatedTopology.culture
    ? [`## Culture`, ``, validatedTopology.culture.summary].join("\n")
    : "";

  const toolsSection = [
    `## Tools: agent-browser`,
    ``,
    `You have an \`agent-browser\` CLI available via bash that drives a real browser. Use it to actually open and interact with HTML artifacts - for testing your own work, reviewing a peer's PR, or verifying end-to-end behavior after merges. Common commands:`,
    ``,
    `- \`agent-browser open <url>\` (file:// URLs work for local artifacts)`,
    `- \`agent-browser snapshot\` (dump a queryable DOM snapshot with uids)`,
    `- \`agent-browser click <uid>\` / \`fill <uid> <text>\` / \`type <text>\` / \`press <key>\``,
    `- \`agent-browser errors\` (read uncaught console errors)`,
    `- \`agent-browser screenshot <path>\``,
    ``,
    `Call them through bash, one at a time, reading output between calls. Because multiple nodes run per round, always set an isolated browser session so you don't collide with peers:`,
    ``,
    `\`AGENT_BROWSER_SESSION=${runId}-${validatedNodeId} agent-browser <command>\``,
  ].join("\n");

  return [teamSection, cultureSection, toolsSection]
    .filter((section) => section.length > 0)
    .join("\n\n");
}

function renderNodeExpectation(expectation: string, runId: string): string {
  const runBranchPrefix = `run/${runId}`;
  return expectation
    .replaceAll("{{runId}}", runId)
    .replaceAll("{{runBranchPrefix}}", runBranchPrefix)
    .replaceAll("{{mainBranch}}", `${runBranchPrefix}/main`)
    .replace(/\{\{nodeBranch:([^}\s]+)\}\}/g, (_match, nodeId: string) => {
      return `${runBranchPrefix}/${nodeId}`;
    });
}

function benchmarkRunLabelForSuite(suite: string | undefined): string {
  return suite === undefined ? "benchmark-run" : `benchmark-run-${suite}`;
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
  branchName: string;
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
  benchmarkRunLabel?: string;
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
  perNodeTurnTimeoutMs: number;
  execute: (signal: AbortSignal) => Promise<T>;
};

export type RunRoundParallelInput<T> = {
  runId: string;
  runDir: string;
  round: number;
  nodeIds: string[];
  perNodeTurnTimeoutMs: number;
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
      reason: "timeout" | "error";
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
  summary: string | undefined;
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
  runId: string;
  benchmarkRunLabel: string;
  runner?: CommandRunner;
};

export type EnsureBenchmarkRunLabelsInput = {
  runId: string;
  benchmarkRunLabel: string;
  runner?: CommandRunner;
};

export type PublishRunArtifactInput = {
  repoRoot: string;
  runId: string;
  topology: string;
  suite?: string;
  workspace: InitializedWorkspace;
  runner?: CommandRunner;
};

export type JudgePublishedArtifactInput = {
  artifactDir: string;
  runId: string;
  model: string;
  startOpenCodeServe?: typeof startOpenCodeServe;
  shutdownOpenCodeServe?: typeof shutdownOpenCodeServe;
  assertOpenCodeProviderAvailable?: typeof assertOpenCodeProviderAvailable;
  judge?: (input: {
    artifactDir: string;
    runId: string;
    model: string;
    agentBrowserSession: string;
    openCodeClient: {
      baseUrl: string;
      sessionId?: string;
      createSession?: typeof createOpenCodeSession;
      sendPrompt: OpenCodeStructuredPromptSender;
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
  assertOpenCodeProviderAvailable?: typeof assertOpenCodeProviderAvailable;
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
  benchmarkRunLabel: string;
  runner?: CommandRunner;
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
  assertOpenCodeProviderAvailable?: typeof assertOpenCodeProviderAvailable;
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
  ensureRunLabels?: (
    input: EnsureBenchmarkRunLabelsInput,
  ) => Promise<string[]>;
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
  benchmarkRunLabel?: string;
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
  assertOpenCodeProviderAvailable:
    verifyOpenCodeProviderAvailable = assertOpenCodeProviderAvailable,
  branchProtection,
  initWorkspace: initializeWorkspace = initWorkspace,
  initializeInboxes = initializeNodeInboxes,
  runRound = runSoloNodeRound,
  snapshotPullRequests = snapshotRunPullRequests,
  publishArtifact = publishRunArtifact,
  judgeArtifact = judgePublishedArtifact,
  analyzeTrajectory = runTrajectoryAnalysis,
  aggregateMeta = aggregateRunMeta,
  closeOpenPullRequests = closeOpenRunPullRequests,
  stripPriorTopologyLabels = stripBenchmarkRunLabelsForTopology,
  ensureRunLabels = ensureBenchmarkRunLabels,
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
  const benchmarkRunLabel = benchmarkRunLabelForSuite(
    executableRunConfig.suite,
  );
  await runPreflightClosePullRequests(validatedRunId, closeOpenPullRequests);
  await runPreflightStripPriorTopologyLabels(
    validatedRunId,
    benchmarkRunLabel,
    stripPriorTopologyLabels,
  );
  await runPreflightEnsureRunLabels(
    validatedRunId,
    benchmarkRunLabel,
    ensureRunLabels,
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

  const briefPath = path.join(workspace.runDir, "brief.md");
  await mkdir(workspace.runDir, { recursive: true });
  await writeFile(briefPath, executableRunConfig.brief, "utf8");

  const xdgDataHome = await prepareAutonomousOpencodeHome({
    runDir: workspace.runDir,
    model: executableRunConfig.models.node.model,
  });

  const createSession = openCodeClient?.createSession ?? createOpenCodeSession;
  const removeSession = openCodeClient?.deleteSession ?? deleteOpenCodeSession;
  const ownedServer = openCodeClient?.baseUrl
    ? null
    : await launchOpenCodeServe({
        cwd: workspace.mainWorktreeDir,
        pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
        env: {
          ...process.env,
          XDG_DATA_HOME: xdgDataHome,
          XDG_CONFIG_HOME: xdgDataHome,
          GH_CONFIG_DIR: resolveGhConfigDir(process.env),
        },
      });
  if (ownedServer) {
    await verifyOpenCodeProviderAvailable({
      baseUrl: ownedServer.baseUrl,
      model: executableRunConfig.models.node.model,
    });
  }
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
        perNodeTurnTimeoutMs: executableRunConfig.perNodeTurnTimeoutMs,
        execute: (abortSignal) =>
          runRound({
            runId: validatedRunId,
            round,
            workspace,
            runConfig: executableRunConfig,
            benchmarkRunLabel,
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
          summary: roundResult.output.output.summary,
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
      suite: executableRunConfig.suite,
      workspace,
    });
    const publishedIndexPath = path.join(artifactDir, "index.html");
    const hasDeployableArtifact = await pathExists(publishedIndexPath);

    if (hasDeployableArtifact) {
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

    await runFinalizeStage({
      artifactDir,
      runId: validatedRunId,
      round: Math.max(1, roundsExecuted),
      stage: "close_browser_sessions",
      run: () =>
        closeBrowserSessions({
          runId: validatedRunId,
          nodeIds: executableRunConfig.topology.nodes,
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
      benchmarkRunLabel,
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
  const benchmarkRunLabel = benchmarkRunLabelForSuite(
    executableRunConfig.suite,
  );
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
  const judgeArtifact = input.judgeArtifact ?? judgePublishedArtifact;
  const analyzeTrajectory = input.analyzeTrajectory ?? runTrajectoryAnalysis;
  const aggregateMeta = input.aggregateMeta ?? aggregateRunMeta;
  const closeOpenPullRequests =
    input.closeOpenPullRequests ?? closeOpenRunPullRequests;
  const stripPriorTopologyLabels =
    input.stripPriorTopologyLabels ?? stripBenchmarkRunLabelsForTopology;
  const ensureRunLabels = input.ensureRunLabels ?? ensureBenchmarkRunLabels;
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
    validatedRunId,
    benchmarkRunLabel,
    stripPriorTopologyLabels,
  );
  await runPreflightEnsureRunLabels(
    validatedRunId,
    benchmarkRunLabel,
    ensureRunLabels,
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

  const xdgDataHome = await prepareAutonomousOpencodeHome({
    runDir: workspace.runDir,
    model: executableRunConfig.models.node.model,
  });

  const ownedServer = input.openCodeClient?.baseUrl
    ? null
    : await (input.startOpenCodeServe ?? startOpenCodeServe)({
        cwd: workspace.mainWorktreeDir,
        pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
        env: {
          ...process.env,
          XDG_DATA_HOME: xdgDataHome,
          XDG_CONFIG_HOME: xdgDataHome,
          GH_CONFIG_DIR: resolveGhConfigDir(process.env),
        },
      });
  if (ownedServer) {
    await (input.assertOpenCodeProviderAvailable ??
      assertOpenCodeProviderAvailable)({
      baseUrl: ownedServer.baseUrl,
      model: executableRunConfig.models.node.model,
    });
  }

  await initializeInboxes({
    runDir: workspace.runDir,
    nodeIds: executableRunConfig.topology.nodes,
  });

  const briefPath = path.join(workspace.runDir, "brief.md");
  await mkdir(workspace.runDir, { recursive: true });
  await writeFile(briefPath, executableRunConfig.brief, "utf8");

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

    await stageOrchestratorKickoffMessage({
      runDir: workspace.runDir,
      runId: validatedRunId,
      leaderNodeId: executableRunConfig.topology.leader,
      maxRounds: executableRunConfig.maxRounds,
      briefPath,
      topologyName: executableRunConfig.topology.name,
    });
    await deliverMessages({
      runDir: workspace.runDir,
      round: 1,
    });

    for (let round = 1; round <= executableRunConfig.maxRounds; round += 1) {
      const roundStartedAtMs = Date.now();
      const activeNodeIds = await selectActiveNodesForRound({
        runDir: workspace.runDir,
        round,
        nodes: executableRunConfig.topology.nodes,
        leader: executableRunConfig.topology.leader,
      });
      logEvent("round_start", {
        runId: validatedRunId,
        round,
        activeNodes: activeNodeIds.join(","),
        activeCount: activeNodeIds.length,
      });
      const mainSyncSha = await syncMainWorktreeToRemote({
        mainWorktreeDir: workspace.mainWorktreeDir,
        remoteName: workspace.remoteName,
        mainBranch: `run/${validatedRunId}/main`,
      });
      logEvent("main_worktree_synced", {
        runId: validatedRunId,
        round,
        sha: mainSyncSha,
      });
      const roundResults = await raceRoundSafetyTimeout(
        runRoundParallel({
          runId: validatedRunId,
          runDir: workspace.runDir,
          round,
          nodeIds: activeNodeIds,
          perNodeTurnTimeoutMs: executableRunConfig.perNodeTurnTimeoutMs,
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
            benchmarkRunLabel,
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
        }),
        executableRunConfig.roundSafetyTimeoutMs ??
          executableRunConfig.perNodeTurnTimeoutMs + 30 * 60_000,
        round,
      );

      roundsExecuted = round;

      for (const nodeResult of roundResults) {
        if (!nodeResult.completed) {
          if (nodeResult.reason === "timeout") {
            await stageOrchestratorTimeoutMessage({
              runDir: workspace.runDir,
              runId: validatedRunId,
              round: round + 1,
              nodeId: nodeResult.nodeId,
              timeoutMs: executableRunConfig.perNodeTurnTimeoutMs,
            });
          }
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
            summary: nodeResult.output.output.summary,
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

      const deliveredCount = await deliverMessages({
        runDir: workspace.runDir,
        round: round + 1,
      });

      const completedCount = roundResults.filter((r) => r.completed).length;
      const timedOutCount = roundResults.filter(
        (r) => !r.completed && r.reason === "timeout",
      ).length;
      logEvent("round_end", {
        runId: validatedRunId,
        round,
        completed: completedCount,
        timedOut: timedOutCount,
        messagesDelivered: deliveredCount,
        durationMs: Date.now() - roundStartedAtMs,
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
      suite: executableRunConfig.suite,
      workspace,
    });
    const publishedIndexPath = path.join(artifactDir, "index.html");
    const hasDeployableArtifact = await pathExists(publishedIndexPath);

    if (hasDeployableArtifact) {
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

    await runFinalizeStage({
      artifactDir,
      runId: validatedRunId,
      round: Math.max(1, roundsExecuted),
      stage: "close_browser_sessions",
      run: () =>
        closeBrowserSessions({
          runId: validatedRunId,
          nodeIds: executableRunConfig.topology.nodes,
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
      benchmarkRunLabel,
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

// opencode serves the `question` tool by default, which is an interactive
// "ask the user" surface. There is no human in the loop here, so any model
// call that invokes it blocks the turn until the per-node timeout expires.
// Disable it (and any other interactive tools we find in the future) via a
// per-run opencode.json under XDG_CONFIG_HOME. We reuse the same .xdg dir we
// already set for XDG_DATA_HOME so the entire opencode state stays scoped to
// the run scratch and is wiped on teardown.
//
// We also pin `model` here because the HTTP prompt_async path does not send
// a model in the request body, so without pinning, opencode falls back to
// whatever default the user has configured globally - which has already
// caused a run to execute on z-ai/glm-4.7 when configs asked for
// openai/gpt-5.4. Pinning in opencode.json removes that ambiguity.
//
// Finally we copy the user's opencode auth.json into the isolated
// XDG_DATA_HOME. Credentials for providers like OpenAI (OAuth) live there,
// and without copying them the isolated data dir only sees env-var providers
// (OpenRouter via OPENROUTER_API_KEY) - which is exactly how the first
// failing facebook run silently ran on glm-4.7 instead of the configured
// openai model.
// The orchestrator isolates each run's XDG_CONFIG_HOME so opencode state does
// not leak between topologies. `gh` also resolves its config dir off
// XDG_CONFIG_HOME (default `$XDG_CONFIG_HOME/gh` or `$HOME/.config/gh`), so
// without an override it would look inside the per-run scratch and report the
// agent as unauthenticated, silently blocking every `gh pr create` in a
// topology run. Setting GH_CONFIG_DIR explicitly keeps gh pointed at the host
// config - it takes precedence over XDG_CONFIG_HOME.
export function resolveGhConfigDir(hostEnv: NodeJS.ProcessEnv): string {
  const explicit = hostEnv.GH_CONFIG_DIR;
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }

  const xdg = hostEnv.XDG_CONFIG_HOME;
  const base =
    typeof xdg === "string" && xdg.length > 0
      ? xdg
      : path.join(hostEnv.HOME ?? homedir(), ".config");
  return path.join(base, "gh");
}

export async function prepareAutonomousOpencodeHome(input: {
  runDir: string;
  model: string;
  userOpencodeDataDir?: string;
}): Promise<string> {
  const xdgHome = path.join(input.runDir, ".xdg");
  const opencodeDir = path.join(xdgHome, "opencode");
  await mkdir(opencodeDir, { recursive: true });
  const config = {
    $schema: "https://opencode.ai/config.json",
    model: input.model,
    tools: { question: false },
  };
  await writeFile(
    path.join(opencodeDir, "opencode.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );

  const sourceDataDir =
    input.userOpencodeDataDir ??
    path.join(
      process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"),
      "opencode",
    );
  const sourceAuth = path.join(sourceDataDir, "auth.json");
  if (existsSync(sourceAuth)) {
    await copyFile(sourceAuth, path.join(opencodeDir, "auth.json"));
  }

  return xdgHome;
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

  for (const nodeId of validatedNodeIds) {
    const worktreeDir = path.join(worktreesRoot, nodeId);
    const branchName = `run/${validatedRunId}/${nodeId}`;

    // Pre-create a per-node branch pinned to this worktree. Once the branch is
    // checked out here, git will refuse any other worktree's attempt to check
    // out the same ref, which prevents the "my HEAD drifted onto a peer's
    // branch" class of failures seen in earlier runs. Agents can still branch
    // off this one for additional PRs if they want.
    await runGit(
      ["worktree", "add", "-b", branchName, worktreeDir, workspace.mainBranch],
      workspace.mainWorktreeDir,
    );

    nodeWorktrees.push({
      nodeId,
      agentName: nodeId,
      runDir: workspace.runDir,
      mainWorktreeDir: workspace.mainWorktreeDir,
      worktreeDir,
      branchName,
      remoteName: validatedRemoteName,
    });
  }

  return nodeWorktrees;
}

async function syncMainWorktreeWithRemote(
  workspace: InitializedWorkspace,
  runner: CommandRunner = runCommand,
): Promise<void> {
  // The remote protects `run/<run-id>/main` against non-PR updates, so we
  // never push from the orchestrator here. Both topology and solo runs are
  // required to land work via a PR; by this point the remote is the source
  // of truth and we just mirror it locally.
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

  // `git reset --hard` only resets tracked state. Agents sometimes drop files
  // straight into the shared main worktree (bypassing the PR workflow); if we
  // published from here without cleaning, those untracked files would ship in
  // docs/<topo>/ even though they never landed on run/<id>/main. Wipe them so
  // the published artifact reflects what actually merged, nothing more.
  const cleanResult = await runner({
    command: "git",
    args: ["clean", "-fdx"],
    cwd: workspace.mainWorktreeDir,
  });

  if (cleanResult.exitCode !== 0) {
    throw new Error(cleanResult.stderr || "git clean -fdx failed");
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
    const attemptedTag =
      envelope.tag === "system-timeout" ||
      envelope.tag === "system-kickoff" ||
      envelope.tag === "system-stall"
        ? undefined
        : envelope.tag;
    const rejectionEvent: Omit<RoutingRejectionEvent, "schema_version" | "ts"> =
      {
        run_id: envelope.run_id,
        round: envelope.round,
        type: "routing_rejection",
        node_id: envelope.from,
        attempted_message: {
          from: envelope.from,
          to: envelope.to,
          tag: attemptedTag,
        },
        reason: `Non-neighbor message rejected: ${envelope.from} -> ${envelope.to}`,
      };

    await appendOrchestratorEvent(validatedRunDir, rejectionEvent);

    return false;
  }

  await appendStagedMessage(validatedRunDir, envelope);

  return true;
}

export async function stageOrchestratorKickoffMessage({
  runDir,
  runId,
  leaderNodeId,
  maxRounds,
  briefPath,
  topologyName,
}: {
  runDir: string;
  runId: string;
  leaderNodeId: string;
  maxRounds: number;
  briefPath: string;
  topologyName: string;
}): Promise<typeof MessageEnvelope._type> {
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedLeader = validateNonEmptyString(leaderNodeId, "leaderNodeId");
  const validatedMaxRounds = validatePositiveInteger(maxRounds, "maxRounds");
  const validatedBriefPath = validateNonEmptyString(briefPath, "briefPath");

  const envelope: typeof MessageEnvelope._type = MessageEnvelope.parse({
    run_id: validatedRunId,
    round: 1,
    from: "orchestrator",
    to: validatedLeader,
    schema_version: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    tag: "system-kickoff",
    content: `Begin run. You are the leader of the ${topologyName} team for run \`${validatedRunId}\`. Read the project brief at \`${validatedBriefPath}\`, then plan how your team should coordinate and begin decomposing the work across the ${validatedMaxRounds} rounds available. You should talk to your neighbors and tell them how they should operate in order to achieve the coordination you planned for the company.`,
  });

  await appendStagedMessage(validatedRunDir, envelope);
  logEvent("system_kickoff_message_staged", {
    runId: validatedRunId,
    leaderNodeId: validatedLeader,
  });

  return envelope;
}

export async function stageOrchestratorTimeoutMessage({
  runDir,
  runId,
  round,
  nodeId,
  timeoutMs,
}: {
  runDir: string;
  runId: string;
  round: number;
  nodeId: string;
  timeoutMs: number;
}): Promise<typeof MessageEnvelope._type> {
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");
  const validatedTimeoutMs = validatePositiveInteger(timeoutMs, "timeoutMs");

  const timeoutMinutes = Math.round(validatedTimeoutMs / 60_000);
  const envelope: typeof MessageEnvelope._type = MessageEnvelope.parse({
    run_id: validatedRunId,
    round: validatedRound,
    from: "orchestrator",
    to: validatedNodeId,
    schema_version: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    tag: "system-timeout",
    content: `Your previous turn was aborted at the ${timeoutMinutes}-minute per-turn timeout. Your worktree may contain uncommitted changes from the aborted turn - inspect them with \`git status\` before deciding what to do next. Review your inbox and decide what to do next.`,
  });

  await appendStagedMessage(validatedRunDir, envelope);
  logEvent("system_timeout_message_staged", {
    runId: validatedRunId,
    round: validatedRound,
    nodeId: validatedNodeId,
    timeoutMs: validatedTimeoutMs,
  });

  return envelope;
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
  benchmarkRunLabel,
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
  const soloInboxMessages = await drainNodeInboxMessages({
    runDir: workspace.runDir,
    nodeId: validatedConfig.topology.leader,
  });
  const prompt = buildSoloPrompt({
    round: validatedRound,
    maxRounds: validatedConfig.maxRounds,
    briefPath: path.join(workspace.runDir, "brief.md"),
    perNodeTurnTimeoutMs: validatedConfig.perNodeTurnTimeoutMs,
    inboxMessages: soloInboxMessages,
    benchmarkRunLabel:
      benchmarkRunLabel ?? benchmarkRunLabelForSuite(validatedConfig.suite),
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
      try {
        const response = await sendPrompt({
          baseUrl: openCodeClient.baseUrl,
          sessionId,
          prompt,
          schema,
          signal: abortSignal,
        });
        output =
          coerceSoloNodeRoundOutput(response.structured) ??
          parseSoloNodeRoundOutput(response.finalText ?? "");
        parsed = {
          finalText: response.finalText ?? JSON.stringify(output),
          toolCalls: response.toolCalls ?? [],
          tokens: response.tokens,
        };
      } catch (error) {
        await persistPartialAbortTurn({
          runId,
          nodeId: validatedConfig.topology.leader,
          round: validatedRound,
          runDir: workspace.runDir,
          model,
          startedAt,
          latencyMs: Date.now() - startedAtMs,
          error,
        });
        throw error;
      }
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
          coerceSoloNodeRoundOutput(response.structured) ??
          parseSoloNodeRoundOutput(response.finalText ?? "");
        parsed = {
          finalText: response.finalText ?? JSON.stringify(output),
          toolCalls: response.toolCalls ?? [],
          tokens: response.tokens,
        };
      } catch (error) {
        await persistPartialAbortTurn({
          runId,
          nodeId: validatedConfig.topology.leader,
          round: validatedRound,
          runDir: workspace.runDir,
          model,
          startedAt,
          latencyMs: Date.now() - startedAtMs,
          error,
        });
        throw error;
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
  benchmarkRunLabel,
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

  await detectWorktreeBranchDrift({
    runId,
    round: validatedRound,
    nodeId: validatedNodeId,
    workspace,
    runner,
  });

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
    briefPath: path.join(workspace.runDir, "brief.md"),
    inboxMessages,
    perNodeTurnTimeoutMs: validatedConfig.perNodeTurnTimeoutMs,
    benchmarkRunLabel:
      benchmarkRunLabel ?? benchmarkRunLabelForSuite(validatedConfig.suite),
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
      try {
        const response = await sendPrompt({
          baseUrl: openCodeClient.baseUrl,
          sessionId,
          prompt,
          schema,
          signal: abortSignal,
        });
        output =
          coerceSoloNodeRoundOutput(response.structured) ??
          parseSoloNodeRoundOutput(response.finalText ?? "");
        parsed = {
          finalText: response.finalText ?? JSON.stringify(output),
          toolCalls: response.toolCalls ?? [],
          tokens: response.tokens,
        };
      } catch (error) {
        await persistPartialAbortTurn({
          runId,
          nodeId: validatedNodeId,
          round: validatedRound,
          runDir: workspace.runDir,
          model,
          startedAt,
          latencyMs: Date.now() - startedAtMs,
          error,
        });
        throw error;
      }
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
          coerceSoloNodeRoundOutput(response.structured) ??
          parseSoloNodeRoundOutput(response.finalText ?? "");
        parsed = {
          finalText: response.finalText ?? JSON.stringify(output),
          toolCalls: response.toolCalls ?? [],
          tokens: response.tokens,
        };
      } catch (error) {
        await persistPartialAbortTurn({
          runId,
          nodeId: validatedNodeId,
          round: validatedRound,
          runDir: workspace.runDir,
          model,
          startedAt,
          latencyMs: Date.now() - startedAtMs,
          error,
        });
        throw error;
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

async function raceRoundSafetyTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  round: number,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          logEvent("round_safety_timeout", { round, timeoutMs });
          reject(
            new Error(
              `Round ${round} exceeded roundSafetyTimeoutMs (${timeoutMs}ms). This is a safety ceiling - healthy rounds finish within per-node timeouts. Investigate the orchestrator's abort pipeline.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function runNodeRoundWithTimeout<T>({
  runId,
  runDir,
  round,
  nodeId,
  perNodeTurnTimeoutMs,
  execute,
}: RunNodeRoundWithTimeoutInput<T>): Promise<RunNodeRoundWithTimeoutResult<T>> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedNodeId = validateNonEmptyString(nodeId, "nodeId");
  const validatedTimeoutMs = validatePositiveInteger(
    perNodeTurnTimeoutMs,
    "perNodeTurnTimeoutMs",
  );

  const timeoutToken = Symbol("timeout");
  const abortController = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;
  const turnStartedAtMs = Date.now();
  logEvent("turn_start", {
    runId: validatedRunId,
    round: validatedRound,
    nodeId: validatedNodeId,
    timeoutMs: validatedTimeoutMs,
  });

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
      logEvent("turn_timeout", {
        runId: validatedRunId,
        round: validatedRound,
        nodeId: validatedNodeId,
        durationMs: Date.now() - turnStartedAtMs,
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
        logEvent("turn_timeout", {
          runId: validatedRunId,
          round: validatedRound,
          nodeId: validatedNodeId,
          durationMs: Date.now() - turnStartedAtMs,
        });

        return {
          completed: false,
          reason: "timeout",
          output: null,
        };
      }

      const errorDetail =
        result.error instanceof Error
          ? result.error.message
          : String(result.error);

      const rawOutput =
        result.error !== null &&
        typeof result.error === "object" &&
        typeof (result.error as { finalText?: unknown }).finalText === "string"
          ? ((result.error as { finalText: string }).finalText)
          : undefined;

      const diagnostics =
        result.error !== null &&
        typeof result.error === "object" &&
        typeof (result.error as { diagnostics?: unknown }).diagnostics ===
          "string"
          ? ((result.error as { diagnostics: string }).diagnostics)
          : undefined;

      await appendOrchestratorEvent(validatedRunDir, {
        run_id: validatedRunId,
        round: validatedRound,
        type: "failure",
        node_id: validatedNodeId,
        failure_kind: "crash",
        detail: errorDetail.length > 0 ? errorDetail : "node turn crashed",
        ...(rawOutput !== undefined ? { raw_output: rawOutput } : {}),
        ...(diagnostics !== undefined ? { diagnostics } : {}),
      });
      logEvent("turn_error", {
        runId: validatedRunId,
        round: validatedRound,
        nodeId: validatedNodeId,
        durationMs: Date.now() - turnStartedAtMs,
        error: errorDetail,
      });

      return {
        completed: false,
        reason: "error",
        output: null,
      };
    }

    logEvent("turn_end", {
      runId: validatedRunId,
      round: validatedRound,
      nodeId: validatedNodeId,
      durationMs: Date.now() - turnStartedAtMs,
    });
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
  perNodeTurnTimeoutMs,
  executeNodeRound,
}: RunRoundParallelInput<T>): Promise<RunRoundParallelResult<T>> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedRunDir = path.resolve(
    validateNonEmptyString(runDir, "runDir"),
  );
  const validatedRound = validatePositiveInteger(round, "round");
  const validatedTimeoutMs = validatePositiveInteger(
    perNodeTurnTimeoutMs,
    "perNodeTurnTimeoutMs",
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
        perNodeTurnTimeoutMs: validatedTimeoutMs,
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
  summary,
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

  if (!summary || !isSubmissionDeclaration(summary)) {
    return false;
  }

  await appendOrchestratorEvent(validatedRunDir, {
    run_id: validatedRunId,
    round: validatedRound,
    type: "submission",
    node_id: validatedNodeId,
    detail: summary,
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
  suite,
  workspace,
  runner = runCommand,
}: PublishRunArtifactInput): Promise<string> {
  const validatedRepoRoot = path.resolve(
    validateNonEmptyString(repoRoot, "repoRoot"),
  );
  validateNonEmptyString(runId, "runId");
  const validatedTopology = validateNonEmptyString(topology, "topology");
  const validatedSuite = validateOptionalPathSegment(suite, "suite");
  const destinationDir = path.join(
    validatedRepoRoot,
    "docs",
    ...(validatedSuite === undefined ? [] : [validatedSuite]),
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

export async function judgePublishedArtifact({
  artifactDir,
  runId,
  model,
  startOpenCodeServe: launchOpenCodeServe = startOpenCodeServe,
  shutdownOpenCodeServe: stopOpenCodeServe = shutdownOpenCodeServe,
  assertOpenCodeProviderAvailable:
    verifyOpenCodeProviderAvailable = assertOpenCodeProviderAvailable,
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

  const agentBrowserSession = `org-bench-judge-${validatedRunId}`;
  const ownedServer = await launchOpenCodeServe({
    cwd: validatedArtifactDir,
    env: {
      ...process.env,
      AGENT_BROWSER_SESSION: agentBrowserSession,
      GH_CONFIG_DIR: resolveGhConfigDir(process.env),
    },
  });

  try {
    await verifyOpenCodeProviderAvailable({
      baseUrl: ownedServer.baseUrl,
      model: validatedModel,
    });

    const openCodeClient = {
      baseUrl: ownedServer.baseUrl,
      createSession: createOpenCodeSession,
      sendPrompt: sendOpenCodePromptStreamed,
      deleteSession: deleteOpenCodeSession,
    };

    const result = await judge({
      artifactDir: validatedArtifactDir,
      runId: validatedRunId,
      model: validatedModel,
      agentBrowserSession,
      openCodeClient,
    });

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );

    return result;
  } finally {
    await stopOpenCodeServe(ownedServer).catch(() => undefined);
  }
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
  model?: string;
  openCodeClient?: RunTrajectoryAnalysisInput["openCodeClient"];
  startOpenCodeServe?: RunTrajectoryAnalysisInput["startOpenCodeServe"];
  shutdownOpenCodeServe?: RunTrajectoryAnalysisInput["shutdownOpenCodeServe"];
  analyze?: RunTrajectoryAnalysisInput["analyze"];
};

export async function regenerateTrajectoryAnalysis({
  artifactDir,
  repoRoot,
  model,
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
    model: model ?? DEFAULT_ANALYST_MODEL,
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
    judgeOutput?.run_id ??
    analysisOutput?.run_id ??
    metadata.topologySlug;
  const seed =
    explicitSeed ??
    (await readExistingMetaSeed(validatedArtifactDir)) ??
    0;

  const nodeTokens = sumUsage(nodeRecords);
  const judgeTokens = judgeOutput?.tokens ?? { in: 0, out: 0 };
  const analysisTokens = analysisOutput?.tokens ?? { in: 0, out: 0 };
  const totalTokensIn = nodeTokens.in + judgeTokens.in + analysisTokens.in;
  const totalTokensOut =
    nodeTokens.out + judgeTokens.out + analysisTokens.out;
  const totalCostUsd =
    sumCost(nodeRecords) +
    (judgeOutput?.cost_usd ?? 0) +
    (analysisOutput?.cost_usd ?? 0);
  const totalWallClockMs = sumLatency(nodeRecords);
  const tokensByNode = buildTokensByNode(nodeRecords);
  const publishedPath = path.relative(validatedRepoRoot, validatedArtifactDir);

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
      judge: judgeOutput?.model ?? "unknown",
      analyst: analysisOutput?.model ?? "unknown",
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
      time_to_first_build_ms: 0,
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

export async function ensureBenchmarkRunLabels({
  runId,
  benchmarkRunLabel,
  runner = runCommand,
}: EnsureBenchmarkRunLabelsInput): Promise<string[]> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedBenchmarkRunLabel = validateNonEmptyString(
    benchmarkRunLabel,
    "benchmarkRunLabel",
  );
  const listResult = await runner({
    command: "gh",
    args: ["label", "list", "--json", "name", "--limit", "1000"],
  });

  if (listResult.exitCode !== 0) {
    throw new Error(listResult.stderr || "gh label list failed");
  }

  const existing = new Set<string>();
  try {
    const parsed = JSON.parse(listResult.stdout) as Array<{ name?: unknown }>;
    for (const entry of parsed) {
      if (entry && typeof entry.name === "string") {
        existing.add(entry.name);
      }
    }
  } catch (error) {
    throw new Error(
      `failed to parse gh label list output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const required: Array<{ name: string; color: string; description: string }> =
    [
      {
        name: validatedBenchmarkRunLabel,
        color: "0e8a16",
        description: "Marks PRs produced by an org-bench topology run.",
      },
      {
        name: `run:${validatedRunId}`,
        color: "5319e7",
        description: `org-bench run ${validatedRunId}`,
      },
    ];

  const created: string[] = [];

  for (const label of required) {
    if (existing.has(label.name)) {
      continue;
    }

    const createResult = await runner({
      command: "gh",
      args: [
        "label",
        "create",
        label.name,
        "--color",
        label.color,
        "--description",
        label.description,
      ],
    });

    if (createResult.exitCode === 0) {
      created.push(label.name);
      continue;
    }

    if (/already exists/i.test(createResult.stderr)) {
      continue;
    }

    throw new Error(
      createResult.stderr || `gh label create ${label.name} failed`,
    );
  }

  return created;
}

export async function stripBenchmarkRunLabelsForTopology({
  runId,
  benchmarkRunLabel,
  runner = runCommand,
}: StripBenchmarkRunLabelsForTopologyInput): Promise<number[]> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedBenchmarkRunLabel = validateNonEmptyString(
    benchmarkRunLabel,
    "benchmarkRunLabel",
  );
  const listResult = await runner({
    command: "gh",
    args: [
      "pr",
      "list",
      "--label",
      validatedBenchmarkRunLabel,
      "--state",
      "all",
      "--json",
      "number,labels",
      "--limit",
      "1000",
    ],
  });

  if (listResult.exitCode !== 0) {
    throw new Error(
      listResult.stderr || `gh pr list (${validatedBenchmarkRunLabel}) failed`,
    );
  }

  const listed = parsePrListWithLabels(listResult.stdout);
  const exactLabel = `run:${validatedRunId}`;
  const suffixedPrefix = `${exactLabel}-`;
  const targets = listed.filter((pr) =>
    pr.labels.some(
      (label) => label === exactLabel || label.startsWith(suffixedPrefix),
    ),
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
        validatedBenchmarkRunLabel,
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
  benchmarkRunLabel,
  runner = runCommand,
}: PersistRunArtifactsInput): Promise<boolean> {
  const validatedRunId = validateNonEmptyString(runId, "runId");
  const validatedBenchmarkRunLabel = validateNonEmptyString(
    benchmarkRunLabel,
    "benchmarkRunLabel",
  );

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

  // Land the artifacts commit via a PR, not a direct push. The remote
  // protects `run/<run-id>/main` against non-PR updates, so stage the
  // commit on a side branch, open a PR, and merge it with gh.
  const artifactsBranch = `run/${validatedRunId}/artifacts`;

  await runGit(
    ["checkout", "-B", artifactsBranch],
    workspace.mainWorktreeDir,
  );
  await runGit(
    ["commit", "-m", `persist run artifacts for ${validatedRunId}`],
    workspace.mainWorktreeDir,
  );
  await runGit(
    ["push", "-u", workspace.remoteName, artifactsBranch],
    workspace.mainWorktreeDir,
  );

  const prCreateResult = await runner({
    command: "gh",
    args: [
      "pr",
      "create",
      "--base",
      workspace.mainBranch,
      "--head",
      artifactsBranch,
      "--title",
      `persist run artifacts for ${validatedRunId}`,
      "--body",
      `Automated: persists trajectory + inbox artifacts under \`.org-bench-artifacts/\` for run \`${validatedRunId}\`.`,
      "--label",
      validatedBenchmarkRunLabel,
      "--label",
      `run:${validatedRunId}`,
    ],
  });

  if (prCreateResult.exitCode !== 0) {
    throw new Error(
      prCreateResult.stderr ||
        prCreateResult.stdout ||
        "gh pr create failed for artifacts PR",
    );
  }

  const prUrl = prCreateResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .pop();

  if (prUrl === undefined || prUrl.length === 0) {
    throw new Error("gh pr create returned no URL for the artifacts PR");
  }

  const prMergeResult = await runner({
    command: "gh",
    args: [
      "pr",
      "merge",
      prUrl,
      "--squash",
      "--delete-branch",
      "--admin",
    ],
  });

  if (prMergeResult.exitCode !== 0) {
    throw new Error(
      prMergeResult.stderr ||
        prMergeResult.stdout ||
        `gh pr merge failed for artifacts PR ${prUrl}`,
    );
  }

  // Switch the local main worktree back onto the run main branch and
  // fast-forward it to the merged tip so downstream callers see the
  // persisted state.
  await runGit(
    ["checkout", workspace.mainBranch],
    workspace.mainWorktreeDir,
  );
  await runGit(
    ["fetch", workspace.remoteName, workspace.mainBranch],
    workspace.mainWorktreeDir,
  );
  await runGit(
    [
      "reset",
      "--hard",
      `${workspace.remoteName}/${workspace.mainBranch}`,
    ],
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

function extractPartialAbortSnapshot(error: unknown): {
  finalText: string | null;
  toolCalls: NodeToolCall[];
  tokens: { in: number; out: number };
} | null {
  if (!(error instanceof Error) || !isAbortError(error)) {
    return null;
  }
  const snapshot = (error as Error & { partialSnapshot?: unknown })
    .partialSnapshot;
  if (!isRecord(snapshot)) {
    return null;
  }
  const rawToolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : [];
  const toolCalls: NodeToolCall[] = rawToolCalls.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (typeof entry.tool !== "string" || entry.tool.length === 0) return [];
    if (typeof entry.input !== "string" || entry.input.length === 0) return [];
    if (entry.status !== "success" && entry.status !== "error") return [];
    const duration =
      typeof entry.duration_ms === "number" &&
      Number.isFinite(entry.duration_ms) &&
      entry.duration_ms >= 0
        ? Math.floor(entry.duration_ms)
        : undefined;
    return [
      {
        tool: entry.tool,
        input: entry.input,
        status: entry.status,
        ...(duration !== undefined ? { duration_ms: duration } : {}),
      },
    ];
  });
  const tokens = isRecord(snapshot.tokens)
    ? {
        in:
          typeof snapshot.tokens.in === "number" && snapshot.tokens.in >= 0
            ? Math.floor(snapshot.tokens.in)
            : 0,
        out:
          typeof snapshot.tokens.out === "number" && snapshot.tokens.out >= 0
            ? Math.floor(snapshot.tokens.out)
            : 0,
      }
    : { in: 0, out: 0 };
  const finalText =
    typeof snapshot.finalText === "string" && snapshot.finalText.length > 0
      ? snapshot.finalText
      : null;
  return { finalText, toolCalls, tokens };
}

async function persistPartialAbortTurn({
  runId,
  nodeId,
  round,
  runDir,
  model,
  startedAt,
  latencyMs,
  error,
}: {
  runId: string;
  nodeId: string;
  round: number;
  runDir: string;
  model: string;
  startedAt: Date;
  latencyMs: number;
  error: unknown;
}): Promise<boolean> {
  const snapshot = extractPartialAbortSnapshot(error);
  if (!snapshot) {
    return false;
  }
  await writeNodeTurnRecord({
    runId,
    nodeId,
    round,
    runDir,
    model,
    output: { messages: [], summary: undefined },
    toolCalls: snapshot.toolCalls,
    tokens: snapshot.tokens,
    startedAt,
    latencyMs,
    aborted: true,
    abortedPartialText: snapshot.finalText ?? undefined,
  });
  return true;
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
  aborted,
  abortedPartialText,
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
  aborted?: boolean;
  abortedPartialText?: string;
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
    ...(aborted ? { aborted: true } : {}),
    ...(abortedPartialText && abortedPartialText.length > 0
      ? { aborted_partial_text: abortedPartialText.slice(0, 4000) }
      : {}),
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

async function detectWorktreeBranchDrift({
  runId,
  round,
  nodeId,
  workspace,
  runner,
}: {
  runId: string;
  round: number;
  nodeId: string;
  workspace: InitializedNodeWorktree;
  runner: CommandRunner;
}): Promise<void> {
  const result = await runner({
    command: "git",
    args: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: workspace.worktreeDir,
  }).catch(() => null);

  if (!result || result.exitCode !== 0) {
    return;
  }

  const actualHead = result.stdout.trim();
  if (!actualHead) {
    return;
  }

  const ownedPrefix = workspace.branchName;
  const isOwnedBranch =
    actualHead === ownedPrefix || actualHead.startsWith(`${ownedPrefix}-`);

  if (isOwnedBranch) {
    return;
  }

  await appendOrchestratorEvent(workspace.runDir, {
    type: "worktree_drift",
    run_id: runId,
    round,
    node_id: nodeId,
    expected_branch_prefix: ownedPrefix,
    actual_head: actualHead,
  });
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
  | "judge"
  | "analyst"
  | "aggregate"
  | "close_browser_sessions"
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
  runId: string,
  benchmarkRunLabel: string,
  stripPriorTopologyLabels: (
    input: StripBenchmarkRunLabelsForTopologyInput,
  ) => Promise<number[]>,
): Promise<void> {
  try {
    await stripPriorTopologyLabels({ runId, benchmarkRunLabel });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `[bench] preflight strip_prior_topology_labels failed for ${runId}; continuing: ${detail}\n`,
    );
  }
}

async function runPreflightEnsureRunLabels(
  runId: string,
  benchmarkRunLabel: string,
  ensureRunLabels: (
    input: EnsureBenchmarkRunLabelsInput,
  ) => Promise<string[]>,
): Promise<void> {
  try {
    await ensureRunLabels({ runId, benchmarkRunLabel });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `[bench] preflight ensure_run_labels failed for ${runId}; continuing: ${detail}\n`,
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

    const rawOutput =
      error !== null &&
      typeof error === "object" &&
      typeof (error as { finalText?: unknown }).finalText === "string"
        ? ((error as { finalText: string }).finalText)
        : undefined;

    const diagnostics =
      error !== null &&
      typeof error === "object" &&
      typeof (error as { diagnostics?: unknown }).diagnostics === "string"
        ? ((error as { diagnostics: string }).diagnostics)
        : undefined;

    process.stderr.write(
      `[finalize] stage "${stage}" failed for ${runId}: ${detail}\n`,
    );

    await appendOrchestratorEvent(artifactDir, {
      run_id: runId,
      round,
      type: "stage_failed",
      stage,
      detail: detail.length > 0 ? detail : `${stage} stage failed`,
      ...(rawOutput !== undefined ? { raw_output: rawOutput } : {}),
      ...(diagnostics !== undefined ? { diagnostics } : {}),
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
  agentBrowserSession,
  openCodeClient,
}: {
  artifactDir: string;
  runId: string;
  model: string;
  agentBrowserSession: string;
  openCodeClient: {
    baseUrl: string;
    sessionId?: string;
    createSession?: typeof createOpenCodeSession;
    sendPrompt: OpenCodeStructuredPromptSender;
    deleteSession?: typeof deleteOpenCodeSession;
  };
}): Promise<ArtifactJudgeOutput> {
  return runArtifactJudge({
    runId,
    artifactDir,
    model,
    agentBrowserSession,
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

// Hard cap on total trajectory-summary size in bytes. gpt-5.5's context is
// ~272K tokens; at ~4 chars/token that's ~1MB, but we need headroom for the
// prompt shell and the schema. A full run like google produces ~900KB of
// node jsonls alone, which tips the prompt into context_length_exceeded.
// When over-budget, drop per-node jsonls first (their content is largely
// redundant with messages.jsonl + events.jsonl + prs/).
const TRAJECTORY_SUMMARY_BUDGET_BYTES = 400_000;

export async function buildTrajectorySummary(
  artifactDir: string,
): Promise<string> {
  const trajectoryDir = path.join(artifactDir, "trajectory");
  const entries = (
    await collectFileEntries(trajectoryDir, trajectoryDir)
  ).filter(({ relativePath }) =>
    shouldIncludeTrajectorySummaryEntry(relativePath),
  );

  const sized = await Promise.all(
    entries.map(async (entry) => {
      const content = await readFile(entry.absolutePath, "utf8");
      return { ...entry, content };
    }),
  );

  const metaPath = path.join(artifactDir, "meta.json");
  const metaSection = (await pathExists(metaPath))
    ? ["Artifact file: meta.json", await readFile(metaPath, "utf8")].join(
        "\n\n",
      )
    : null;

  const totalBytes = sized.reduce((sum, e) => sum + e.content.length, 0);
  const keep =
    totalBytes > TRAJECTORY_SUMMARY_BUDGET_BYTES
      ? sized.filter(
          ({ relativePath }) => !relativePath.startsWith(`nodes${path.sep}`),
        )
      : sized;
  const droppedNodes = keep.length < sized.length;

  const sections = keep.map(({ relativePath, content }) =>
    [`Trajectory file: ${relativePath}`, content].join("\n\n"),
  );

  const header = [
    `Artifact directory: ${artifactDir}`,
    `Trajectory directory: ${trajectoryDir}`,
    ...(droppedNodes
      ? [
          `Note: per-node trajectory/nodes/*.jsonl files were omitted because the total trajectory size (${totalBytes} bytes) exceeded the budget (${TRAJECTORY_SUMMARY_BUDGET_BYTES}). The node-level tool-call detail is redundant with messages.jsonl + events.jsonl + prs/ which are still included.`,
        ]
      : []),
  ];

  return [
    ...header,
    ...(metaSection === null ? [] : [metaSection]),
    ...sections,
  ].join("\n\n");
}

function shouldIncludeTrajectorySummaryEntry(relativePath: string): boolean {
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

    if (
      message.tag === "system-timeout" ||
      message.tag === "system-kickoff" ||
      message.tag === "system-stall"
    ) {
      // Orchestrator-injected; not counted in agent-authored aggregates.
      continue;
    }

    byTag[message.tag] += 1;
  }

  const total = Object.values(byTag).reduce((sum, count) => sum + count, 0);
  return {
    total,
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
  const suite = validateOptionalPathSegment(value.suite, "suite");
  const seed = validatePositiveInteger(value.seed, "seed");
  const maxRounds = validatePositiveInteger(value.maxRounds, "maxRounds");
  const perNodeTurnTimeoutMs = validatePositiveInteger(
    value.perNodeTurnTimeoutMs,
    "perNodeTurnTimeoutMs",
  );
  const roundSafetyTimeoutMs =
    value.roundSafetyTimeoutMs === undefined
      ? perNodeTurnTimeoutMs + 30 * 60_000
      : validatePositiveInteger(
          value.roundSafetyTimeoutMs,
          "roundSafetyTimeoutMs",
        );
  const brief = validateNonEmptyString(value.brief, "brief");
  const models = validateModels(value.models);
  const runBudget = validateRunBudget(value.runBudget);

  return {
    ...(suite === undefined ? {} : { suite }),
    topology,
    seed,
    maxRounds,
    perNodeTurnTimeoutMs,
    roundSafetyTimeoutMs,
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
    nodeExpectations: validateNodeExpectations(value.nodeExpectations, nodes),
    culture: validateCulture(value.culture),
  };

  validateIntegratorReachability(topology);

  return topology;
}

function validateNodeExpectations(
  value: unknown,
  nodes: string[],
): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(
      "Invalid run config: topology.nodeExpectations must be an object",
    );
  }

  const result: Record<string, string> = {};
  for (const node of nodes) {
    result[node] = validateNonEmptyString(
      value[node],
      `topology.nodeExpectations.${node}`,
    );
  }

  for (const key of Object.keys(value)) {
    if (!nodes.includes(key)) {
      throw new Error(
        `Invalid run config: topology.nodeExpectations key "${key}" does not match a node in topology.nodes`,
      );
    }
  }

  return result;
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

  const summary = validateNonEmptyString(
    value.summary,
    "topology.culture.summary",
  );

  if (kind === "oracle-process") {
    return {
      kind,
      summary,
      reviewNodeId: validateNonEmptyString(
        value.reviewNodeId,
        "topology.culture.reviewNodeId",
      ),
    };
  }

  return { kind, summary };
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

function validateOptionalPathSegment(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  const segment = validateNonEmptyString(value, field);
  if (
    segment === "." ||
    segment === ".." ||
    !/^[A-Za-z0-9._-]+$/.test(segment)
  ) {
    throw new Error(
      `Invalid run config: ${field} must be a safe path segment`,
    );
  }
  return segment;
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

// Every AGENT_BROWSER_SESSION value we hand out spawns a persistent Chrome
// user-data-dir (~1 GB each for idle, much more under load). agent-browser
// does not close those on session end, so runs leak ~10 GB of Chrome per
// topology. Call `agent-browser close` once per session we created at the end
// of finalize. Best-effort - swallow failures so they can't fail the run.
async function closeBrowserSessions({
  runId,
  nodeIds,
}: {
  runId: string;
  nodeIds: string[];
}): Promise<void> {
  const sessions = [
    `org-bench-judge-${runId}`,
    ...nodeIds.map((nodeId) => `${runId}-${nodeId}`),
  ];
  await Promise.all(
    sessions.map(async (sessionName) => {
      try {
        await execFileAsync("agent-browser", ["close"], {
          env: { ...process.env, AGENT_BROWSER_SESSION: sessionName },
        });
      } catch {
        // swallow - cleanup is best-effort
      }
    }),
  );
}

// Before each round we force the shared main worktree to match the remote
// tip and nuke anything agents may have dropped in there. Without this, merges
// that land mid-run don't show up when any node points agent-browser at
// ../main/index.html, so their live-testing validates stale code.
async function syncMainWorktreeToRemote({
  mainWorktreeDir,
  remoteName,
  mainBranch,
}: {
  mainWorktreeDir: string;
  remoteName: string;
  mainBranch: string;
}): Promise<string> {
  await runGit(["fetch", remoteName, mainBranch], mainWorktreeDir);
  await runGit(
    ["reset", "--hard", `${remoteName}/${mainBranch}`],
    mainWorktreeDir,
  );
  await runGit(["clean", "-fd"], mainWorktreeDir);
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: mainWorktreeDir,
  });
  return stdout.trim();
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

function renderInboxSection(
  inboxMessages: Array<typeof MessageEnvelope._type>,
): string {
  if (inboxMessages.length === 0) {
    return [
      "## Your inbox",
      "",
      "_You received no messages from the team this round._",
      "",
      "You are woken every round regardless of inbox. With no incoming request, you choose how to use this turn:",
      "- **(a) Do nothing.** Reply with an empty messages array and a summary noting you stood down for the round.",
      "- **(b) Continue your ongoing work.** Pick up where you left off in your worktree, ship a PR or finish a PR in flight, and update peers in your reply.",
      "- **(c) Reach out to peers.** Message a neighbor with a question, status check, review request, or coordination ask.",
      "",
      "Pick based on what is most useful to the run right now. Do not waste the turn on filler.",
    ].join("\n");
  }

  const lines = inboxMessages.map((message, index) => {
    const tagSuffix = message.tag ? ` [${message.tag}]` : "";
    return `${index + 1}. **From ${message.from}${tagSuffix}:** ${message.content}`;
  });

  return ["## Your inbox", "", ...lines].join("\n");
}

function renderReplyFormatSection(
  recipientHint: string,
  allowedRecipientsNote: string,
): string {
  return [
    `## Reply format`,
    ``,
    `Every turn MUST end by emitting a single JSON object matching this exact shape as your **terminal output**:`,
    ``,
    "```json",
    `{"messages":[{"to":"${recipientHint}","tag":"status","content":"..."}],"summary":"..."}`,
    "```",
    ``,
    `**Critical rules:**`,
    `- The JSON is the turn's terminal output. If your turn ends with plain text, markdown, narration, or any prose instead of this JSON, the turn is discarded as a failure and all your tool-call work this turn is wasted.`,
    `- After you finish your tool calls and any work, your FINAL action is to produce this JSON envelope. Do not narrate "I'll do X next" at the end - either do X now or put that note in the \`summary\` field.`,
    `- Put any progress notes, findings, or status updates inside the \`summary\` string - never as free-standing commentary text.`,
    `- Use an empty \`messages\` array when there is nothing to send. ${allowedRecipientsNote}`,
    `- No markdown fences around the JSON. No prose before or after it.`,
  ].join("\n");
}

function renderLeaderRoleSection(topologyName: string): string {
  return [
    `### As the leader`,
    `- Set direction, decompose the brief into concrete tasks for your team, and coordinate execution across rounds.`,
    `- Only the leader can declare final submission.`,
    `- **Declare final submission as soon as the shared ${topologyName} artifact is good enough to be judged - do not wait to run out the round budget.** Rounds used affects your final score, so holding the run open for marginal polish costs you.`,
    `- **How to declare:** include the exact token \`${FINAL_SUBMISSION_TOKEN}\` in your turn \`summary\` field. The orchestrator scans only the leader's summary for this token and will finalize the run as soon as it sees it. Do not include the token in any other context (e.g. quoting these instructions, hypotheticals, or other nodes' summaries) - that will end the run prematurely.`,
  ].join("\n");
}

function renderDeveloperRoleSection(
  runId: string,
  nodeId: string,
  benchmarkRunLabel: string,
): string {
  return [
    `### As a developer`,
    `- **Landing rule (enforced by the remote): the remote rejects direct pushes to \`run/${runId}/main\`.** Your only way to land code is: side branch -> push -> PR -> integrator merge.`,
    `- **PR base branch: \`run/${runId}/main\`.** Every PR you open must target this branch. Never push directly to it.`,
    `- **Your worktree vs. the shared one:**`,
    `  - \`./\` (your opencode cwd) is your private worktree, already on branch \`run/${runId}/${nodeId}\` at the tip of \`run/${runId}/main\`. That branch is pinned to this worktree, so no peer can check it out elsewhere.`,
    `  - \`../main/\` is the shared trunk worktree used by the orchestrator. Treat it as read-only. Do not \`cd\` into it to run \`git checkout\`, \`git commit\`, or \`git push\` - you will collide with other agents and with the harness.`,
    `- **Do not:** create additional git worktrees (no \`git worktree add\` - your assigned worktree is enough); switch branches in \`../main/\`; \`git push --force\` anything on \`run/${runId}/*\`; push to \`run/${runId}/main\`.`,
    `- **Recipe for landing a PR (from inside your own worktree):**`,
    "  ```",
    `  # You already start on run/${runId}/${nodeId}. Edit files, then:`,
    `  git add -A && git commit -m "..."`,
    `  git push -u origin run/${runId}/${nodeId}`,
    `  gh pr create --base run/${runId}/main --head run/${runId}/${nodeId} \\`,
    `    --title "..." --body "..." --label ${benchmarkRunLabel} --label run:${runId}`,
    "  ```",
    `  If you want parallel PRs, branch off your own branch with \`git checkout -b run/${runId}/${nodeId}-<slug>\` and push that; do not reuse another node's branch name.`,
    `- Every PR must include labels: \`${benchmarkRunLabel}\`, \`run:${runId}\`.`,
    `- PR description signature line: \`Author: ${nodeId}\`. PR comment prefix: \`**${nodeId}:**\`.`,
    `- **After you raise a PR**, send a message to an integrator other than yourself asking them to review and merge. Include the PR URL. If they push back with fixes, address them on the same PR and re-request review.`,
    `- Before committing, pull any new changes on \`run/${runId}/main\` into your worktree so your branch is not stale.`,
  ].join("\n");
}

function renderIntegratorRoleSection(): string {
  return [
    `### As an integrator`,
    `- You can review and merge PRs that target \`main\`.`,
    `- You cannot merge your own PR - another integrator must review and merge it for you.`,
    `- **Same-round turnaround is required.** When a peer asks you to review, respond in the same round with one of: (a) merge and leave a comment explaining what you verified, (b) request changes with specific issues on the PR, (c) reassign to another integrator and tell both the author and the new reviewer, or (d) decline with a stated reason. Do not leave review requests hanging.`,
    `- Do not approve-and-walk-away - the reviewer owns the merge.`,
  ].join("\n");
}

function renderSoloRoleSection(runId: string, benchmarkRunLabel: string): string {
  return [
    `### As the solo builder`,
    `- You are the only node in this run; there are no peer reviews.`,
    `- **The remote rejects direct pushes to \`run/${runId}/main\`.** Land every change via a PR, even though you are reviewing your own work:`,
    `  1. From the \`main/\` worktree, create a side branch: \`git checkout -b run/${runId}/leader-<short-description>\`.`,
    `  2. Commit your work on that side branch and push it: \`git push -u origin run/${runId}/leader-<short-description>\`.`,
    `  3. Open a PR: \`gh pr create --base run/${runId}/main --head run/${runId}/leader-<short-description> --title "..." --body "..." --label ${benchmarkRunLabel} --label run:${runId}\`.`,
    `  4. Merge it yourself: \`gh pr merge <pr-number> --squash --delete-branch\`.`,
    `  5. Sync your local worktree back onto main: \`git checkout run/${runId}/main && git pull --ff-only origin run/${runId}/main\`.`,
    `- Use a new side-branch name per PR. Do not attempt \`git push\` directly to \`run/${runId}/main\` - it will be rejected.`,
    `- When the artifact is ready for evaluation, include the exact token \`${FINAL_SUBMISSION_TOKEN}\` in your turn \`summary\` field. The orchestrator scans the summary for this token and will finalize the run as soon as it sees it. Do not include the token in any other context - that will end the run prematurely.`,
  ].join("\n");
}

function renderTurnTimeLimitSection(perNodeTurnTimeoutMs: number): string {
  const minutes = Math.round(perNodeTurnTimeoutMs / 60_000);
  return [
    `### Turn time limit`,
    `Each turn is capped at **${minutes} minutes**. If your turn exceeds this, it will be aborted and you will receive an orchestrator message tagged \`system-timeout\` in your inbox next round. Saved-but-uncommitted files remain in your worktree; inspect with \`git status\` before continuing.`,
  ].join("\n");
}

function buildRoleFlagsLine(topology: TopologyConfig, nodeId: string): string {
  const isDeveloper = topology.developers.includes(nodeId);
  const isIntegrator = new Set(resolveMainBranchIntegrators(topology)).has(
    nodeId,
  );
  const flags: string[] = [];
  if (isDeveloper) flags.push("developer");
  if (isIntegrator) flags.push("integrator");
  return flags.length === 0
    ? `Your role flags: observer.`
    : `Your role flags: ${flags.join(", ")}.`;
}

function buildSoloPrompt({
  round,
  maxRounds,
  briefPath,
  perNodeTurnTimeoutMs,
  inboxMessages,
  benchmarkRunLabel,
}: {
  round: number;
  maxRounds: number;
  briefPath: string;
  perNodeTurnTimeoutMs: number;
  inboxMessages: Array<typeof MessageEnvelope._type>;
  benchmarkRunLabel: string;
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
      nodeExpectations: {
        leader:
          "Lone builder. No coordination, no delegation, no one to review work. Ships directly.",
      },
      culture: null,
    },
    nodeId: "leader",
  });

  const remainingRounds = Math.max(0, maxRounds - round + 1);

  return [
    [
      `# You are leader, the solo builder for this run`,
      ``,
      `You are shipping the whole artifact yourself. This is **round ${round} of ${maxRounds}** (${remainingRounds} rounds remaining, including this one). Rounds used affects your final score - declare final submission as soon as the artifact is ready rather than using the full budget.`,
      `Your role flags: developer.`,
      ``,
      renderSoloRoleSection("solo", benchmarkRunLabel),
      ``,
      renderTurnTimeLimitSection(perNodeTurnTimeoutMs),
    ].join("\n"),
    commonContext,
    `## Project brief\n\nRead the full project brief at \`${briefPath}\`.`,
    renderInboxSection(inboxMessages),
    `## Instructions\n\nInspect your worktree, decide the most useful next step, and complete exactly one cohesive unit of work this round before replying.`,
    renderReplyFormatSection(
      "leader",
      "Only `leader` is a valid recipient in a solo run.",
    ),
  ].join("\n\n");
}

export function buildTopologyNodePrompt({
  runId,
  round,
  maxRounds,
  nodeId,
  topology,
  briefPath,
  inboxMessages,
  perNodeTurnTimeoutMs,
  benchmarkRunLabel,
}: {
  runId: string;
  round: number;
  maxRounds: number;
  nodeId: string;
  topology: TopologyConfig;
  briefPath: string;
  inboxMessages: Array<typeof MessageEnvelope._type>;
  perNodeTurnTimeoutMs: number;
  benchmarkRunLabel: string;
}): string {
  const commonContext = buildNodeCommonContext({
    runId,
    topology,
    nodeId,
  });
  const isLeader = nodeId === topology.leader;
  const isDeveloper = topology.developers.includes(nodeId);
  const isIntegrator = new Set(resolveMainBranchIntegrators(topology)).has(
    nodeId,
  );
  const neighbors = listNeighbors(topology, nodeId);
  const personaHeading = isLeader
    ? `# You are ${nodeId}, the leader of the ${topology.name} team`
    : `# You are ${nodeId} on the ${topology.name} team`;
  const remainingRounds = Math.max(0, maxRounds - round + 1);
  const countdownClause = `This is **round ${round} of ${maxRounds}** (${remainingRounds} rounds remaining, including this one).`;
  const efficiencyClause = `Rounds used affects your final score - taking fewer rounds while shipping a complete, judge-worthy artifact beats using the full budget.`;
  const missionLine = isLeader
    ? `You are coordinating the ${topology.name} team to deliver the project defined in the brief. ${countdownClause} ${efficiencyClause} Declare final submission as soon as the artifact is ready.`
    : `You are working with the ${topology.name} team to deliver the project defined in the brief. ${countdownClause} ${efficiencyClause}`;
  const allowedRecipientsNote =
    neighbors.length === 0
      ? `You have no neighbors to message this round.`
      : `Valid recipients: ${neighbors.map((n) => `\`${n}\``).join(", ")}. Do not message anyone else.`;

  const roleSections: string[] = [];
  if (isLeader) {
    roleSections.push(renderLeaderRoleSection(topology.name));
  }
  if (isDeveloper) {
    roleSections.push(
      renderDeveloperRoleSection(runId, nodeId, benchmarkRunLabel),
    );
  }
  if (isIntegrator) {
    roleSections.push(renderIntegratorRoleSection());
  }
  roleSections.push(renderTurnTimeLimitSection(perNodeTurnTimeoutMs));

  const personaBlock = [
    personaHeading,
    ``,
    missionLine,
    ``,
    buildRoleFlagsLine(topology, nodeId),
    ``,
    roleSections.join("\n\n"),
  ].join("\n");

  return [
    personaBlock,
    commonContext,
    `## Project brief\n\nRead the full project brief at \`${briefPath}\`.`,
    renderInboxSection(inboxMessages),
    `## Instructions\n\nInspect your inbox and worktree, choose the smallest useful next step for your role, and complete one cohesive unit of work before replying. If a concrete delegated task is already in your inbox, execute it directly rather than re-planning. If you ship a PR this round, summarize it in at least one outbound message with the PR URL and a one-line reason.`,
    renderReplyFormatSection("<neighbor>", allowedRecipientsNote),
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
  validateNonEmptyString(runDir, "runDir");
  validatePositiveInteger(round, "round");
  const validatedLeader = validateNonEmptyString(leader, "leader");
  const validatedNodes = validateStringArray(nodes, "nodes");

  if (!validatedNodes.includes(validatedLeader)) {
    throw new Error(
      `leader ${validatedLeader} is not listed in nodes [${validatedNodes.join(", ")}]`,
    );
  }

  // Round 1 is a leader-only planning turn: the leader reads the brief,
  // decomposes the work, and messages peers. Peers first wake in round 2
  // with an inbox. Without this, all nodes wake in parallel in round 1,
  // each sees an empty inbox plus the shared brief, and independently
  // ships a full skeleton - we saw this in the first Facebook pilot.
  if (round === 1) {
    return [validatedLeader];
  }

  return [...validatedNodes];
}

async function drainNodeInboxMessages({
  runDir,
  nodeId,
}: {
  runDir: string;
  nodeId: string;
}): Promise<Array<typeof MessageEnvelope._type>> {
  const inboxDir = path.join(runDir, "inbox");
  const inboxPath = path.join(inboxDir, `${nodeId}.jsonl`);
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

  await mkdir(inboxDir, { recursive: true });
  await writeFile(inboxPath, "", "utf8");

  return messages;
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

function isSubmissionDeclaration(content: string): boolean {
  return content.includes(FINAL_SUBMISSION_TOKEN);
}

function resolveMainBranchIntegrators(topology: TopologyConfig): string[] {
  return [...topology.integrators];
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
  const coerced = coerceSoloNodeRoundOutput(parsed);

  if (!coerced) {
    throw new Error("Solo node output must be an object");
  }

  return coerced;
}

function coerceSoloNodeRoundOutput(
  value: unknown,
): SoloNodeRoundOutput | null {
  if (value === null || value === undefined || !isRecord(value)) {
    return null;
  }

  const messages = Array.isArray(value.messages)
    ? value.messages.flatMap((message) => {
        const sanitized = sanitizeNodeOutboundMessage(message);
        return sanitized ? [sanitized] : [];
      })
    : [];
  const summary =
    typeof value.summary === "string" && value.summary.length > 0
      ? value.summary
      : undefined;

  return {
    messages,
    summary,
  };
}

function sanitizeNodeOutboundMessage(
  value: unknown,
): NodeOutboundMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const to = typeof value.to === "string" ? value.to : "";
  const content = typeof value.content === "string" ? value.content : "";

  if (to.length === 0 || content.length === 0) {
    return null;
  }

  const allowedTags = [
    "decompose",
    "ask",
    "answer",
    "deliver",
    "status",
    "review",
  ] as const;
  const tag =
    typeof value.tag === "string" &&
    (allowedTags as readonly string[]).includes(value.tag)
      ? (value.tag as NodeOutboundMessage["tag"])
      : undefined;

  return { to, tag, content };
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
            to: { type: "string", minLength: 1 },
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
            content: { type: "string", minLength: 1 },
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
