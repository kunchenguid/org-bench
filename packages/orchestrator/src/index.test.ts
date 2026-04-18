import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import test from "node:test";

import {
  MetaJson,
  NodeTurnRecord,
  OrchestratorEvent,
  PRSnapshot,
  SCHEMA_VERSION,
} from "@org-bench/schemas";

import {
  aggregateRunMeta,
  agentName,
  assignAgentNames,
  buildRunMainBranchProtectionPayload,
  buildNodeCommonContext,
  checkRunBudgetBetweenRounds,
  cleanupRunBranches,
  closeOpenRunPullRequests,
  detectLeaderSubmission,
  detectUnsummarizedPrActivity,
  verifyRunMainMergeAuthority,
  deliverStagedInboxMessages,
  evaluatePublishedArtifact,
  enforceRunBudgetCaps,
  appendInboxMessage,
  getRunMainWorktree,
  initializeNodeWorktrees,
  initializeNodeInboxes,
  initWorkspace,
  judgePublishedArtifact,
  loadRunConfig,
  protectRunMainBranch,
  publishRunArtifact,
  regenerateTrajectoryAnalysis,
  routeInboxMessage,
  runRoundParallel,
  runNodeRoundWithTimeout,
  selectActiveNodesForRound,
  runBenchmark,
  runTopologyNodeRound,
  runTrajectoryAnalysis,
  runSoloBenchmark,
  type CommandRunner,
  type RunSoloNodeRoundInput,
  type TopologyConfig,
  snapshotRunPullRequests,
  runSoloNodeRound,
  teardownRunWorkspace,
} from "./index.js";

const fixturesDir = path.join(__dirname, "__fixtures__");
const execFileAsync = promisify(execFile);
type OpenCodeClient = NonNullable<RunSoloNodeRoundInput["openCodeClient"]>;
type OpenCodeSendPrompt = NonNullable<OpenCodeClient["sendPrompt"]>;

function createMockOpenCodeServeProcess() {
  const child = new EventEmitter() as unknown as {
    exitCode: number | null;
    pid?: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill(signal?: NodeJS.Signals | number): boolean;
    on: EventEmitter["on"];
    once: EventEmitter["once"];
    emit: EventEmitter["emit"];
  };
  child.exitCode = null;
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.exitCode = 0;
    child.emit("close", 0, null);
    return true;
  };
  return child;
}

const defaultModels = {
  node: {
    model: "openai/gpt-5.4",
    tools: true,
    thinking: "standard",
    outputMode: "text",
    maxTurns: 1,
  },
  judge: {
    model: "openai/gpt-5.4",
    tools: false,
    thinking: "standard",
    outputMode: "json",
    maxTurns: 1,
  },
  analyst: {
    model: "openai/gpt-5.4",
    tools: false,
    thinking: "extended",
    outputMode: "json",
    maxTurns: 1,
  },
  player: {
    model: "openai/gpt-5.4",
    tools: false,
    thinking: "standard",
    outputMode: "json",
    maxTurns: 1,
  },
} as const;

test("loads a valid run config module and preserves its typed shape", async () => {
  const config = await loadRunConfig(
    path.join(fixturesDir, "valid-run-config.ts"),
  );

  assert.deepEqual(config, {
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
    seed: 3,
    maxRounds: 12,
    perRoundTimeoutMs: 120_000,
    brief: "Leader-only benchmark brief.",
    models: defaultModels,
    runBudget: {
      tokens: 5_000_000,
      wallClockMs: 10_800_000,
    },
  });
});

test("agentName deterministically maps a run and node onto the fixed name pool", () => {
  assert.equal(agentName("apple", "leader"), "Zane");
  assert.equal(agentName("apple", "leader"), "Zane");
  assert.equal(agentName("apple", "n1"), "Sage");
  assert.equal(agentName("solo", "leader"), "Quinn");
  assert.notEqual(
    agentName("apple", "leader"),
    agentName("apple", "n1"),
  );
});

test("assignAgentNames returns unique names for every node even when hashes collide", () => {
  const nodes = [
    "leader",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "n6",
    "n7",
    "n8",
  ];
  const names = assignAgentNames("facebook", nodes);

  assert.equal(names.size, nodes.length);
  for (const nodeId of nodes) {
    assert.ok(names.has(nodeId), `missing name for ${nodeId}`);
  }

  const values = [...names.values()];
  assert.equal(
    new Set(values).size,
    values.length,
    `names must be unique, got ${values.join(",")}`,
  );

  // n7 hashes to "Yara"; n8 hashes to "Yara" too - the loser probes forward.
  assert.equal(names.get("n7"), "Yara");
  assert.notEqual(names.get("n8"), "Yara");
});

test("assignAgentNames preserves agentName hashes when there is no collision", () => {
  const names = assignAgentNames("apple", ["leader", "n1", "n2"]);
  assert.equal(names.get("leader"), agentName("apple", "leader"));
  assert.equal(names.get("n1"), agentName("apple", "n1"));
  assert.equal(names.get("n2"), agentName("apple", "n2"));
});

test("assignAgentNames is deterministic across calls", () => {
  const nodes = ["leader", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];
  const a = assignAgentNames("facebook", nodes);
  const b = assignAgentNames("facebook", nodes);
  assert.deepEqual([...a.entries()], [...b.entries()]);
});

test("assignAgentNames throws when the topology has more nodes than the pool", () => {
  const pool = ["One", "Two"];
  assert.throws(
    () => assignAgentNames("x", ["a", "b", "c"], pool),
    /more nodes than the agent name pool/,
  );
});

test("buildNodeCommonContext describes leader identity, adjacency, and write access", () => {
  const context = buildNodeCommonContext({
    runId: "apple",
    topology: {
      slug: "apple",
      name: "Apple",
      nodes: ["leader", "n1", "n2"],
      edges: [
        { from: "leader", to: "n1", bidir: true },
        { from: "leader", to: "n2", bidir: true },
      ],
      leader: "leader",
      developers: ["n1", "n2"],
      integrators: ["leader"],
      culture: null,
    },
    nodeId: "leader",
  });

  assert.match(context, /Agent name: Zane/);
  assert.match(context, /Node ID: leader/);
  assert.match(context, /Role: leader/);
  assert.match(context, /Roles: integrator/);
  assert.match(context, /Leader ID: leader/);
  assert.match(context, /Neighbors: n1, n2/);
  assert.match(
    context,
    /Adjacency: leader -> n1, leader -> n2, n1 -> leader, n2 -> leader/,
  );
  assert.match(
    context,
    /Every PR must include labels: benchmark-run, run:apple\./,
  );
  assert.match(
    context,
    /PR description signature: Author: Zane \(leader, node leader\)/,
  );
  assert.match(context, /PR comment prefix: \*\*Zane \(leader\):\*\*/);
  assert.match(context, /Culture: none/);
  assert.match(context, /Integrators for run\/apple\/main: leader/);
});

test("buildNodeCommonContext exposes a roster with persona, role, and core expectation for every node", () => {
  const topology: TopologyConfig = {
    slug: "amazon",
    name: "Amazon",
    nodes: ["leader", "n1", "n2", "n3"],
    edges: [
      { from: "leader", to: "n1", bidir: true },
      { from: "leader", to: "n2", bidir: true },
      { from: "n1", to: "n3", bidir: true },
    ],
    leader: "leader",
    developers: ["n1", "n2", "n3"],
    integrators: ["leader", "n1", "n2"],
    culture: {
      kind: "amazon-writing",
      leaderPrompt: "lead",
      subleadPrompt: "sublead",
      workerPrompt: "worker",
    },
  };

  const leaderContext = buildNodeCommonContext({
    runId: "amazon",
    topology,
    nodeId: "leader",
  });

  assert.match(leaderContext, /Roster:/);
  // Each roster line lists node id, persona, role, and a one-line expectation.
  // Use assignAgentNames (not agentName) so a collision between nodes can't
  // diverge the expected persona from what the prompt actually renders.
  const personas = assignAgentNames("amazon", topology.nodes);
  const leaderPersona = personas.get("leader")!;
  const n1Persona = personas.get("n1")!;
  const n2Persona = personas.get("n2")!;
  const n3Persona = personas.get("n3")!;
  assert.match(
    leaderContext,
    new RegExp(
      `- leader \\(${leaderPersona}\\): leader - sets direction, decomposes the brief, integrates PRs`,
    ),
  );
  assert.match(
    leaderContext,
    new RegExp(
      `- n1 \\(${n1Persona}\\): sub-lead - writes PR/FAQ-style docs, reviews peer work before merge`,
    ),
  );
  assert.match(
    leaderContext,
    new RegExp(
      `- n2 \\(${n2Persona}\\): sub-lead - writes PR/FAQ-style docs, reviews peer work before merge`,
    ),
  );
  assert.match(
    leaderContext,
    new RegExp(
      `- n3 \\(${n3Persona}\\): worker - executes delegated slices, opens PRs for integration`,
    ),
  );

  // Same roster is visible to a non-leader node: everyone knows everyone's
  // title, not just the leader.
  const workerContext = buildNodeCommonContext({
    runId: "amazon",
    topology,
    nodeId: "n3",
  });
  assert.match(workerContext, /Roster:/);
  assert.match(
    workerContext,
    new RegExp(
      `- leader \\(${leaderPersona}\\): leader - sets direction, decomposes the brief, integrates PRs`,
    ),
  );
  assert.match(
    workerContext,
    new RegExp(
      `- n1 \\(${n1Persona}\\): sub-lead - writes PR/FAQ-style docs, reviews peer work before merge`,
    ),
  );
  assert.match(
    workerContext,
    new RegExp(
      `- n2 \\(${n2Persona}\\): sub-lead - writes PR/FAQ-style docs, reviews peer work before merge`,
    ),
  );
  assert.match(
    workerContext,
    new RegExp(
      `- n3 \\(${n3Persona}\\): worker - executes delegated slices, opens PRs for integration`,
    ),
  );
});

test("buildNodeCommonContext marks subleads as integrators for leader+subleads topologies", () => {
  const topology: TopologyConfig = {
    slug: "amazon",
    name: "Amazon",
    nodes: ["leader", "n1", "n2", "n3"],
    edges: [
      { from: "leader", to: "n1", bidir: true },
      { from: "leader", to: "n2", bidir: true },
      { from: "n1", to: "n3", bidir: true },
    ],
    leader: "leader",
    developers: ["n1", "n2", "n3"],
    integrators: ["leader", "n1", "n2"],
    culture: null,
  };

  const subleadContext = buildNodeCommonContext({
    runId: "amazon",
    topology,
    nodeId: "n1",
  });
  const workerContext = buildNodeCommonContext({
    runId: "amazon",
    topology,
    nodeId: "n3",
  });

  assert.match(
    subleadContext,
    /Integrators for run\/amazon\/main: leader, n1, n2/,
  );
  assert.match(subleadContext, /Roles: developer, integrator/);
  assert.match(
    workerContext,
    /Integrators for run\/amazon\/main: leader, n1, n2/,
  );
  assert.match(workerContext, /Roles: developer/);
  assert.doesNotMatch(workerContext, /Roles: developer, integrator/);
});

test("buildNodeCommonContext resolves microsoft-competition culture per role", () => {
  const topology: TopologyConfig = {
    slug: "microsoft",
    name: "Microsoft",
    nodes: ["leader", "divA", "a1", "divB", "b1"],
    edges: [
      { from: "leader", to: "divA", bidir: true },
      { from: "leader", to: "divB", bidir: true },
      { from: "divA", to: "a1", bidir: true },
      { from: "divB", to: "b1", bidir: true },
    ],
    leader: "leader",
    developers: ["divA", "a1", "divB", "b1"],
    integrators: ["leader", "divA", "divB"],
    culture: {
      kind: "microsoft-competition" as const,
      charters: {
        divA: "Combat, encounters, and the rendered board.",
        divB: "Cards, art, and the rendered board.",
      },
      contested: ["rendered board"],
      leaderPrompt:
        "You arbitrate between the two divisions on contested surfaces.",
      divisionHeadPrompt:
        "You are competing with the other division. The leader will merge only one vision per contested area.",
      divisionWorkerPrompt:
        "You are loyal to your division and push back on the other division's approach.",
    },
  };

  const divisionHeadContext = buildNodeCommonContext({
    runId: "microsoft",
    topology,
    nodeId: "divA",
  });
  const reportContext = buildNodeCommonContext({
    runId: "microsoft",
    topology,
    nodeId: "a1",
  });
  const leaderContext = buildNodeCommonContext({
    runId: "microsoft",
    topology,
    nodeId: "leader",
  });

  assert.match(divisionHeadContext, /Role: division-head/);
  assert.match(
    divisionHeadContext,
    /Culture: Microsoft culture - competing divisions\. Your charter: Combat, encounters, and the rendered board\./,
  );
  assert.match(divisionHeadContext, /Contested surfaces: rendered board/);
  assert.match(
    divisionHeadContext,
    /You are competing with the other division\./,
  );

  assert.match(reportContext, /Role: division-worker/);
  assert.match(
    reportContext,
    /Culture: Microsoft culture - competing divisions\. Your division charter \(head divA\): Combat, encounters, and the rendered board\./,
  );
  assert.match(
    reportContext,
    /You are loyal to your division and push back on the other division's approach\./,
  );

  assert.match(
    leaderContext,
    /Culture: Microsoft culture - competing divisions\. Division charters:/,
  );
  assert.match(leaderContext, /divA: Combat, encounters, and the rendered board\./);
  assert.match(leaderContext, /divB: Cards, art, and the rendered board\./);
  assert.match(
    leaderContext,
    /You arbitrate between the two divisions on contested surfaces\./,
  );
});

test("buildNodeCommonContext resolves facebook-velocity and oracle-process cultures per role", () => {
  const moveFastContext = buildNodeCommonContext({
    runId: "facebook",
    topology: {
      slug: "facebook",
      name: "Facebook",
      nodes: ["leader", "n1"],
      edges: [{ from: "leader", to: "n1", bidir: true }],
      leader: "leader",
      developers: ["leader", "n1"],
      integrators: ["leader", "n1"],
      culture: {
        kind: "facebook-velocity",
        leaderPrompt: "Remove blockers quickly.",
        workerPrompt: "Prefer shipping over deliberating.",
      },
    },
    nodeId: "n1",
  });
  const oracleTopology: TopologyConfig = {
    slug: "oracle",
    name: "Oracle",
    nodes: ["leader", "review", "l1", "e1"],
    edges: [
      { from: "leader", to: "review", bidir: true },
      { from: "leader", to: "e1", bidir: true },
      { from: "review", to: "l1", bidir: true },
    ],
    leader: "leader",
    developers: ["e1"],
    integrators: ["leader", "review", "l1"],
    culture: {
      kind: "oracle-process",
      reviewNodeId: "review",
      leaderPrompt: "Respect the review gate.",
      reviewPrompt: "Block merges that skip review.",
      legalStaffPrompt: "Cite brief rules in every review.",
      engineeringPrompt: "Write PRs with detailed compliance rationale.",
    },
  };
  const reviewContext = buildNodeCommonContext({
    runId: "oracle",
    topology: oracleTopology,
    nodeId: "review",
  });
  const legalStaffContext = buildNodeCommonContext({
    runId: "oracle",
    topology: oracleTopology,
    nodeId: "l1",
  });
  const engineeringContext = buildNodeCommonContext({
    runId: "oracle",
    topology: oracleTopology,
    nodeId: "e1",
  });

  assert.match(
    moveFastContext,
    /Culture: Facebook culture - move fast\. Prefer shipping over deliberating\./,
  );

  assert.match(reviewContext, /Role: review/);
  assert.match(
    reviewContext,
    /Culture: Oracle culture - process-first \/ legal dominant\. Block merges that skip review\./,
  );

  assert.match(legalStaffContext, /Role: legal-staff/);
  assert.match(
    legalStaffContext,
    /Culture: Oracle culture - process-first \/ legal dominant\. Cite brief rules in every review\./,
  );

  assert.match(engineeringContext, /Role: engineering/);
  assert.match(
    engineeringContext,
    /Culture: Oracle culture - process-first \/ legal dominant\. Write PRs with detailed compliance rationale\./,
  );
});

test("loads a valid microsoft-competition culture from the run config", async () => {
  const overlayConfigPath = path.join(
    fixturesDir,
    "valid-overlay-run-config.ts",
  );

  const config = await loadRunConfig(overlayConfigPath);

  assert.deepEqual(config.topology.culture, {
    kind: "microsoft-competition",
    charters: {
      divA: "Owns combat and the rendered board.",
      divB: "Owns cards, art, and the rendered board.",
    },
    contested: ["rendered board"],
    leaderPrompt:
      "You arbitrate between the two divisions and merge only one vision per contested surface.",
    divisionHeadPrompt:
      "You lead your division against the other. Advocate for your vision in PRs and reviews.",
    divisionWorkerPrompt:
      "You are loyal to your division's vision and push back on the other division's approach.",
  });
  assert.deepEqual(config.topology.edges, [
    { from: "leader", to: "divA", bidir: true },
    { from: "leader", to: "divB", bidir: true },
    { from: "divA", to: "a1", bidir: true },
    { from: "divB", to: "b1", bidir: true },
  ]);
});

test("rejects a topology config with an unknown culture kind", async () => {
  await assert.rejects(
    () =>
      loadRunConfig(path.join(fixturesDir, "invalid-overlay-run-config.ts")),
    /Invalid run config: topology\.culture\.kind must be one of apple-taste, amazon-writing, microsoft-competition, google-design-docs, facebook-velocity, oracle-process, solo-builder/,
  );
});

test("rejects a config module whose run shape is invalid", async () => {
  await assert.rejects(
    () => loadRunConfig(path.join(fixturesDir, "invalid-run-config.ts")),
    /Invalid run config/,
  );
});

test("initWorkspace creates the run tree and pushes an orphan main branch", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-orchestrator-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");
  const scratchDir = path.join(sandboxDir, "scratch");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const result = await initWorkspace({
    repoRoot: repoDir,
    runId: "solo",
    runScratchRoot: scratchDir,
  });

  assert.equal(result.runDir, path.join(scratchDir, "solo"));
  assert.equal(result.mainBranch, "run/solo/main");
  assert.equal(result.mainWorktreeDir, path.join(scratchDir, "solo", "main"));

  assert.deepEqual((await readdir(result.runDir)).sort(), [
    ".git",
    "inbox",
    "main",
    "sessions",
    "trajectory",
  ]);

  const headRef = await runGit(
    ["symbolic-ref", "HEAD"],
    result.mainWorktreeDir,
  );
  assert.equal(headRef.stdout.trim(), "refs/heads/run/solo/main");

  const remoteHead = await runGit(
    ["rev-parse", "refs/heads/run/solo/main"],
    remoteDir,
  );
  assert.match(remoteHead.stdout.trim(), /^[0-9a-f]{40}$/);
});

test("initWorkspace recreates a stale run main workspace when the same run id is reused", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-orchestrator-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const firstWorkspace = await initWorkspace({
    repoRoot: repoDir,
    runId: "solo",
  });
  await writeFile(
    path.join(firstWorkspace.mainWorktreeDir, "stale.txt"),
    "stale\n",
    "utf8",
  );

  const recreatedWorkspace = await initWorkspace({
    repoRoot: repoDir,
    runId: "solo",
  });

  assert.equal(recreatedWorkspace.runDir, firstWorkspace.runDir);
  assert.equal(recreatedWorkspace.mainBranch, firstWorkspace.mainBranch);
  await assert.rejects(
    () =>
      readFile(
        path.join(recreatedWorkspace.mainWorktreeDir, "stale.txt"),
        "utf8",
      ),
    /ENOENT/,
  );

  const headRef = await runGit(
    ["symbolic-ref", "HEAD"],
    recreatedWorkspace.mainWorktreeDir,
  );
  assert.equal(headRef.stdout.trim(), "refs/heads/run/solo/main");

  const remoteHead = await runGit(
    ["rev-parse", "refs/heads/run/solo/main"],
    remoteDir,
  );
  assert.match(remoteHead.stdout.trim(), /^[0-9a-f]{40}$/);
});

test("initWorkspace wipes a stale run directory when the same run id is reused", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-orchestrator-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const firstWorkspace = await initWorkspace({
    repoRoot: repoDir,
    runId: "solo",
  });

  // Drop a marker inside the stale run directory so we can prove the second
  // run replaced it with a fresh clone rather than reusing the directory.
  await writeFile(
    path.join(firstWorkspace.runDir, "stale-marker.txt"),
    "stale\n",
    "utf8",
  );

  const recreatedWorkspace = await initWorkspace({
    repoRoot: repoDir,
    runId: "solo",
  });

  assert.equal(recreatedWorkspace.runDir, firstWorkspace.runDir);
  await assert.rejects(
    () =>
      readFile(
        path.join(recreatedWorkspace.runDir, "stale-marker.txt"),
        "utf8",
      ),
    /ENOENT/,
  );

  const headRef = await runGit(
    ["symbolic-ref", "HEAD"],
    recreatedWorkspace.mainWorktreeDir,
  );
  assert.equal(headRef.stdout.trim(), "refs/heads/run/solo/main");
});

test("initWorkspace rejects a runScratchRoot that sits inside repoRoot", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-orchestrator-guard-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  // A scratch root nested inside the host repo would let a stray agent walk
  // up to the host .git and commit there. Reject the configuration up front.
  await assert.rejects(
    () =>
      initWorkspace({
        repoRoot: repoDir,
        runId: "solo",
        runScratchRoot: path.join(repoDir, "runs"),
      }),
    /must not be inside repoRoot/,
  );

  // Equal paths are also rejected.
  await assert.rejects(
    () =>
      initWorkspace({
        repoRoot: repoDir,
        runId: "solo",
        runScratchRoot: repoDir,
      }),
    /must not be inside repoRoot/,
  );
});

test("initWorkspace wipes stale docs/<runId>/ artifacts from a prior crashed run", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-orchestrator-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const staleDocsDir = path.join(repoDir, "docs", "solo");
  await mkdir(staleDocsDir, { recursive: true });
  await writeFile(
    path.join(staleDocsDir, "stale.html"),
    "<html>stale</html>\n",
    "utf8",
  );
  const unrelatedDocsDir = path.join(repoDir, "docs", "apple");
  await mkdir(unrelatedDocsDir, { recursive: true });
  await writeFile(
    path.join(unrelatedDocsDir, "preserved.html"),
    "<html>preserved</html>\n",
    "utf8",
  );

  await initWorkspace({
    repoRoot: repoDir,
    runId: "solo",
  });

  await assert.rejects(
    () => readFile(path.join(staleDocsDir, "stale.html"), "utf8"),
    /ENOENT/,
  );
  assert.equal(
    await readFile(path.join(unrelatedDocsDir, "preserved.html"), "utf8"),
    "<html>preserved</html>\n",
  );
});

test("initializeNodeWorktrees creates one remote-tracked worktree per node branch", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-node-worktrees-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const workspace = await initWorkspace({
    repoRoot: repoDir,
    runId: "apple",
  });

  const worktrees = await initializeNodeWorktrees({
    repoRoot: repoDir,
    runId: "apple",
    nodeIds: ["leader", "n1", "n2"],
  });

  assert.deepEqual(
    worktrees.map((worktree) => worktree.nodeId),
    ["leader", "n1", "n2"],
  );
  assert.deepEqual(
    worktrees.map((worktree) => worktree.agentName),
    [
      agentName("apple", "leader"),
      agentName("apple", "n1"),
      agentName("apple", "n2"),
    ],
  );
  assert.equal(worktrees[0]?.mainWorktreeDir, workspace.mainWorktreeDir);

  for (const worktree of worktrees) {
    assert.equal(worktree.runDir, workspace.runDir);
    assert.equal(worktree.remoteName, "origin");

    const branchRef = await runGit(
      ["symbolic-ref", "HEAD"],
      worktree.worktreeDir,
    );
    assert.equal(branchRef.stdout.trim(), `refs/heads/${worktree.branch}`);

    const remoteHead = await runGit(
      ["rev-parse", `refs/heads/${worktree.branch}`],
      remoteDir,
    );
    assert.match(remoteHead.stdout.trim(), /^[0-9a-f]{40}$/);
  }

  assert.deepEqual(
    (await readdir(path.join(workspace.runDir, "worktrees"))).sort(),
    [
      agentName("apple", "leader"),
      agentName("apple", "n1"),
      agentName("apple", "n2"),
    ].sort(),
  );
});

test("initializeNodeWorktrees recreates stale node branches and worktrees when the same run id is reused", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-node-worktrees-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  await initWorkspace({
    repoRoot: repoDir,
    runId: "apple",
  });
  await initializeNodeWorktrees({
    repoRoot: repoDir,
    runId: "apple",
    nodeIds: ["leader", "n1"],
  });
  await initWorkspace({
    repoRoot: repoDir,
    runId: "apple",
  });

  const recreatedNodeWorktrees = await initializeNodeWorktrees({
    repoRoot: repoDir,
    runId: "apple",
    nodeIds: ["leader", "n1"],
  });

  const runDir = recreatedNodeWorktrees[0]?.runDir;
  assert.ok(runDir);

  const recreatedMainRef = await runGit(
    ["rev-parse", "refs/heads/run/apple/main"],
    path.join(runDir, ".git"),
  );

  for (const worktree of recreatedNodeWorktrees) {
    const headRef = await runGit(["symbolic-ref", "HEAD"], worktree.worktreeDir);
    assert.equal(headRef.stdout.trim(), `refs/heads/${worktree.branch}`);

    const branchRef = await runGit(
      ["rev-parse", `refs/heads/${worktree.branch}`],
      path.join(worktree.runDir, ".git"),
    );
    assert.equal(branchRef.stdout.trim(), recreatedMainRef.stdout.trim());
  }
});

test("getRunMainWorktree resolves the existing run main worktree", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-main-worktree-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const workspace = await initWorkspace({
    repoRoot: repoDir,
    runId: "apple",
  });

  const resolved = await getRunMainWorktree({
    repoRoot: repoDir,
    runId: "apple",
  });

  assert.deepEqual(resolved, workspace);

  const headRef = await runGit(
    ["symbolic-ref", "HEAD"],
    resolved.mainWorktreeDir,
  );
  assert.equal(headRef.stdout.trim(), `refs/heads/${resolved.mainBranch}`);
});

test("buildRunMainBranchProtectionPayload enforces linear history and blocks force pushes, deferring review rules to agent prompts", () => {
  const payload = buildRunMainBranchProtectionPayload({
    topology: {
      slug: "apple",
      name: "Apple",
      nodes: ["leader", "n1"],
      edges: [{ from: "leader", to: "n1", bidir: true }],
      leader: "leader",
      developers: ["n1"],
      integrators: ["leader"],
      culture: null,
    },
  });

  assert.equal(payload.required_linear_history, true);
  assert.equal(payload.allow_force_pushes, false);
  assert.equal(payload.allow_deletions, false);
  assert.equal(payload.required_conversation_resolution, false);
  assert.equal(payload.required_pull_request_reviews, null);
});

test("protectRunMainBranch writes the derived protection payload through gh api", async () => {
  let capturedCommand:
    | {
        command: string;
        args: string[];
        cwd?: string;
      }
    | undefined;
  let capturedPayload: Record<string, unknown> | null = null;

  const runner: CommandRunner = async (input) => {
    capturedCommand = input;
    const inputFlagIndex = input.args.indexOf("--input");
    assert.notEqual(inputFlagIndex, -1);
    const payloadPath = input.args[inputFlagIndex + 1];
    assert.ok(payloadPath);
    capturedPayload = JSON.parse(
      await readFile(payloadPath!, "utf8"),
    ) as Record<string, unknown>;

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  };

  await protectRunMainBranch({
    repo: "kunchenguid/org-bench",
    branch: "run/apple/main",
    topology: {
      slug: "apple",
      name: "Apple",
      nodes: ["leader", "n1"],
      edges: [{ from: "leader", to: "n1", bidir: true }],
      leader: "leader",
      developers: ["n1"],
      integrators: ["leader"],
      culture: null,
    },
    runner,
  });

  assert.ok(capturedCommand);
  const ghCommand: { command: string; args: string[]; cwd?: string } =
    capturedCommand;
  assert.equal(ghCommand.command, "gh");
  assert.deepEqual(ghCommand.args.slice(0, 5), [
    "api",
    "--method",
    "PUT",
    "repos/kunchenguid/org-bench/branches/run%2Fapple%2Fmain/protection",
    "--input",
  ]);
  const protectionPayload = capturedPayload as {
    required_pull_request_reviews?: unknown;
    required_linear_history?: boolean;
    allow_force_pushes?: boolean;
  } | null;
  assert.equal(protectionPayload?.required_pull_request_reviews, null);
  assert.equal(protectionPayload?.required_linear_history, true);
  assert.equal(protectionPayload?.allow_force_pushes, false);
});

test("initWorkspace applies run-main branch protection during setup when repo and topology are provided", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-protected-workspace-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");
  let capturedCommand:
    | {
        command: string;
        args: string[];
        cwd?: string;
      }
    | undefined;

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["commit", "--allow-empty", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const runner: CommandRunner = async (input) => {
    capturedCommand = input;
    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  };

  const result = await initWorkspace({
    repoRoot: repoDir,
    runId: "apple",
    branchProtection: {
      repo: "kunchenguid/org-bench",
      topology: {
        slug: "apple",
        name: "Apple",
        nodes: ["leader", "n1"],
        edges: [{ from: "leader", to: "n1", bidir: true }],
        leader: "leader",
        developers: ["n1"],
        integrators: ["leader"],
        culture: null,
      },
      runner,
    },
  });

  assert.ok(capturedCommand);
  const ghCommand: { command: string; args: string[]; cwd?: string } =
    capturedCommand;
  assert.equal(ghCommand.command, "gh");
  assert.deepEqual(ghCommand.args.slice(0, 5), [
    "api",
    "--method",
    "PUT",
    "repos/kunchenguid/org-bench/branches/run%2Fapple%2Fmain/protection",
    "--input",
  ]);
  assert.equal(result.mainBranch, "run/apple/main");
});

test("initializeNodeInboxes creates one empty JSONL inbox file per node", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-run-"));
  await mkdir(path.join(runDir, "inbox"), { recursive: true });

  const inboxPaths = await initializeNodeInboxes({
    runDir,
    nodeIds: ["leader", "n1", "n2"],
  });

  assert.deepEqual(inboxPaths, {
    leader: path.join(runDir, "inbox", "leader.jsonl"),
    n1: path.join(runDir, "inbox", "n1.jsonl"),
    n2: path.join(runDir, "inbox", "n2.jsonl"),
  });

  assert.deepEqual((await readdir(path.join(runDir, "inbox"))).sort(), [
    "leader.jsonl",
    "n1.jsonl",
    "n2.jsonl",
  ]);

  assert.equal(
    await readFile(path.join(runDir, "inbox", "leader.jsonl"), "utf8"),
    "",
  );
  assert.equal(
    await readFile(path.join(runDir, "inbox", "n1.jsonl"), "utf8"),
    "",
  );
  assert.equal(
    await readFile(path.join(runDir, "inbox", "n2.jsonl"), "utf8"),
    "",
  );
});

test("appendInboxMessage appends a schema-valid envelope to the recipient inbox", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-run-"));
  await initializeNodeInboxes({
    runDir,
    nodeIds: ["leader", "n1"],
  });

  const appended = await appendInboxMessage({
    runDir,
    message: {
      run_id: "apple",
      round: 2,
      from: "leader",
      to: "n1",
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      tag: "ask",
      content: "Please review the combat damage wording.",
    },
  });

  assert.equal(appended, true);
  assert.equal(
    await readFile(path.join(runDir, "inbox", "n1.jsonl"), "utf8"),
    `${JSON.stringify({
      run_id: "apple",
      round: 2,
      from: "leader",
      to: "n1",
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      tag: "ask",
      content: "Please review the combat damage wording.",
    })}\n`,
  );
});

test("appendInboxMessage treats malformed envelopes as a no-op", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-run-"));
  await initializeNodeInboxes({
    runDir,
    nodeIds: ["leader", "n1"],
  });

  const appended = await appendInboxMessage({
    runDir,
    message: {
      run_id: "apple",
      round: 2,
      from: "leader",
      to: "n1",
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      content: "",
    },
  });

  assert.equal(appended, false);
  assert.equal(
    await readFile(path.join(runDir, "inbox", "n1.jsonl"), "utf8"),
    "",
  );
});

test("routeInboxMessage rejects non-neighbor sends and records a routing_rejection event", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-run-"));
  await initializeNodeInboxes({
    runDir,
    nodeIds: ["leader", "n1", "n2"],
  });

  const delivered = await routeInboxMessage({
    runDir,
    topology: {
      slug: "apple",
      name: "Apple",
      nodes: ["leader", "n1", "n2"],
      edges: [{ from: "leader", to: "n1", bidir: true }],
      leader: "leader",
      developers: ["n1"],
      integrators: ["leader"],
      culture: null,
    },
    message: {
      run_id: "apple",
      round: 2,
      from: "n2",
      to: "n1",
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      tag: "ask",
      content: "Can you review this draft?",
    },
  });

  assert.equal(delivered, false);
  assert.equal(
    await readFile(path.join(runDir, "inbox", "n1.jsonl"), "utf8"),
    "",
  );

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const event = OrchestratorEvent.parse(
    JSON.parse(await readFile(eventsPath, "utf8")),
  );

  assert.equal(event.type, "routing_rejection");
  assert.equal(event.run_id, "apple");
  assert.equal(event.round, 2);
  assert.equal(event.node_id, "n2");
  assert.deepEqual(event.attempted_message, {
    from: "n2",
    to: "n1",
    tag: "ask",
  });
  assert.match(event.reason, /Non-neighbor message rejected: n2 -> n1/);
  assert.equal(event.schema_version, SCHEMA_VERSION);
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("routeInboxMessage stages successfully routed envelopes until round-end delivery", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-run-"));
  await initializeNodeInboxes({
    runDir,
    nodeIds: ["leader", "n1"],
  });

  const delivered = await routeInboxMessage({
    runDir,
    topology: {
      slug: "apple",
      name: "Apple",
      nodes: ["leader", "n1"],
      edges: [{ from: "leader", to: "n1", bidir: true }],
      leader: "leader",
      developers: ["n1"],
      integrators: ["leader"],
      culture: null,
    },
    message: {
      run_id: "apple",
      round: 2,
      from: "leader",
      to: "n1",
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      tag: "deliver",
      content: "Opened PR #12 with the updated play page.",
    },
  });

  assert.equal(delivered, true);
  const expectedEnvelope = {
    run_id: "apple",
    round: 2,
    from: "leader",
    to: "n1",
    schema_version: SCHEMA_VERSION,
    ts: "2026-04-16T12:00:00.000Z",
    tag: "deliver",
    content: "Opened PR #12 with the updated play page.",
  };

  assert.equal(
    await readFile(path.join(runDir, "inbox", "n1.jsonl"), "utf8"),
    "",
  );
  await assert.rejects(
    readFile(path.join(runDir, "trajectory", "messages.jsonl"), "utf8"),
    { code: "ENOENT" },
  );
  assert.equal(
    await readFile(
      path.join(runDir, "trajectory", "staged-messages.jsonl"),
      "utf8",
    ),
    `${JSON.stringify(expectedEnvelope)}\n`,
  );
});

test("deliverStagedInboxMessages appends staged round messages to inboxes and trajectory/messages.jsonl", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-run-"));
  await initializeNodeInboxes({
    runDir,
    nodeIds: ["leader", "n1"],
  });

  await routeInboxMessage({
    runDir,
    topology: {
      slug: "apple",
      name: "Apple",
      nodes: ["leader", "n1"],
      edges: [{ from: "leader", to: "n1", bidir: true }],
      leader: "leader",
      developers: ["n1"],
      integrators: ["leader"],
      culture: null,
    },
    message: {
      run_id: "apple",
      round: 2,
      from: "leader",
      to: "n1",
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      tag: "deliver",
      content: "Opened PR #12 with the updated play page.",
    },
  });

  const deliveredCount = await deliverStagedInboxMessages({
    runDir,
    round: 2,
  });

  const expectedEnvelope = {
    run_id: "apple",
    round: 2,
    from: "leader",
    to: "n1",
    schema_version: SCHEMA_VERSION,
    ts: "2026-04-16T12:00:00.000Z",
    tag: "deliver",
    content: "Opened PR #12 with the updated play page.",
  };

  assert.equal(deliveredCount, 1);
  assert.equal(
    await readFile(path.join(runDir, "inbox", "n1.jsonl"), "utf8"),
    `${JSON.stringify(expectedEnvelope)}\n`,
  );
  assert.equal(
    await readFile(path.join(runDir, "trajectory", "messages.jsonl"), "utf8"),
    `${JSON.stringify(expectedEnvelope)}\n`,
  );
  assert.equal(
    await readFile(
      path.join(runDir, "trajectory", "staged-messages.jsonl"),
      "utf8",
    ),
    "",
  );
});

test("runSoloNodeRound invokes OpenCode in the main worktree with leader context and brief", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    cwd?: string;
    signal?: AbortSignal;
  }> = [];

  const result = await runSoloNodeRound({
    runId: "solo",
    round: 1,
    workspace: {
      runDir: "/tmp/org-bench/runs/solo",
      mainWorktreeDir: "/tmp/org-bench/runs/solo/main",
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runConfig: {
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
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    runner: async ({
      command,
      args,
      cwd,
      signal,
    }: {
      command: string;
      args: string[];
      cwd?: string;
      signal?: AbortSignal;
    }) => {
      calls.push({ command, args, cwd, signal });

      return {
        stdout: [
          JSON.stringify({
            type: "text",
            part: {
              type: "text",
              text: JSON.stringify({
                messages: [],
                summary: "Prepared a solo plan.",
              }),
              metadata: { openai: { phase: "final_answer" } },
            },
          }),
          JSON.stringify({
            type: "step_finish",
            part: { tokens: { input: 321, output: 123 } },
          }),
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "opencode");
  assert.equal(calls[0]?.cwd, "/tmp/org-bench/runs/solo/main");
  assert.equal(calls[0]?.signal, undefined);
  assert.deepEqual(calls[0]?.args.slice(0, 5), [
    "run",
    "--format",
    "json",
    "--model",
    "openai/gpt-5.4",
  ]);
  assert.equal(calls[0]?.args[5], "--dangerously-skip-permissions");
  assert.notEqual(calls[0]?.args.includes("--session"), true);

  const prompt = calls[0]?.args.at(-1) ?? "";
  assert.match(prompt, /You are the leader and only node for this run\./);
  assert.match(prompt, /Node ID: leader/);
  assert.match(prompt, /Role: leader/);
  assert.match(prompt, /Neighbors: none/);
  assert.match(
    prompt,
    /Integration authority: leader submits the final artifact/,
  );
  assert.match(prompt, /Full brief:/);
  assert.match(prompt, /Leader-only benchmark brief\./);
  assert.match(
    prompt,
    /You are already operating inside the run worktree for this benchmark\. Do all file edits, builds, and checks inside the current working directory and do not modify the benchmark repo outside this worktree\./,
  );
  assert.match(prompt, /Round 1 of 12 instruction:/);
  assert.match(
    prompt,
    /You have 12 rounds total to ship this artifact; plan the scope so the deliverable is complete by round 12\./,
  );
  assert.match(
    prompt,
    /Treat this round as exactly one incremental unit of work\./,
  );
  assert.match(
    prompt,
    /Make at most one cohesive code or verification change, then stop and reply immediately with the required JSON\./,
  );
  assert.match(
    prompt,
    /If the current working directory contains a deployable artifact that is ready for evaluation, send a self-addressed message whose content explicitly declares final submission\./,
  );

  assert.deepEqual(result.output, {
    messages: [],
    summary: "Prepared a solo plan.",
  });
  assert.deepEqual(result.tokens, { in: 321, out: 123 });
  assert.equal(result.model, "openai/gpt-5.4");
  assert.equal(
    result.sessionFile,
    "/tmp/org-bench/runs/solo/sessions/leader.json",
  );
});

test("runSoloNodeRound forwards an abort signal to the command runner", async () => {
  let receivedSignal: AbortSignal | undefined;

  await runSoloNodeRound({
    runId: "solo",
    round: 1,
    workspace: {
      runDir: "/tmp/org-bench/runs/solo",
      mainWorktreeDir: "/tmp/org-bench/runs/solo/main",
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runConfig: {
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
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    abortSignal: new AbortController().signal,
    runner: async (input: {
      command: string;
      args: string[];
      cwd?: string;
      signal?: AbortSignal;
    }) => {
      receivedSignal = input.signal;

      return {
        stdout: [
          JSON.stringify({
            type: "text",
            part: {
              type: "text",
              text: JSON.stringify({
                messages: [],
                summary: "Prepared a solo plan.",
              }),
              metadata: { openai: { phase: "final_answer" } },
            },
          }),
          JSON.stringify({
            type: "step_finish",
            part: { tokens: { input: 1, output: 1 } },
          }),
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      };
    },
  });

  assert.ok(receivedSignal instanceof AbortSignal);
  assert.equal(receivedSignal?.aborted, false);
});

test("runSoloNodeRound can use the streamed OpenCode serve client for a solo round", async () => {
  const sessionCalls: Array<{ baseUrl: string; directory: string }> = [];
  const promptCalls: Array<{
    baseUrl: string;
    sessionId: string;
    prompt: string;
    signal?: AbortSignal;
  }> = [];
  const deleteCalls: Array<{ baseUrl: string; sessionId: string }> = [];

  const result = await runSoloNodeRound({
    runId: "solo",
    round: 1,
    workspace: {
      runDir: "/tmp/org-bench/runs/solo",
      mainWorktreeDir: "/tmp/org-bench/runs/solo/main",
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runConfig: {
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
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      createSession: async ({ baseUrl, directory }) => {
        sessionCalls.push({ baseUrl, directory });
        return { id: "session-123" };
      },
      sendPrompt: (async ({
        baseUrl,
        sessionId,
        prompt,
        signal,
      }: {
        baseUrl: string;
        sessionId: string;
        prompt: string;
        signal?: AbortSignal;
      }) => {
        promptCalls.push({ baseUrl, sessionId, prompt, signal });
        return {
          response: {
            info: {
              structured: { messages: [], summary: "Prepared a solo plan." },
            },
          },
          finalText: '{"messages":[],"summary":"Prepared a solo plan."}',
          structured: { messages: [], summary: "Prepared a solo plan." },
          toolCalls: [
            {
              tool: "bash",
              input: "npm test",
              status: "success" as const,
              duration_ms: 250,
            },
          ],
          tokens: { in: 33, out: 12 },
        };
      }) as OpenCodeSendPrompt,
      deleteSession: async ({ baseUrl, sessionId }) => {
        deleteCalls.push({ baseUrl, sessionId });
        return true;
      },
    },
  });

  assert.deepEqual(sessionCalls, [
    {
      baseUrl: "http://127.0.0.1:4096",
      directory: "/tmp/org-bench/runs/solo/main",
    },
  ]);
  assert.equal(promptCalls.length, 1);
  assert.equal(promptCalls[0]?.baseUrl, "http://127.0.0.1:4096");
  assert.equal(promptCalls[0]?.sessionId, "session-123");
  assert.match(promptCalls[0]?.prompt ?? "", /Leader-only benchmark brief\./);
  assert.deepEqual(deleteCalls, [
    {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-123",
    },
  ]);
  assert.deepEqual(result.output, {
    messages: [],
    summary: "Prepared a solo plan.",
  });
  assert.deepEqual(result.toolCalls, [
    {
      tool: "bash",
      input: "npm test",
      status: "success",
      duration_ms: 250,
    },
  ]);
  assert.deepEqual(result.tokens, { in: 33, out: 12 });
});

test("runSoloNodeRound reuses a provided OpenCode serve session without recreating it", async () => {
  const promptCalls: Array<{
    baseUrl: string;
    sessionId: string;
    prompt: string;
    signal?: AbortSignal;
  }> = [];

  const result = await runSoloNodeRound({
    runId: "solo",
    round: 2,
    workspace: {
      runDir: "/tmp/org-bench/runs/solo",
      mainWorktreeDir: "/tmp/org-bench/runs/solo/main",
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runConfig: {
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
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-shared",
      createSession: async () => {
        throw new Error(
          "createSession should not be called when sessionId is provided",
        );
      },
      sendPrompt: (async ({
        baseUrl,
        sessionId,
        prompt,
        signal,
      }: {
        baseUrl: string;
        sessionId: string;
        prompt: string;
        signal?: AbortSignal;
      }) => {
        promptCalls.push({ baseUrl, sessionId, prompt, signal });
        return {
          response: {
            info: {
              structured: {
                messages: [],
                summary: "Reused the shared session.",
              },
            },
          },
          finalText: '{"messages":[],"summary":"Reused the shared session."}',
          structured: { messages: [], summary: "Reused the shared session." },
          toolCalls: [],
          tokens: { in: 17, out: 8 },
        };
      }) as OpenCodeSendPrompt,
      deleteSession: async () => {
        throw new Error(
          "deleteSession should not be called when sessionId is provided",
        );
      },
    },
  });

  assert.equal(promptCalls.length, 1);
  assert.equal(promptCalls[0]?.sessionId, "session-shared");
  assert.match(promptCalls[0]?.prompt ?? "", /Round 2/);
  assert.deepEqual(result.output, {
    messages: [],
    summary: "Reused the shared session.",
  });
  assert.deepEqual(result.tokens, { in: 17, out: 8 });
});

test("runTopologyNodeRound tells the leader to delegate concrete first-round work to neighbors", async () => {
  const promptCalls: Array<{
    baseUrl: string;
    sessionId: string;
    prompt: string;
  }> = [];

  const result = await runTopologyNodeRound({
    runId: "apple",
    round: 1,
    nodeId: "leader",
    workspace: {
      nodeId: "leader",
      runDir: "/tmp/org-bench/runs/apple",
      mainWorktreeDir: "/tmp/org-bench/runs/apple/main",
      worktreeDir: "/tmp/org-bench/runs/apple/worktrees/Alex",
      branch: "run/apple/Alex",
      remoteName: "origin",
      agentName: "Alex",
    },
    runConfig: {
      topology: {
        slug: "apple",
        name: "Apple",
        nodes: ["leader", "n1"],
        edges: [{ from: "leader", to: "n1", bidir: true }],
        leader: "leader",
        developers: ["n1"],
        integrators: ["leader"],
        culture: null,
      },
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    inboxMessages: [],
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "leader-session",
      sendPrompt: (async ({ baseUrl, sessionId, prompt }) => {
        promptCalls.push({ baseUrl, sessionId, prompt });
        return {
          response: {
            info: {
              structured: {
                messages: [],
                summary: "Delegated the first worker task.",
              },
            },
          },
          finalText:
            '{"messages":[],"summary":"Delegated the first worker task."}',
          structured: {
            messages: [],
            summary: "Delegated the first worker task.",
          },
          toolCalls: [],
          tokens: { in: 21, out: 9 },
        };
      }) as OpenCodeSendPrompt,
    },
  });

  assert.equal(promptCalls.length, 1);
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /As leader in round 1, you must personally land an initial minimal shared scaffold \(an `index\.html` entry file hosting a `<canvas>` element, a small vanilla JavaScript module that initializes a WebGL context and runs a `requestAnimationFrame` loop, and an `assets\/` directory placeholder\) onto `run\/apple\/main` this round by committing scaffold files in your own worktree, pushing your branch, opening a PR against `run\/apple\/main`, and merging that PR yourself using your leader merge authority\./,
  );
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /In the same round, decompose the remaining brief into concrete delegated tasks and send them to your neighbors so they can start building on the scaffold in round 2\./,
  );
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /Round 1 of 12 instruction:/,
  );
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /You have 12 rounds total to ship this project; plan the scope so the deliverable is complete by round 12\./,
  );
  assert.match(promptCalls[0]?.prompt ?? "", /Leader-only brief:/);
  assert.deepEqual(result.output, {
    messages: [],
    summary: "Delegated the first worker task.",
  });
});

test("runTopologyNodeRound tells workers to execute concrete delegated inbox tasks before extra inspection", async () => {
  const promptCalls: Array<{
    baseUrl: string;
    sessionId: string;
    prompt: string;
  }> = [];

  const result = await runTopologyNodeRound({
    runId: "apple",
    round: 2,
    nodeId: "n1",
    workspace: {
      nodeId: "n1",
      runDir: "/tmp/org-bench/runs/apple",
      mainWorktreeDir: "/tmp/org-bench/runs/apple/main",
      worktreeDir: "/tmp/org-bench/runs/apple/worktrees/Finn",
      branch: "run/apple/Finn",
      remoteName: "origin",
      agentName: "Finn",
    },
    runConfig: {
      topology: {
        slug: "apple",
        name: "Apple",
        nodes: ["leader", "n1"],
        edges: [{ from: "leader", to: "n1", bidir: true }],
        leader: "leader",
        developers: ["n1"],
        integrators: ["leader"],
        culture: null,
      },
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    inboxMessages: [
      {
        run_id: "apple",
        from: "leader",
        to: "n1",
        round: 1,
        schema_version: 1,
        tag: "status",
        ts: "2026-04-17T00:00:00.000Z",
        content:
          "Build the encounter screen skeleton and report back with the PR URL if you open one.",
      },
    ],
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "worker-session",
      sendPrompt: (async ({ baseUrl, sessionId, prompt }) => {
        promptCalls.push({ baseUrl, sessionId, prompt });
        return {
          response: {
            info: {
              structured: {
                messages: [],
                summary: "Implemented the delegated encounter screen slice.",
              },
            },
          },
          finalText:
            '{"messages":[],"summary":"Implemented the delegated encounter screen slice."}',
          structured: {
            messages: [],
            summary: "Implemented the delegated encounter screen slice.",
          },
          toolCalls: [],
          tokens: { in: 18, out: 7 },
        };
      }) as OpenCodeSendPrompt,
    },
  });

  assert.equal(promptCalls.length, 1);
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /Round 2 of 12 instruction:/,
  );
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /If an inbox message already gives you a concrete delegated task, execute that task directly instead of spending the round on extra workspace inspection\./,
  );
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /If the delegated task depends on newer shared scaffold that is missing from your branch, first sync the latest `run\/apple\/main` into your worktree before continuing\./,
  );
  assert.match(
    promptCalls[0]?.prompt ?? "",
    /1\. From leader \[status\]: Build the encounter screen skeleton and report back with the PR URL if you open one\./,
  );
  assert.deepEqual(result.output, {
    messages: [],
    summary: "Implemented the delegated encounter screen slice.",
  });
});

test("runSoloNodeRound writes a validated node turn record to trajectory JSONL", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-run-"));

  const result = await runSoloNodeRound({
    runId: "solo",
    round: 2,
    workspace: {
      runDir,
      mainWorktreeDir: path.join(runDir, "main"),
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runConfig: {
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
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    runner: async () => ({
      stdout: [
        JSON.stringify({
          type: "tool_call",
          part: {
            tool: "bash",
            input: "gh pr review 41 --approve",
            status: "success",
            duration_ms: 1820,
          },
        }),
        JSON.stringify({
          type: "text",
          part: {
            type: "text",
            text: JSON.stringify({
              messages: [
                {
                  to: "leader",
                  tag: "status",
                  content: "Tracked progress for the solo build.",
                },
              ],
              summary: "Tracked solo progress.",
            }),
            metadata: { openai: { phase: "final_answer" } },
          },
        }),
        JSON.stringify({
          type: "step_finish",
          part: { tokens: { input: 144, output: 55 } },
        }),
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    }),
  });

  const outputPath = path.join(runDir, "trajectory", "nodes", "leader.jsonl");
  const jsonl = await readFile(outputPath, "utf8");
  const record = NodeTurnRecord.parse(JSON.parse(jsonl.trim()));

  assert.deepEqual(result.output, {
    messages: [
      {
        to: "leader",
        tag: "status",
        content: "Tracked progress for the solo build.",
      },
    ],
    summary: "Tracked solo progress.",
  });
  assert.equal(record.run_id, "solo");
  assert.equal(record.node_id, "leader");
  assert.equal(record.round, 2);
  assert.equal(record.turn, 1);
  assert.equal(record.schema_version, SCHEMA_VERSION);
  assert.deepEqual(record.output, result.output);
  assert.deepEqual(record.tokens, { in: 144, out: 55 });
  assert.equal(record.model, "openai/gpt-5.4");
  assert.equal(record.cost_usd, 0);
  assert.equal(record.prompt_refs.length, 0);
  assert.deepEqual(record.tool_calls, [
    {
      tool: "bash",
      input: "gh pr review 41 --approve",
      status: "success",
      duration_ms: 1820,
    },
  ]);
  assert.ok(record.latency_ms >= 0);
  assert.match(record.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("runNodeRoundWithTimeout skips a timed out node round and records a failure event", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-timeout-"));
  let roundExecuted = false;

  const result = await runNodeRoundWithTimeout({
    runId: "apple",
    runDir,
    round: 2,
    nodeId: "n1",
    perRoundTimeoutMs: 10,
    execute: async () => {
      roundExecuted = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { messages: [], summary: "finished too late" };
    },
  });

  assert.equal(roundExecuted, true);
  assert.equal(result.completed, false);
  assert.equal(result.reason, "timeout");
  assert.equal(result.output, null);

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const jsonl = await readFile(eventsPath, "utf8");
  const event = OrchestratorEvent.parse(JSON.parse(jsonl.trim()));

  assert.equal(event.type, "failure");
  assert.equal(event.run_id, "apple");
  assert.equal(event.round, 2);
  assert.equal(event.node_id, "n1");
  assert.equal(event.failure_kind, "timeout");
  assert.match(event.detail, /exceeded per-round timeout of 10ms/);
  assert.equal(event.schema_version, SCHEMA_VERSION);
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("runNodeRoundWithTimeout aborts the in-flight execution when the round times out", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-timeout-abort-"));
  let receivedSignal: AbortSignal | undefined;
  let abortObserved = false;

  const result = await runNodeRoundWithTimeout({
    runId: "apple",
    runDir,
    round: 2,
    nodeId: "n1",
    perRoundTimeoutMs: 10,
    execute: async (signal?: AbortSignal) => {
      receivedSignal = signal;

      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          "abort",
          () => {
            abortObserved = true;
            resolve();
          },
          { once: true },
        );
      });

      return { messages: [], summary: "aborted" };
    },
  });

  assert.equal(result.completed, false);
  assert.equal(result.reason, "timeout");
  assert.ok(receivedSignal instanceof AbortSignal);
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(abortObserved, true);
});

test("runNodeRoundWithTimeout clears its timer after a successful round", async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduledTimers: Array<{ id: { fake: true } }> = [];
  const clearedTimers: Array<{ fake: true }> = [];

  global.setTimeout = (() => {
    const timer: { fake: true } = { fake: true };
    scheduledTimers.push({ id: timer });
    return timer as unknown as NodeJS.Timeout;
  }) as unknown as typeof setTimeout;
  global.clearTimeout = ((timer: NodeJS.Timeout | number) => {
    clearedTimers.push(timer as unknown as { fake: true });
  }) as typeof clearTimeout;

  try {
    const result = await runNodeRoundWithTimeout({
      runId: "solo",
      runDir: "/tmp/org-bench/runs/solo",
      round: 1,
      nodeId: "leader",
      perRoundTimeoutMs: 120_000,
      execute: async () => ({ messages: [], summary: "ok" }),
    });

    assert.equal(result.completed, true);
    assert.equal(scheduledTimers.length, 1);
    assert.deepEqual(clearedTimers, [scheduledTimers[0]?.id]);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("runSoloNodeRound emits a pr_activity_unsummarized event when gh PR activity is not summarized in outbound messages", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-pr-summary-"),
  );

  await runSoloNodeRound({
    runId: "solo",
    round: 3,
    workspace: {
      runDir,
      mainWorktreeDir: path.join(runDir, "main"),
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runConfig: {
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
      seed: 1,
      maxRounds: 12,
      perRoundTimeoutMs: 120_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    runner: async () => ({
      stdout: [
        JSON.stringify({
          type: "tool_call",
          part: {
            tool: "bash",
            input: "gh pr review 41 --approve",
            status: "success",
            duration_ms: 1820,
          },
        }),
        JSON.stringify({
          type: "text",
          part: {
            type: "text",
            text: JSON.stringify({
              messages: [
                {
                  to: "leader",
                  tag: "status",
                  content: "Reviewed the gameplay PR and approved it.",
                },
              ],
              summary: "Reviewed the latest PR.",
            }),
            metadata: { openai: { phase: "final_answer" } },
          },
        }),
        JSON.stringify({
          type: "step_finish",
          part: { tokens: { input: 144, output: 55 } },
        }),
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    }),
  });

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const jsonl = await readFile(eventsPath, "utf8");
  const event = OrchestratorEvent.parse(JSON.parse(jsonl.trim()));

  assert.equal(event.type, "pr_activity_unsummarized");
  assert.equal(event.run_id, "solo");
  assert.equal(event.round, 3);
  assert.equal(event.node_id, "leader");
  assert.match(event.detail, /gh pr review 41 --approve/i);
});

test("verifyRunMainMergeAuthority flags non-leader gh pr merge activity for leader-only topologies", () => {
  const violations = verifyRunMainMergeAuthority({
    topology: {
      slug: "apple",
      name: "Apple",
      nodes: ["leader", "n1"],
      edges: [{ from: "leader", to: "n1", bidir: true }],
      leader: "leader",
      developers: ["n1"],
      integrators: ["leader"],
      culture: null,
    },
    nodeTurns: [
      {
        nodeId: "leader",
        toolCalls: [
          {
            tool: "bash",
            input: "gh pr merge 41 --squash --delete-branch",
            status: "success",
          },
        ],
      },
      {
        nodeId: "n1",
        toolCalls: [
          {
            tool: "bash",
            input: "gh pr merge 42 --merge",
            status: "success",
          },
        ],
      },
    ],
  });

  assert.deepEqual(violations, [
    {
      nodeId: "n1",
      toolCall: "gh pr merge 42 --merge",
      reason:
        "Node n1 is not in topology.integrators and is not allowed to merge PRs into main.",
    },
  ]);
});

test("runRoundParallel executes all node rounds concurrently and preserves node ordering in results", async () => {
  const startedNodeIds: string[] = [];
  let releaseBarrier: (() => void) | null = null;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  const result = await Promise.race([
    runRoundParallel({
      runId: "apple",
      runDir: "/tmp/org-bench-round-loop",
      round: 3,
      nodeIds: ["leader", "n1"],
      perRoundTimeoutMs: 1_000,
      executeNodeRound: async (nodeId) => {
        startedNodeIds.push(nodeId);

        if (startedNodeIds.length === 2) {
          releaseBarrier?.();
        }

        await barrier;

        return {
          nodeId,
          summary: `finished ${nodeId}`,
        };
      },
    }),
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), 100);
    }),
  ]);

  assert.notEqual(result, "timeout");
  assert.deepEqual(startedNodeIds, ["leader", "n1"]);
  assert.deepEqual(result, [
    {
      nodeId: "leader",
      completed: true,
      reason: null,
      output: {
        nodeId: "leader",
        summary: "finished leader",
      },
    },
    {
      nodeId: "n1",
      completed: true,
      reason: null,
      output: {
        nodeId: "n1",
        summary: "finished n1",
      },
    },
  ]);
});

test("selectActiveNodesForRound wakes only the leader in round 1", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-select-round1-"),
  );
  await mkdir(path.join(runDir, "inbox"), { recursive: true });
  // Seed inbox messages for a non-leader to prove round 1 still ignores them.
  await writeFile(
    path.join(runDir, "inbox", "n1.jsonl"),
    JSON.stringify({
      run_id: "topo",
      round: 0,
      from: "leader",
      to: "n1",
      tag: "status",
      content: "early hint",
      schema_version: 1,
      ts: new Date().toISOString(),
    }) + "\n",
    "utf8",
  );

  const active = await selectActiveNodesForRound({
    runDir,
    round: 1,
    nodes: ["leader", "n1", "n2"],
    leader: "leader",
  });

  assert.deepEqual(active, ["leader"]);
});

test("selectActiveNodesForRound wakes only nodes with non-empty inboxes in later rounds", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-select-roundN-"),
  );
  await mkdir(path.join(runDir, "inbox"), { recursive: true });
  const envelope = (to: string) =>
    JSON.stringify({
      run_id: "topo",
      round: 1,
      from: "leader",
      to,
      tag: "status",
      content: "do the thing",
      schema_version: 1,
      ts: new Date().toISOString(),
    }) + "\n";
  await writeFile(path.join(runDir, "inbox", "n1.jsonl"), envelope("n1"), "utf8");
  // n2 is deliberately empty (received no messages this round).
  await writeFile(path.join(runDir, "inbox", "n2.jsonl"), "", "utf8");
  await writeFile(path.join(runDir, "inbox", "n3.jsonl"), envelope("n3"), "utf8");

  const active = await selectActiveNodesForRound({
    runDir,
    round: 2,
    nodes: ["leader", "n1", "n2", "n3"],
    leader: "leader",
  });

  assert.deepEqual(active.sort(), ["n1", "n3"]);
});

test("selectActiveNodesForRound falls back to the leader when no node has inbox messages", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-select-fallback-"),
  );
  await mkdir(path.join(runDir, "inbox"), { recursive: true });
  // All inboxes empty: nobody received anything last round.
  await writeFile(path.join(runDir, "inbox", "leader.jsonl"), "", "utf8");
  await writeFile(path.join(runDir, "inbox", "n1.jsonl"), "", "utf8");

  const active = await selectActiveNodesForRound({
    runDir,
    round: 3,
    nodes: ["leader", "n1"],
    leader: "leader",
  });

  assert.deepEqual(active, ["leader"]);
});

test("runBenchmark executes a multi-node round loop with per-node inbox delivery and finalize hooks", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-apple-bench-"));
  const workspace = {
    runDir,
    mainWorktreeDir: path.join(runDir, "main"),
    mainBranch: "run/apple/main",
    remoteName: "origin",
  };
  const nodeCalls: Array<{
    round: number;
    nodeId: string;
    inboxMessages: Array<{ from: string; content: string }>;
  }> = [];

  const result = await runBenchmark({
    repoRoot: "/repo",
    runId: "apple",
    runConfig: {
      topology: {
        slug: "apple",
        name: "Apple",
        nodes: ["leader", "n1"],
        edges: [{ from: "leader", to: "n1", bidir: true }],
        leader: "leader",
        developers: ["n1"],
        integrators: ["leader"],
        culture: null,
      },
      seed: 1,
      maxRounds: 3,
      perRoundTimeoutMs: 60_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:3210",
      createSession: async ({ directory }) => ({
        id: `session:${directory}`,
      }),
      deleteSession: async () => true,
      sendPrompt: async () => {
        throw new Error("sendPrompt should not be called in this regression test");
      },
    },
    initWorkspace: async () => workspace,
    initializeWorktrees: async () => [
      {
        nodeId: "leader",
        agentName: "Alex",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Alex"),
        branch: "run/apple/Alex",
        remoteName: "origin",
      },
      {
        nodeId: "n1",
        agentName: "Blair",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Blair"),
        branch: "run/apple/Blair",
        remoteName: "origin",
      },
    ],
    runRound: async ({ round, nodeId, inboxMessages }) => {
      nodeCalls.push({
        round,
        nodeId,
        inboxMessages: inboxMessages.map((message) => ({
          from: message.from,
          content: message.content,
        })),
      });

      if (round === 1 && nodeId === "leader") {
        return {
          sessionFile: path.join(runDir, "sessions", "leader.json"),
          model: defaultModels.node.model,
          output: {
            messages: [
              {
                to: "n1",
                tag: "decompose",
                content: "Take the card data and rules copy.",
              },
            ],
            summary: "Delegated the first worker task.",
          },
          toolCalls: [],
          tokens: { in: 10, out: 5 },
        };
      }

      if (round === 3 && nodeId === "leader") {
        return {
          sessionFile: path.join(runDir, "sessions", "leader.json"),
          model: defaultModels.node.model,
          output: {
            messages: [
              {
                to: "n1",
                tag: "status",
                content: "Declaring final submission for evaluation.",
              },
            ],
            summary: "Submitting the integrated artifact.",
          },
          toolCalls: [],
          tokens: { in: 8, out: 4 },
        };
      }

      return {
        sessionFile: path.join(runDir, "sessions", `${nodeId}.json`),
        model: defaultModels.node.model,
        output: {
          messages: [],
          summary: `Finished ${nodeId} round ${round}.`,
        },
        toolCalls: [],
        tokens: { in: 3, out: 2 },
      };
    },
    snapshotPullRequests: async () => [],
    publishArtifact: async () => {
      const artifactDir = path.join(runDir, "artifact");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(path.join(artifactDir, "index.html"), "<html></html>", "utf8");
      return artifactDir;
    },
    evaluateArtifact: async () =>
      ({
        artifactDir: path.join(runDir, "artifact"),
        trajectoryDir: path.join(runDir, "artifact", "trajectory"),
        scenarios: [],
        summary: { passed: 0, total: 0, passRate: 0 },
      }) as never,
    judgeArtifact: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        model: defaultModels.judge.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        rubric: {
          gameplay_completeness: 3,
          learnability: 3,
          content_cohesion: 3,
          visual_polish: 3,
          state_legibility: 3,
        },
        rationale: "stub",
      }) as never,
    analyzeTrajectory: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        model: defaultModels.analyst.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        narrative: "stub",
        observations: {
          edge_utilization: [],
          decomposition: {
            by_sender: [],
            orphaned: [],
          },
          idle_neighbors: [],
          patch_churn: [],
          incidents: [],
        },
      }) as never,
    aggregateMeta: async () => ({ schema_version: SCHEMA_VERSION } as MetaJson),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
  });

  assert.equal(result.roundsExecuted, 3);
  assert.equal(result.submitted, true);
  // Round 1 wakes only the leader; round 2 wakes only n1 (its inbox has the
  // leader's delegation); round 3 falls back to the leader because n1 replied
  // with no outbound messages, and the leader uses that slot to submit.
  assert.deepEqual(nodeCalls, [
    { round: 1, nodeId: "leader", inboxMessages: [] },
    {
      round: 2,
      nodeId: "n1",
      inboxMessages: [
        { from: "leader", content: "Take the card data and rules copy." },
      ],
    },
    { round: 3, nodeId: "leader", inboxMessages: [] },
  ]);
});

test("runBenchmark starts benchmark-owned opencode serve after workspace init using the main worktree cwd", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-apple-serve-cwd-"));
  const workspace = {
    runDir,
    mainWorktreeDir: path.join(runDir, "main"),
    mainBranch: "run/apple/main",
    remoteName: "origin",
  };
  const startCalls: Array<{ cwd: string; pidFile?: string }> = [];

  const result = await runBenchmark({
    repoRoot: "/repo",
    runId: "apple",
    runConfig: {
      topology: {
        slug: "apple",
        name: "Apple",
        nodes: ["leader", "n1"],
        edges: [{ from: "leader", to: "n1", bidir: true }],
        leader: "leader",
        developers: ["n1"],
        integrators: ["leader"],
        culture: null,
      },
      seed: 1,
      maxRounds: 1,
      perRoundTimeoutMs: 60_000,
      brief: "Leader-only benchmark brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      createSession: async ({ directory }) => ({
        id: `session:${directory}`,
      }),
      deleteSession: async () => true,
      sendPrompt: async () => {
        throw new Error("sendPrompt should not be called in this regression test");
      },
    },
    startOpenCodeServe: async ({ cwd, pidFile }) => {
      startCalls.push({ cwd, pidFile });
      return {
        baseUrl: "http://127.0.0.1:3210",
        child: createMockOpenCodeServeProcess(),
        closed: false,
        cwd,
        port: 3210,
        readyPromise: Promise.resolve(),
        stderr: "",
        stdout: "",
        pidFile,
      };
    },
    shutdownOpenCodeServe: async () => undefined,
    initWorkspace: async () => workspace,
    initializeWorktrees: async () => [
      {
        nodeId: "leader",
        agentName: "Alex",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Alex"),
        branch: "run/apple/Alex",
        remoteName: "origin",
      },
      {
        nodeId: "n1",
        agentName: "Blair",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Blair"),
        branch: "run/apple/Blair",
        remoteName: "origin",
      },
    ],
    runRound: async ({ nodeId }) => ({
      sessionFile: path.join(runDir, "sessions", `${nodeId}.json`),
      model: defaultModels.node.model,
      output: {
        messages: [],
        summary: `Finished ${nodeId}.`,
      },
      toolCalls: [],
      tokens: { in: 1, out: 1 },
    }),
    snapshotPullRequests: async () => [],
    publishArtifact: async () => {
      const artifactDir = path.join(runDir, "artifact");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(path.join(artifactDir, "index.html"), "<html></html>", "utf8");
      return artifactDir;
    },
    evaluateArtifact: async () =>
      ({
        artifactDir: path.join(runDir, "artifact"),
        trajectoryDir: path.join(runDir, "artifact", "trajectory"),
        scenarios: [],
        summary: { passed: 0, total: 0, passRate: 0 },
      }) as never,
    judgeArtifact: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        model: defaultModels.judge.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        rubric: {
          gameplay_completeness: 3,
          learnability: 3,
          content_cohesion: 3,
          visual_polish: 3,
          state_legibility: 3,
        },
        rationale: "stub",
      }) as never,
    analyzeTrajectory: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        model: defaultModels.analyst.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        narrative: "stub",
        observations: {
          edge_utilization: [],
          decomposition: {
            by_sender: [],
            orphaned: [],
          },
          idle_neighbors: [],
          patch_churn: [],
          incidents: [],
        },
      }) as never,
    aggregateMeta: async () => ({ schema_version: SCHEMA_VERSION } as MetaJson),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
  });

  assert.equal(result.roundsExecuted, 1);
  assert.deepEqual(startCalls, [
    {
      cwd: workspace.mainWorktreeDir,
      pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
    },
  ]);
});

test("runBenchmark runs preflight closeOpenPullRequests before initWorkspace so stale PRs never interfere", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-apple-preflight-"),
  );
  const workspace = {
    runDir,
    mainWorktreeDir: path.join(runDir, "main"),
    mainBranch: "run/apple/main",
    remoteName: "origin",
  };
  const callOrder: string[] = [];
  const closeCalls: string[] = [];

  await runBenchmark({
    repoRoot: "/repo",
    runId: "apple",
    runConfig: {
      topology: {
        slug: "apple",
        name: "Apple",
        nodes: ["leader", "n1"],
        edges: [{ from: "leader", to: "n1", bidir: true }],
        leader: "leader",
        developers: ["n1"],
        integrators: ["leader"],
        culture: null,
      },
      seed: 1,
      maxRounds: 1,
      perRoundTimeoutMs: 60_000,
      brief: "Preflight bench brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:3210",
      createSession: async () => ({ id: "session-pref" }),
      deleteSession: async () => true,
      sendPrompt: async () => {
        throw new Error("sendPrompt should not be called in this preflight test");
      },
    },
    closeOpenPullRequests: async ({ runId }) => {
      callOrder.push("close_prs");
      closeCalls.push(runId);
      return [];
    },
    initWorkspace: async () => {
      callOrder.push("initWorkspace");
      return workspace;
    },
    initializeWorktrees: async () => [
      {
        nodeId: "leader",
        agentName: "Alex",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Alex"),
        branch: "run/apple/Alex",
        remoteName: "origin",
      },
      {
        nodeId: "n1",
        agentName: "Blair",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Blair"),
        branch: "run/apple/Blair",
        remoteName: "origin",
      },
    ],
    runRound: async ({ nodeId }) => ({
      sessionFile: path.join(runDir, "sessions", `${nodeId}.json`),
      model: defaultModels.node.model,
      output: {
        messages: [],
        summary: `Finished ${nodeId}.`,
      },
      toolCalls: [],
      tokens: { in: 1, out: 1 },
    }),
    snapshotPullRequests: async () => [],
    publishArtifact: async () => {
      const artifactDir = path.join(runDir, "artifact");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        path.join(artifactDir, "index.html"),
        "<html></html>",
        "utf8",
      );
      return artifactDir;
    },
    evaluateArtifact: async () =>
      ({
        artifactDir: path.join(runDir, "artifact"),
        trajectoryDir: path.join(runDir, "artifact", "trajectory"),
        scenarios: [],
        summary: { passed: 0, total: 0, passRate: 0 },
      }) as never,
    judgeArtifact: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        model: defaultModels.judge.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        rubric: {
          gameplay_completeness: 3,
          learnability: 3,
          content_cohesion: 3,
          visual_polish: 3,
          state_legibility: 3,
        },
        rationale: "stub",
      }) as never,
    analyzeTrajectory: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        model: defaultModels.analyst.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        narrative: "stub",
        observations: {
          edge_utilization: [],
          decomposition: {
            by_sender: [],
            orphaned: [],
          },
          idle_neighbors: [],
          patch_churn: [],
          incidents: [],
        },
      }) as never,
    aggregateMeta: async () => ({ schema_version: SCHEMA_VERSION } as MetaJson),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
  });

  assert.equal(
    callOrder[0],
    "close_prs",
    "preflight close_prs must be the first step so stale PRs are cleared before any workspace setup",
  );
  assert.equal(callOrder[1], "initWorkspace");
  // Still called at finalize, so close_prs appears at least twice.
  assert.ok(
    closeCalls.filter((runId) => runId === "apple").length >= 2,
    "closeOpenPullRequests should be called at preflight AND at finalize",
  );
});

test("runBenchmark passes XDG_DATA_HOME into startOpenCodeServe so topology runs never share opencode state", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-apple-xdg-"),
  );
  const workspace = {
    runDir,
    mainWorktreeDir: path.join(runDir, "main"),
    mainBranch: "run/apple/main",
    remoteName: "origin",
  };
  const startCalls: Array<{
    cwd: string;
    pidFile?: string;
    xdgDataHome?: string;
  }> = [];

  await runBenchmark({
    repoRoot: "/repo",
    runId: "apple",
    runConfig: {
      topology: {
        slug: "apple",
        name: "Apple",
        nodes: ["leader", "n1"],
        edges: [{ from: "leader", to: "n1", bidir: true }],
        leader: "leader",
        developers: ["n1"],
        integrators: ["leader"],
        culture: null,
      },
      seed: 1,
      maxRounds: 1,
      perRoundTimeoutMs: 60_000,
      brief: "XDG bench brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      createSession: async ({ directory }) => ({
        id: `session:${directory}`,
      }),
      deleteSession: async () => true,
      sendPrompt: async () => {
        throw new Error("sendPrompt should not be called in this XDG test");
      },
    },
    startOpenCodeServe: async ({
      cwd,
      pidFile,
      env,
    }: {
      cwd: string;
      pidFile?: string;
      env?: NodeJS.ProcessEnv;
    }) => {
      startCalls.push({
        cwd,
        pidFile,
        xdgDataHome:
          typeof env?.XDG_DATA_HOME === "string"
            ? env.XDG_DATA_HOME
            : undefined,
      });
      return {
        baseUrl: "http://127.0.0.1:3211",
        child: createMockOpenCodeServeProcess(),
        closed: false,
        cwd,
        port: 3211,
        readyPromise: Promise.resolve(),
        stderr: "",
        stdout: "",
        pidFile,
      };
    },
    shutdownOpenCodeServe: async () => undefined,
    closeOpenPullRequests: async () => [],
    initWorkspace: async () => workspace,
    initializeWorktrees: async () => [
      {
        nodeId: "leader",
        agentName: "Alex",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Alex"),
        branch: "run/apple/Alex",
        remoteName: "origin",
      },
      {
        nodeId: "n1",
        agentName: "Blair",
        runDir,
        mainWorktreeDir: workspace.mainWorktreeDir,
        worktreeDir: path.join(runDir, "worktrees", "Blair"),
        branch: "run/apple/Blair",
        remoteName: "origin",
      },
    ],
    runRound: async ({ nodeId }) => ({
      sessionFile: path.join(runDir, "sessions", `${nodeId}.json`),
      model: defaultModels.node.model,
      output: {
        messages: [],
        summary: `Finished ${nodeId}.`,
      },
      toolCalls: [],
      tokens: { in: 1, out: 1 },
    }),
    snapshotPullRequests: async () => [],
    publishArtifact: async () => {
      const artifactDir = path.join(runDir, "artifact");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        path.join(artifactDir, "index.html"),
        "<html></html>",
        "utf8",
      );
      return artifactDir;
    },
    evaluateArtifact: async () =>
      ({
        artifactDir: path.join(runDir, "artifact"),
        trajectoryDir: path.join(runDir, "artifact", "trajectory"),
        scenarios: [],
        summary: { passed: 0, total: 0, passRate: 0 },
      }) as never,
    judgeArtifact: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        model: defaultModels.judge.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        rubric: {
          gameplay_completeness: 3,
          learnability: 3,
          content_cohesion: 3,
          visual_polish: 3,
          state_legibility: 3,
        },
        rationale: "stub",
      }) as never,
    analyzeTrajectory: async () =>
      ({
        run_id: "apple",
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        model: defaultModels.analyst.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        narrative: "stub",
        observations: {
          edge_utilization: [],
          decomposition: {
            by_sender: [],
            orphaned: [],
          },
          idle_neighbors: [],
          patch_churn: [],
          incidents: [],
        },
      }) as never,
    aggregateMeta: async () => ({ schema_version: SCHEMA_VERSION } as MetaJson),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
  });

  assert.deepEqual(startCalls, [
    {
      cwd: workspace.mainWorktreeDir,
      pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
      xdgDataHome: path.join(workspace.runDir, ".xdg"),
    },
  ]);
});

test("detectLeaderSubmission records a submission event only for leader-declared outbound submission messages", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-submission-"));

  const leaderDetected = await detectLeaderSubmission({
    runId: "apple",
    runDir,
    round: 4,
    leaderNodeId: "leader",
    nodeId: "leader",
    messages: [
      {
        to: "n1",
        tag: "deliver",
        content:
          "Declaring final submission for evaluation. The site is ready.",
      },
    ],
  });

  assert.equal(leaderDetected, true);

  const nonLeaderDetected = await detectLeaderSubmission({
    runId: "apple",
    runDir,
    round: 5,
    leaderNodeId: "leader",
    nodeId: "n1",
    messages: [
      {
        to: "leader",
        tag: "status",
        content: "I think we should submit this round.",
      },
    ],
  });

  assert.equal(nonLeaderDetected, false);

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const lines = (await readFile(eventsPath, "utf8"))
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);

  assert.equal(lines.length, 1);

  const event = OrchestratorEvent.parse(JSON.parse(lines[0]!));
  assert.equal(event.type, "submission");
  assert.equal(event.run_id, "apple");
  assert.equal(event.round, 4);
  assert.equal(event.node_id, "leader");
  assert.match(event.detail, /Declaring final submission for evaluation/i);
  assert.equal(event.schema_version, SCHEMA_VERSION);
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("detectLeaderSubmission ignores messages that explicitly say submission has not happened yet", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-submission-negative-"),
  );

  const detected = await detectLeaderSubmission({
    runId: "solo",
    runDir,
    round: 1,
    leaderNodeId: "leader",
    nodeId: "leader",
    messages: [
      {
        to: "leader",
        tag: "status",
        content:
          "Scaffolded the empty worktree with an index.html wrapping a WebGL canvas, a vanilla JS render loop, and an assets directory. This establishes the required stack and project structure for the duel TCG game; no final submission yet.",
      },
    ],
  });

  assert.equal(detected, false);

  await assert.rejects(
    readFile(path.join(runDir, "trajectory", "events.jsonl"), "utf8"),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
});

test("detectUnsummarizedPrActivity records an event only when gh PR activity lacks an outbound PR URL summary", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-pr-activity-"));

  const unsummarizedDetected = await detectUnsummarizedPrActivity({
    runId: "apple",
    runDir,
    round: 4,
    nodeId: "n1",
    toolCalls: [
      {
        tool: "bash",
        input: "gh pr review 41 --approve",
        status: "success",
      },
    ],
    messages: [
      {
        to: "leader",
        tag: "status",
        content: "Reviewed the latest gameplay PR and approved it.",
      },
    ],
  });

  assert.equal(unsummarizedDetected, true);

  const summarizedDetected = await detectUnsummarizedPrActivity({
    runId: "apple",
    runDir,
    round: 5,
    nodeId: "n1",
    toolCalls: [
      {
        tool: "bash",
        input: "gh pr comment 41 --body 'Looks good'",
        status: "success",
      },
    ],
    messages: [
      {
        to: "leader",
        tag: "review",
        content:
          "PR activity summary: https://github.com/kunchenguid/org-bench/pull/41 - approved after checking the play-page fixes.",
      },
    ],
  });

  assert.equal(summarizedDetected, false);

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const lines = (await readFile(eventsPath, "utf8"))
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);

  assert.equal(lines.length, 1);

  const event = OrchestratorEvent.parse(JSON.parse(lines[0]!));
  assert.equal(event.type, "pr_activity_unsummarized");
  assert.equal(event.run_id, "apple");
  assert.equal(event.round, 4);
  assert.equal(event.node_id, "n1");
  assert.match(event.detail, /gh pr review 41 --approve/i);
  assert.equal(event.schema_version, SCHEMA_VERSION);
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("enforceRunBudgetCaps writes a cap_exceeded event when token budget is exceeded", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-budget-"));

  const exceeded = await enforceRunBudgetCaps({
    runId: "solo",
    runDir,
    round: 3,
    runBudget: {
      tokens: 100,
      wallClockMs: 10_800_000,
    },
    totals: {
      tokens: 101,
      wallClockMs: 5_000,
    },
  });

  assert.equal(exceeded, true);

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const jsonl = await readFile(eventsPath, "utf8");
  const event = OrchestratorEvent.parse(JSON.parse(jsonl.trim()));

  assert.equal(event.type, "cap_exceeded");
  assert.equal(event.run_id, "solo");
  assert.equal(event.round, 3);
  assert.equal(event.cap, "tokens");
  assert.equal(event.actual, 101);
  assert.equal(event.limit, 100);
  assert.equal(event.schema_version, SCHEMA_VERSION);
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("enforceRunBudgetCaps writes a cap_exceeded event when wall-clock budget is exceeded", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-budget-"));

  const exceeded = await enforceRunBudgetCaps({
    runId: "solo",
    runDir,
    round: 4,
    runBudget: {
      tokens: 5_000_000,
      wallClockMs: 2_000,
    },
    totals: {
      tokens: 99,
      wallClockMs: 2_001,
    },
  });

  assert.equal(exceeded, true);

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const jsonl = await readFile(eventsPath, "utf8");
  const event = OrchestratorEvent.parse(JSON.parse(jsonl.trim()));

  assert.equal(event.type, "cap_exceeded");
  assert.equal(event.run_id, "solo");
  assert.equal(event.round, 4);
  assert.equal(event.cap, "wall_clock_ms");
  assert.equal(event.actual, 2_001);
  assert.equal(event.limit, 2_000);
  assert.equal(event.schema_version, SCHEMA_VERSION);
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("checkRunBudgetBetweenRounds accumulates round usage before enforcing the run budget", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-budget-between-rounds-"),
  );

  const result = await checkRunBudgetBetweenRounds({
    runId: "apple",
    runDir,
    round: 3,
    runBudget: {
      tokens: 200,
      wallClockMs: 1_000,
    },
    previousTotals: {
      tokens: 150,
      wallClockMs: 600,
    },
    roundUsage: {
      tokens: 60,
      wallClockMs: 200,
    },
  });

  assert.equal(result.exceeded, true);
  assert.deepEqual(result.totals, {
    tokens: 210,
    wallClockMs: 800,
  });

  const eventsPath = path.join(runDir, "trajectory", "events.jsonl");
  const jsonl = await readFile(eventsPath, "utf8");
  const event = OrchestratorEvent.parse(JSON.parse(jsonl.trim()));

  assert.equal(event.type, "cap_exceeded");
  assert.equal(event.run_id, "apple");
  assert.equal(event.round, 3);
  assert.equal(event.cap, "tokens");
  assert.equal(event.actual, 210);
  assert.equal(event.limit, 200);
});

test("snapshotRunPullRequests writes frozen PR snapshots for the run label", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-prs-"));
  const calls: Array<{
    command: string;
    args: string[];
    cwd?: string;
  }> = [];
  const runner: CommandRunner = async ({ command, args, cwd }) => {
    calls.push({ command, args, cwd });

    if (args[0] === "pr" && args[1] === "list") {
      return {
        stdout: JSON.stringify([{ number: 41 }]),
        stderr: "",
        exitCode: 0,
      };
    }

    if (args[0] === "pr" && args[1] === "view") {
      return {
        stdout: JSON.stringify({
          number: 41,
          url: "https://github.com/kunchenguid/org-bench/pull/41",
          author: {
            login: "kunchenguid",
          },
          title: "Add play page hand rendering",
          body: "Author: Jamie (worker, node n2)\n\nAdds playable hand rendering.",
          reviewRequests: [
            {
              requestedReviewer: {
                login: "kunchenguid",
              },
            },
          ],
          reviews: [
            {
              author: {
                login: "kunchenguid",
              },
              body: "**Riley (leader):** Looks good to me.",
              state: "APPROVED",
              submittedAt: "2026-04-16T12:12:00.000Z",
            },
          ],
          mergedAt: "2026-04-16T12:14:00.000Z",
          closedAt: "2026-04-16T12:14:00.000Z",
          createdAt: "2026-04-16T12:09:00.000Z",
          comments: [
            {
              author: {
                login: "kunchenguid",
              },
              body: "**Riley (leader):** Merging this after a quick visual pass.",
              createdAt: "2026-04-16T12:13:00.000Z",
            },
          ],
        }),
        stderr: "",
        exitCode: 0,
      };
    }

    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };

  const snapshots = await snapshotRunPullRequests({
    runId: "solo",
    runDir,
    runner,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.command, "gh");
  assert.deepEqual(calls[0]?.args, [
    "pr",
    "list",
    "--label",
    "run:solo",
    "--json",
    "number",
    "--limit",
    "1000",
  ]);
  assert.equal(calls[1]?.command, "gh");
  assert.deepEqual(calls[1]?.args, [
    "pr",
    "view",
    "41",
    "--json",
    "number,url,author,title,body,reviewRequests,reviews,mergedAt,closedAt,createdAt,comments",
  ]);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.pr_number, 41);
  assert.equal(snapshots[0]?.author.agent_name, "Jamie");
  assert.equal(snapshots[0]?.author.node_id, "n2");
  assert.equal(snapshots[0]?.reviewers[0]?.agent_name, "kunchenguid");
  assert.equal(snapshots[0]?.reviewers[0]?.node_id, "unknown");
  assert.equal(snapshots[0]?.comments.length, 2);
  assert.deepEqual(snapshots[0]?.comments[0], {
    author: {
      agent_name: "Riley",
      node_id: "unknown",
    },
    body: "**Riley (leader):** Looks good to me.",
    ts: "2026-04-16T12:12:00.000Z",
  });
  assert.deepEqual(snapshots[0]?.comments[1], {
    author: {
      agent_name: "Riley",
      node_id: "unknown",
    },
    body: "**Riley (leader):** Merging this after a quick visual pass.",
    ts: "2026-04-16T12:13:00.000Z",
  });
  assert.deepEqual(
    snapshots[0]?.state_timeline.map((entry: { state: string }) => entry.state),
    ["opened", "approved", "merged", "closed"],
  );

  const snapshotPath = path.join(runDir, "trajectory", "prs", "41.json");
  const written = PRSnapshot.parse(
    JSON.parse(await readFile(snapshotPath, "utf8")),
  );

  assert.deepEqual(written, snapshots[0]);
});

test("snapshotRunPullRequests returns an empty list when the run has no PRs", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "org-bench-prs-"));

  const snapshots = await snapshotRunPullRequests({
    runId: "solo",
    runDir,
    runner: async () => ({
      stdout: "[]",
      stderr: "",
      exitCode: 0,
    }),
  });

  assert.deepEqual(snapshots, []);
  await assert.rejects(
    () => readFile(path.join(runDir, "trajectory", "prs", "41.json"), "utf8"),
    /ENOENT/,
  );
});

test("publishRunArtifact syncs the solo main worktree and copies its vanilla sources into docs/<topology>/", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "org-bench-publish-"));
  const repoRoot = path.join(sandboxDir, "repo");
  const runDir = path.join(repoRoot, "runs", "solo");
  const mainWorktreeDir = path.join(runDir, "main");
  const calls: Array<{
    command: string;
    args: string[];
    cwd?: string;
  }> = [];

  await mkdir(repoRoot, { recursive: true });
  await mkdir(path.join(mainWorktreeDir, "assets"), { recursive: true });
  await writeFile(
    path.join(mainWorktreeDir, "index.html"),
    "<html><body>solo source</body></html>",
  );
  await writeFile(
    path.join(mainWorktreeDir, "assets", "game.js"),
    "console.log('solo');\n",
  );

  const published = await publishRunArtifact({
    repoRoot,
    runId: "solo",
    topology: "solo",
    workspace: {
      runDir,
      mainWorktreeDir,
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runner: async ({ command, args, cwd }) => {
      calls.push({ command, args, cwd });

      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
      };
    },
  });

  assert.deepEqual(calls, [
    {
      command: "git",
      args: ["push", "origin", "run/solo/main"],
      cwd: mainWorktreeDir,
    },
    {
      command: "git",
      args: ["fetch", "origin", "run/solo/main"],
      cwd: mainWorktreeDir,
    },
    {
      command: "git",
      args: ["reset", "--hard", "origin/run/solo/main"],
      cwd: mainWorktreeDir,
    },
  ]);

  assert.equal(published, path.join(repoRoot, "docs", "solo"));
  assert.equal(
    await readFile(path.join(published, "index.html"), "utf8"),
    "<html><body>solo source</body></html>",
  );
  assert.equal(
    await readFile(path.join(published, "assets", "game.js"), "utf8"),
    "console.log('solo');\n",
  );
});

test("publishRunArtifact excludes git metadata and harness-only directories from the published artifact", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-publish-exclude-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const runDir = path.join(repoRoot, "runs", "solo");
  const mainWorktreeDir = path.join(runDir, "main");

  await mkdir(path.join(mainWorktreeDir, ".git"), { recursive: true });
  await mkdir(path.join(mainWorktreeDir, "node_modules", "leftover"), {
    recursive: true,
  });
  await mkdir(path.join(mainWorktreeDir, "dist"), { recursive: true });
  await mkdir(
    path.join(mainWorktreeDir, ".org-bench-artifacts", "trajectory"),
    { recursive: true },
  );
  await writeFile(
    path.join(mainWorktreeDir, ".git", "HEAD"),
    "ref: refs/heads/main\n",
  );
  await writeFile(
    path.join(mainWorktreeDir, "node_modules", "leftover", "x.js"),
    "noop\n",
  );
  await writeFile(path.join(mainWorktreeDir, "dist", "stale.html"), "stale\n");
  await writeFile(
    path.join(mainWorktreeDir, ".org-bench-artifacts", "trajectory", "a.jsonl"),
    "{}\n",
  );
  await writeFile(
    path.join(mainWorktreeDir, "index.html"),
    "<html>keep me</html>\n",
  );

  const published = await publishRunArtifact({
    repoRoot,
    runId: "solo",
    topology: "solo",
    workspace: {
      runDir,
      mainWorktreeDir,
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runner: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
  });

  assert.equal(
    await readFile(path.join(published, "index.html"), "utf8"),
    "<html>keep me</html>\n",
  );

  for (const excluded of [".git", "node_modules", "dist", ".org-bench-artifacts"]) {
    await assert.rejects(
      () => readFile(path.join(published, excluded, "placeholder"), "utf8"),
      /ENOENT/,
    );
  }
});

test("publishRunArtifact still publishes trajectory data when the worktree is empty", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-publish-missing-source-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const runDir = path.join(repoRoot, "runs", "solo");
  const mainWorktreeDir = path.join(runDir, "main");
  const trajectoryDir = path.join(runDir, "trajectory", "nodes");

  await mkdir(mainWorktreeDir, { recursive: true });
  await mkdir(trajectoryDir, { recursive: true });
  await writeFile(
    path.join(trajectoryDir, "leader.jsonl"),
    `${JSON.stringify({
      run_id: "solo",
      node_id: "leader",
      round: 1,
      turn: 1,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      prompt_refs: [],
      output: { messages: [], summary: "No source files yet." },
      tool_calls: [],
      tokens: { in: 1, out: 1 },
      model: "openai/gpt-5.4",
      latency_ms: 1,
      cost_usd: 0,
    })}\n`,
    "utf8",
  );

  const published = await publishRunArtifact({
    repoRoot,
    runId: "solo",
    topology: "solo",
    workspace: {
      runDir,
      mainWorktreeDir,
      mainBranch: "run/solo/main",
      remoteName: "origin",
    },
    runner: async () => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
    }),
  });

  assert.equal(
    await readFile(
      path.join(published, "trajectory", "nodes", "leader.jsonl"),
      "utf8",
    ),
    await readFile(path.join(trajectoryDir, "leader.jsonl"), "utf8"),
  );
  await assert.rejects(
    () => readFile(path.join(published, "index.html"), "utf8"),
    /ENOENT/,
  );
});

test("evaluatePublishedArtifact runs the evaluator against the published artifact directory", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "org-bench-evaluate-"));
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  let receivedArtifactDir: string | undefined;
  let receivedRunId: string | undefined;

  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, "index.html"), "<html></html>");

  const result = await evaluatePublishedArtifact({
    artifactDir,
    runId: "solo",
    evaluate: async ({
      artifactDir: inputArtifactDir,
      runId: inputRunId,
    }: {
      artifactDir: string;
      runId: string;
    }) => {
      receivedArtifactDir = inputArtifactDir;
      receivedRunId = inputRunId;

      return {
        artifactDir: inputArtifactDir,
        trajectoryDir: path.join(inputArtifactDir, "trajectory"),
        scenarios: [
          {
            id: "loads-cleanly",
            passed: true,
            passedAttempts: 2,
            failedAttempts: 1,
            attempts: [
              { attempt: 1, passed: true, rationale: "Loaded." },
              { attempt: 2, passed: true, rationale: "Loaded again." },
              { attempt: 3, passed: false, rationale: "One flaky try." },
            ],
          },
        ],
      };
    },
  });

  assert.equal(receivedArtifactDir, artifactDir);
  assert.equal(receivedRunId, "solo");
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0]?.id, "loads-cleanly");
  assert.equal(result.scenarios[0]?.passed, true);
});

test("judgePublishedArtifact runs the judge and writes judge.json into the artifact trajectory", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "org-bench-judge-"));
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  let receivedArtifactDir: string | undefined;
  let receivedRunId: string | undefined;
  let receivedModel: string | undefined;

  await mkdir(path.join(artifactDir, "trajectory"), { recursive: true });
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html><body>judge me</body></html>",
  );

  const result = await judgePublishedArtifact({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    judge: async ({
      runId: inputRunId,
      artifactDir: inputArtifactDir,
      model,
    }: {
      runId: string;
      artifactDir: string;
      model: string;
    }) => {
      receivedArtifactDir = inputArtifactDir;
      receivedRunId = inputRunId;
      receivedModel = model;

      return {
        run_id: inputRunId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        rubric: {
          gameplay_completeness: 4,
          learnability: 5,
          content_cohesion: 4,
          visual_polish: 3,
          state_legibility: 4,
        },
        rationale: "The published build is coherent and playable.",
        model,
        tokens: {
          in: 123,
          out: 45,
        },
        cost_usd: 0,
      };
    },
  });

  assert.equal(receivedArtifactDir, artifactDir);
  assert.equal(receivedRunId, "solo");
  assert.equal(receivedModel, "openai/gpt-5.4");
  assert.equal(result.prompt_version, "artifact-judge.v1");
  assert.equal(
    result.rationale,
    "The published build is coherent and playable.",
  );

  const judgeOutputPath = path.join(artifactDir, "trajectory", "judge.json");
  const persisted = JSON.parse(await readFile(judgeOutputPath, "utf8"));
  assert.deepEqual(persisted, result);
});

test("judgePublishedArtifact forwards an OpenCode serve client to the judge", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-judge-client-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  let receivedBaseUrl: string | undefined;
  let receivedSessionId: string | undefined;

  await mkdir(path.join(artifactDir, "trajectory"), { recursive: true });
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html><body>judge me</body></html>",
  );

  await judgePublishedArtifact({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-shared",
    },
    judge: async ({
      runId,
      model,
      openCodeClient,
    }: {
      runId: string;
      artifactDir: string;
      model: string;
      openCodeClient?: {
        baseUrl: string;
        sessionId?: string;
      };
    }) => {
      receivedBaseUrl = openCodeClient?.baseUrl;
      receivedSessionId = openCodeClient?.sessionId;

      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        rubric: {
          gameplay_completeness: 4,
          learnability: 4,
          content_cohesion: 4,
          visual_polish: 4,
          state_legibility: 4,
        },
        rationale: "The artifact stayed coherent.",
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
  });

  assert.equal(receivedBaseUrl, "http://127.0.0.1:4096");
  assert.equal(receivedSessionId, "session-shared");
});

test("runTrajectoryAnalysis runs the analyst and writes analysis.json into the artifact trajectory", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "org-bench-analyze-"));
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  let receivedArtifactDir: string | undefined;
  let receivedRunId: string | undefined;
  let receivedModel: string | undefined;

  await mkdir(path.join(artifactDir, "trajectory"), { recursive: true });
  await writeFile(
    path.join(artifactDir, "trajectory", "events.jsonl"),
    '{"type":"submission","run_id":"solo"}\n',
  );
  await writeFile(
    path.join(artifactDir, "trajectory", "judge.json"),
    '{"rationale":"already judged"}\n',
  );

  const result = await runTrajectoryAnalysis({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    analyze: async ({
      runId: inputRunId,
      artifactDir: inputArtifactDir,
      model,
    }: {
      runId: string;
      artifactDir: string;
      model: string;
    }) => {
      receivedArtifactDir = inputArtifactDir;
      receivedRunId = inputRunId;
      receivedModel = model;

      return {
        run_id: inputRunId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative:
          "The solo run stayed linear, with no delegation and one clean submission.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
        model,
        tokens: {
          in: 111,
          out: 22,
        },
        cost_usd: 0,
      };
    },
  });

  assert.equal(receivedArtifactDir, artifactDir);
  assert.equal(receivedRunId, "solo");
  assert.equal(receivedModel, "openai/gpt-5.4");
  assert.equal(result.prompt_version, "trajectory-analyst.v1");
  assert.match(result.narrative, /solo run stayed linear/i);

  const analysisOutputPath = path.join(
    artifactDir,
    "trajectory",
    "analysis.json",
  );
  const persisted = JSON.parse(await readFile(analysisOutputPath, "utf8"));
  assert.deepEqual(persisted, result);
});

test("runTrajectoryAnalysis forwards an OpenCode serve client to the analyst", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-analyze-client-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  let receivedBaseUrl: string | undefined;
  let receivedSessionId: string | undefined;

  await mkdir(path.join(artifactDir, "trajectory"), { recursive: true });
  await writeFile(
    path.join(artifactDir, "trajectory", "events.jsonl"),
    '{"type":"submission","run_id":"solo"}\n',
  );

  await runTrajectoryAnalysis({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-shared",
    },
    analyze: async ({
      runId,
      model,
      openCodeClient,
    }: {
      runId: string;
      artifactDir: string;
      model: string;
      openCodeClient?: {
        baseUrl: string;
        sessionId?: string;
      };
    }) => {
      receivedBaseUrl = openCodeClient?.baseUrl;
      receivedSessionId = openCodeClient?.sessionId;

      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative: "Solo stayed coherent.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
  });

  assert.equal(receivedBaseUrl, "http://127.0.0.1:4096");
  assert.equal(receivedSessionId, "session-shared");
});

test("runTrajectoryAnalysis starts and stops opencode serve when no client is provided", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-analyze-owned-serve-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  let startedCwd: string | undefined;
  let stoppedBaseUrl: string | undefined;
  let receivedBaseUrl: string | undefined;
  let receivedCreateSession: unknown;
  let receivedDeleteSession: unknown;
  let receivedSendPrompt: unknown;

  await mkdir(path.join(artifactDir, "trajectory"), { recursive: true });
  await writeFile(
    path.join(artifactDir, "trajectory", "events.jsonl"),
    '{"type":"submission","run_id":"solo"}\n',
  );

  await runTrajectoryAnalysis({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    startOpenCodeServe: async ({ cwd }: { cwd: string }) => {
      startedCwd = cwd;

      return {
        baseUrl: "http://127.0.0.1:4101",
        child: {
          exitCode: 0,
          stdout: { on: () => undefined },
          stderr: { on: () => undefined },
          on: () => undefined,
          once: () => undefined,
          kill: () => true,
        },
        closed: false,
        cwd,
        port: 4101,
        readyPromise: Promise.resolve(),
        stderr: "",
        stdout: "",
      };
    },
    shutdownOpenCodeServe: async (server: { baseUrl: string }) => {
      stoppedBaseUrl = server.baseUrl;
    },
    analyze: async ({
      runId,
      model,
      openCodeClient,
    }: {
      runId: string;
      artifactDir: string;
      model: string;
      openCodeClient?: {
        baseUrl: string;
        createSession?: unknown;
        deleteSession?: unknown;
        sendPrompt?: unknown;
      };
    }) => {
      receivedBaseUrl = openCodeClient?.baseUrl;
      receivedCreateSession = openCodeClient?.createSession;
      receivedDeleteSession = openCodeClient?.deleteSession;
      receivedSendPrompt = openCodeClient?.sendPrompt;

      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative: "Solo stayed coherent.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
  });

  assert.equal(startedCwd, artifactDir);
  assert.equal(receivedBaseUrl, "http://127.0.0.1:4101");
  assert.equal(typeof receivedCreateSession, "function");
  assert.equal(typeof receivedDeleteSession, "function");
  assert.equal(typeof receivedSendPrompt, "function");
  assert.equal(stoppedBaseUrl, "http://127.0.0.1:4101");
});

test("runTrajectoryAnalysis excludes binary trajectory blobs from the analyst prompt", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-analyze-binary-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const prompts: string[] = [];

  await mkdir(path.join(artifactDir, "trajectory", "blobs", "snapshots"), {
    recursive: true,
  });
  await writeFile(
    path.join(artifactDir, "trajectory", "events.jsonl"),
    '{"run_id":"solo","type":"submission"}\n',
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "trajectory", "blobs", "snapshots", "step-1.png"),
    Buffer.from([0, 1, 2, 3]),
  );

  await runTrajectoryAnalysis({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-shared",
      sendPrompt: async <TStructured>({ prompt }: { prompt: string }) => {
        prompts.push(prompt);

        return {
          response: {
            info: {
              structured: {
                narrative: "The run stayed coherent.",
                observations: {
                  edge_utilization: [],
                  decomposition: {
                    leader_direct_subtasks: 0,
                    max_delegation_depth: 0,
                  },
                  idle_neighbors: [],
                  patch_churn: {
                    superseded: 0,
                    reverted: 0,
                    rewritten: 0,
                  },
                  incidents: [],
                },
              },
            },
          },
          finalText: null,
          structured: {
            narrative: "The run stayed coherent.",
            observations: {
              edge_utilization: [],
              decomposition: {
                leader_direct_subtasks: 0,
                max_delegation_depth: 0,
              },
              idle_neighbors: [],
              patch_churn: {
                superseded: 0,
                reverted: 0,
                rewritten: 0,
              },
              incidents: [],
            },
          } as TStructured,
          tokens: { in: 1, out: 1 },
        };
      },
    },
  });

  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /Trajectory file: events\.jsonl/);
  assert.doesNotMatch(
    prompts[0] ?? "",
    /Trajectory file: blobs\/snapshots\/step-1\.png/,
  );
  assert.equal((prompts[0] ?? "").includes("\u0000"), false);
});

test("runTrajectoryAnalysis excludes stale analysis output from the analyst prompt", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-analyze-stale-analysis-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const prompts: string[] = [];

  await mkdir(path.join(artifactDir, "trajectory"), { recursive: true });
  await writeFile(
    path.join(artifactDir, "trajectory", "events.jsonl"),
    '{"run_id":"solo","type":"submission"}\n',
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "trajectory", "analysis.json"),
    JSON.stringify({
      run_id: "solo",
      narrative: "stale analyst output should not be re-read",
    }),
    "utf8",
  );

  await runTrajectoryAnalysis({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-shared",
      sendPrompt: async <TStructured>({ prompt }: { prompt: string }) => {
        prompts.push(prompt);

        return {
          response: {
            info: {
              structured: {
                narrative: "The run stayed coherent.",
                observations: {
                  edge_utilization: [],
                  decomposition: {
                    leader_direct_subtasks: 0,
                    max_delegation_depth: 0,
                  },
                  idle_neighbors: [],
                  patch_churn: {
                    superseded: 0,
                    reverted: 0,
                    rewritten: 0,
                  },
                  incidents: [],
                },
              },
            },
          },
          finalText: null,
          structured: {
            narrative: "The run stayed coherent.",
            observations: {
              edge_utilization: [],
              decomposition: {
                leader_direct_subtasks: 0,
                max_delegation_depth: 0,
              },
              idle_neighbors: [],
              patch_churn: {
                superseded: 0,
                reverted: 0,
                rewritten: 0,
              },
              incidents: [],
            },
          } as TStructured,
          tokens: { in: 1, out: 1 },
        };
      },
    },
  });

  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /Trajectory file: events\.jsonl/);
  assert.doesNotMatch(prompts[0] ?? "", /Trajectory file: analysis\.json/);
  assert.doesNotMatch(
    prompts[0] ?? "",
    /stale analyst output should not be re-read/,
  );
});

test("runTrajectoryAnalysis includes meta.json and excludes evaluator logs from the analyst prompt", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-analyze-meta-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const prompts: string[] = [];

  await mkdir(path.join(artifactDir, "trajectory", "evaluator"), {
    recursive: true,
  });
  await writeFile(
    path.join(artifactDir, "meta.json"),
    JSON.stringify({
      run_id: "solo",
      evaluator: { overall_pass_rate: 0.5 },
    }),
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "trajectory", "events.jsonl"),
    '{"run_id":"solo","type":"submission"}\n',
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "trajectory", "evaluator", "loads-cleanly.jsonl"),
    '{"scenario":"loads-cleanly"}\n',
    "utf8",
  );

  await runTrajectoryAnalysis({
    artifactDir,
    runId: "solo",
    model: "openai/gpt-5.4",
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-shared",
      sendPrompt: async <TStructured>({ prompt }: { prompt: string }) => {
        prompts.push(prompt);

        return {
          response: {
            info: {
              structured: {
                narrative: "The run stayed coherent.",
                observations: {
                  edge_utilization: [],
                  decomposition: {
                    leader_direct_subtasks: 0,
                    max_delegation_depth: 0,
                  },
                  idle_neighbors: [],
                  patch_churn: {
                    superseded: 0,
                    reverted: 0,
                    rewritten: 0,
                  },
                  incidents: [],
                },
              },
            },
          },
          finalText: null,
          structured: {
            narrative: "The run stayed coherent.",
            observations: {
              edge_utilization: [],
              decomposition: {
                leader_direct_subtasks: 0,
                max_delegation_depth: 0,
              },
              idle_neighbors: [],
              patch_churn: {
                superseded: 0,
                reverted: 0,
                rewritten: 0,
              },
              incidents: [],
            },
          } as TStructured,
          tokens: { in: 1, out: 1 },
        };
      },
    },
  });

  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /Artifact file: meta\.json/);
  assert.match(prompts[0] ?? "", /overall_pass_rate/);
  assert.doesNotMatch(
    prompts[0] ?? "",
    /Trajectory file: evaluator\/loads-cleanly\.jsonl/,
  );
});

test("regenerateTrajectoryAnalysis infers run metadata and rewrites analysis.json for a published artifact", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-regenerate-analysis-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  let receivedArtifactDir: string | undefined;
  let receivedRunId: string | undefined;
  let receivedModel: string | undefined;

  await mkdir(path.join(repoRoot, "configs"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "configs", "brief.md"),
    "brief\n",
    "utf8",
  );
  await mkdir(path.join(artifactDir, "trajectory", "nodes"), {
    recursive: true,
  });
  await writeFile(
    path.join(artifactDir, "trajectory", "nodes", "leader.jsonl"),
    `${JSON.stringify({
      run_id: "solo",
      node_id: "leader",
      round: 1,
      turn: 1,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      prompt_refs: [],
      output: { messages: [], summary: "placeholder." },
      tool_calls: [],
      tokens: { in: 1, out: 1 },
      model: "openai/gpt-5.4",
      latency_ms: 1,
      cost_usd: 0,
    })}\n`,
    "utf8",
  );

  const result = await regenerateTrajectoryAnalysis({
    artifactDir,
    analyze: async ({
      artifactDir: inputArtifactDir,
      runId,
      model,
    }: {
      artifactDir: string;
      runId: string;
      model: string;
    }) => {
      receivedArtifactDir = inputArtifactDir;
      receivedRunId = runId;
      receivedModel = model;

      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative:
          "The regenerated analysis matches the current raw trajectory.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
        model,
        tokens: { in: 9, out: 4 },
        cost_usd: 0,
      };
    },
  });

  assert.equal(receivedArtifactDir, artifactDir);
  assert.equal(receivedRunId, "solo");
  assert.equal(receivedModel, "openai/gpt-5.4");
  assert.equal(result.run_id, "solo");

  const persisted = JSON.parse(
    await readFile(
      path.join(artifactDir, "trajectory", "analysis.json"),
      "utf8",
    ),
  );
  assert.deepEqual(persisted, result);
});

test("runSoloBenchmark executes the solo pipeline with resolved brief contents and stops after leader submission", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-bench-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const briefPath = path.join(repoRoot, "configs", "brief.md");
  const workspace = {
    runDir: path.join(repoRoot, "runs", "solo"),
    mainWorktreeDir: path.join(repoRoot, "runs", "solo", "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  const observedBriefs: string[] = [];
  const callOrder: string[] = [];
  const openCodeClient = {
    baseUrl: "http://127.0.0.1:4096",
    createSession: async () => ({ id: "session-shared" }),
    deleteSession: async () => true,
  };

  await mkdir(path.dirname(briefPath), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(briefPath, "Resolved benchmark brief.\n", "utf8");
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html></html>\n",
    "utf8",
  );

  const result = await runSoloBenchmark({
    repoRoot,
    runId: "solo",
    runConfig: {
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
      seed: 3,
      maxRounds: 4,
      perRoundTimeoutMs: 120_000,
      brief: "configs/brief.md",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    initWorkspace: async () => {
      callOrder.push("initWorkspace");
      return workspace;
    },
    initializeInboxes: async () => {
      callOrder.push("initializeInboxes");
      return { leader: path.join(workspace.runDir, "inbox", "leader.jsonl") };
    },
    runRound: async ({ round, runConfig }) => {
      callOrder.push(`runRound:${round}`);
      observedBriefs.push(runConfig.brief);

      return {
        sessionFile: path.join(workspace.runDir, "sessions", "leader.json"),
        model: "openai/gpt-5.4",
        output: {
          messages:
            round === 1
              ? [
                  {
                    to: "leader",
                    tag: "status",
                    content: "Prepared the playable build.",
                  },
                ]
              : [
                  {
                    to: "leader",
                    tag: "deliver",
                    content:
                      "Final submission: declare the build ready for evaluation.",
                  },
                ],
          summary:
            round === 1
              ? "Prepared the playable build."
              : "Declared final submission.",
        },
        toolCalls: [],
        tokens: {
          in: 20,
          out: 10,
        },
      };
    },
    snapshotPullRequests: async ({ runId, runDir }) => {
      callOrder.push("snapshotPullRequests");
      assert.equal(runId, "solo");
      assert.equal(runDir, workspace.runDir);
      return [];
    },
    publishArtifact: async ({
      runId,
      topology,
      workspace: receivedWorkspace,
    }) => {
      callOrder.push("publishArtifact");
      assert.equal(runId, "solo");
      assert.equal(topology, "solo");
      assert.deepEqual(receivedWorkspace, workspace);
      return artifactDir;
    },
    evaluateArtifact: async ({ artifactDir: receivedArtifactDir, runId }) => {
      callOrder.push("evaluateArtifact");
      assert.equal(receivedArtifactDir, artifactDir);
      assert.equal(runId, "solo");
      return {
        artifactDir: receivedArtifactDir,
        trajectoryDir: path.join(receivedArtifactDir, "trajectory"),
        scenarios: [],
      };
    },
    judgeArtifact: async ({
      artifactDir: receivedArtifactDir,
      runId,
      model,
      openCodeClient: receivedOpenCodeClient,
    }) => {
      callOrder.push("judgeArtifact");
      assert.equal(receivedArtifactDir, artifactDir);
      assert.equal(runId, "solo");
      assert.equal(model, "openai/gpt-5.4");
      assert.equal(receivedOpenCodeClient?.baseUrl, openCodeClient.baseUrl);
      assert.equal(
        receivedOpenCodeClient?.createSession,
        openCodeClient.createSession,
      );
      assert.equal(
        receivedOpenCodeClient?.deleteSession,
        openCodeClient.deleteSession,
      );
      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        rubric: {
          gameplay_completeness: 4,
          learnability: 4,
          content_cohesion: 4,
          visual_polish: 4,
          state_legibility: 4,
        },
        rationale: "Playable.",
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
    analyzeTrajectory: async ({
      artifactDir: receivedArtifactDir,
      runId,
      model,
    }) => {
      callOrder.push("analyzeTrajectory");
      assert.equal(receivedArtifactDir, artifactDir);
      assert.equal(runId, "solo");
      assert.equal(model, "openai/gpt-5.4");
      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative: "Solo stayed coherent.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
    aggregateMeta: async ({
      artifactDir: receivedArtifactDir,
      repoRoot: receivedRepoRoot,
    }) => {
      callOrder.push("aggregateMeta");
      assert.equal(receivedArtifactDir, artifactDir);
      assert.equal(receivedRepoRoot, repoRoot);
      return MetaJson.parse({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        topology: {
          slug: "solo",
          name: "Solo",
          leader_id: "leader",
          node_count: 1,
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
          tokens: { in: 60, out: 30, total: 90 },
          cost_usd: 0,
          wall_clock_ms: 2_000,
        },
        tokens_by_node: {
          leader: { in: 60, out: 30, total: 90, cost_usd: 0 },
        },
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
          overall_pass_rate: 0,
          scenarios: {},
        },
        artifact: {
          deploy_success: true,
          build_success: true,
          published_path: "docs/solo",
        },
        milestones: {
          time_to_first_playable_build_ms: 0,
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
    },
    cleanupBranches: async ({ repoRoot: receivedRepoRoot, runId }) => {
      callOrder.push("cleanupBranches");
      assert.equal(receivedRepoRoot, repoRoot);
      assert.equal(runId, "solo");
      return ["run/solo/main"];
    },
    persistArtifacts: async () => {
      callOrder.push("persistArtifacts");
      return false;
    },
    teardownWorkspace: async () => {
      callOrder.push("teardownWorkspace");
    },
    openCodeClient,
  });

  assert.deepEqual(observedBriefs, [
    "Resolved benchmark brief.\n",
    "Resolved benchmark brief.\n",
  ]);
  assert.deepEqual(callOrder, [
    "initWorkspace",
    "initializeInboxes",
    "runRound:1",
    "runRound:2",
    "snapshotPullRequests",
    "publishArtifact",
    "evaluateArtifact",
    "judgeArtifact",
    "analyzeTrajectory",
    "aggregateMeta",
    "cleanupBranches",
    "persistArtifacts",
    "teardownWorkspace",
  ]);
  assert.equal(result.roundsExecuted, 2);
  assert.equal(result.submitted, true);
  assert.equal(result.artifactDir, artifactDir);
  assert.equal(result.meta.run_id, "solo");
  assert.deepEqual(result.cleanedBranches, ["run/solo/main"]);
});

test("runSoloBenchmark reuses one OpenCode serve session across solo rounds and cleans it up once", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-bench-session-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const briefPath = path.join(repoRoot, "configs", "brief.md");
  const workspace = {
    runDir: path.join(repoRoot, "runs", "solo"),
    mainWorktreeDir: path.join(repoRoot, "runs", "solo", "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  const createdSessions: Array<{ baseUrl: string; directory: string }> = [];
  const deletedSessions: Array<{ baseUrl: string; sessionId: string }> = [];
  const roundSessionIds: string[] = [];

  await mkdir(path.dirname(briefPath), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(briefPath, "Resolved benchmark brief.\n", "utf8");
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html></html>\n",
    "utf8",
  );

  await runSoloBenchmark({
    repoRoot,
    runId: "solo",
    runConfig: {
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
      seed: 2,
      maxRounds: 2,
      perRoundTimeoutMs: 120_000,
      brief: "configs/brief.md",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4096",
      createSession: async ({ baseUrl, directory }) => {
        createdSessions.push({ baseUrl, directory });
        return { id: "session-shared" };
      },
      deleteSession: async ({ baseUrl, sessionId }) => {
        deletedSessions.push({ baseUrl, sessionId });
        return true;
      },
    },
    initWorkspace: async () => workspace,
    initializeInboxes: async () => ({
      leader: path.join(workspace.runDir, "inbox", "leader.jsonl"),
    }),
    runRound: async ({ round, openCodeClient }) => {
      roundSessionIds.push(openCodeClient?.sessionId ?? "missing");

      return {
        sessionFile: path.join(workspace.runDir, "sessions", "leader.json"),
        model: "openai/gpt-5.4",
        output: {
          messages: [
            {
              to: "leader",
              tag: "deliver",
              content: `Final submission from round ${round}.`,
            },
          ],
          summary: `Round ${round} completed.`,
        },
        toolCalls: [],
        tokens: { in: 10, out: 5 },
      };
    },
    snapshotPullRequests: async () => [],
    publishArtifact: async () => artifactDir,
    evaluateArtifact: async ({ artifactDir: receivedArtifactDir }) => ({
      artifactDir: receivedArtifactDir,
      trajectoryDir: path.join(receivedArtifactDir, "trajectory"),
      scenarios: [],
    }),
    judgeArtifact: async ({ runId, model }) => ({
      run_id: runId,
      schema_version: SCHEMA_VERSION,
      prompt_version: "artifact-judge.v1",
      rubric: {
        gameplay_completeness: 1,
        learnability: 1,
        content_cohesion: 1,
        visual_polish: 1,
        state_legibility: 1,
      },
      rationale: "Playable.",
      model,
      tokens: { in: 1, out: 1 },
      cost_usd: 0,
    }),
    analyzeTrajectory: async ({ runId, model }) => ({
      run_id: runId,
      schema_version: SCHEMA_VERSION,
      prompt_version: "trajectory-analyst.v1",
      narrative: "Solo stayed coherent.",
      observations: {
        edge_utilization: [],
        decomposition: {
          leader_direct_subtasks: 0,
          max_delegation_depth: 0,
        },
        idle_neighbors: [],
        patch_churn: {
          superseded: 0,
          reverted: 0,
          rewritten: 0,
        },
        incidents: [],
      },
      model,
      tokens: { in: 1, out: 1 },
      cost_usd: 0,
    }),
    aggregateMeta: async () =>
      MetaJson.parse({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        topology: {
          slug: "solo",
          name: "Solo",
          leader_id: "leader",
          node_count: 1,
          culture: null,
        },
        seed: 2,
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
          tokens: { in: 10, out: 5, total: 15 },
          cost_usd: 0,
          wall_clock_ms: 1_000,
        },
        tokens_by_node: {
          leader: { in: 10, out: 5, total: 15, cost_usd: 0 },
        },
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
          overall_pass_rate: 0,
          scenarios: {},
        },
        artifact: {
          deploy_success: true,
          build_success: true,
          published_path: "docs/solo",
        },
        milestones: {
          time_to_first_playable_build_ms: 0,
          time_to_first_passing_scenario_ms: null,
        },
        flags: {
          cap_exceeded: false,
          truncated_blobs: false,
          routing_rejections: 0,
          pr_activity_unsummarized: 0,
          node_failures: 0,
        },
      }),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
  });

  assert.deepEqual(createdSessions, [
    {
      baseUrl: "http://127.0.0.1:4096",
      directory: workspace.mainWorktreeDir,
    },
  ]);
  assert.deepEqual(roundSessionIds, ["session-shared"]);
  assert.deepEqual(deletedSessions, [
    {
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-shared",
    },
  ]);
});

test("runSoloBenchmark starts and stops an OpenCode serve server when no client is injected", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-bench-serve-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const briefPath = path.join(repoRoot, "configs", "brief.md");
  const workspace = {
    runDir: path.join(repoRoot, "runs", "solo"),
    mainWorktreeDir: path.join(repoRoot, "runs", "solo", "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  const startedServers: Array<{ cwd: string; pidFile?: string }> = [];
  const stoppedServers: string[] = [];
  const createdSessions: Array<{ baseUrl: string; directory: string }> = [];
  const deletedSessions: Array<{ baseUrl: string; sessionId: string }> = [];
  const roundBaseUrls: string[] = [];
  let analystClientShape:
    | {
        baseUrl?: string;
        hasCreateSession: boolean;
        hasDeleteSession: boolean;
        hasSendPrompt: boolean;
      }
    | undefined;

  await mkdir(path.dirname(briefPath), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(briefPath, "Resolved benchmark brief.\n", "utf8");
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html></html>\n",
    "utf8",
  );

  await runSoloBenchmark({
    repoRoot,
    runId: "solo",
    runConfig: {
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
      seed: 4,
      maxRounds: 1,
      perRoundTimeoutMs: 120_000,
      brief: "configs/brief.md",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    initWorkspace: async () => workspace,
    initializeInboxes: async () => ({
      leader: path.join(workspace.runDir, "inbox", "leader.jsonl"),
    }),
    runRound: async ({ openCodeClient }) => {
      roundBaseUrls.push(openCodeClient?.baseUrl ?? "missing");

      return {
        sessionFile: path.join(workspace.runDir, "sessions", "leader.json"),
        model: "openai/gpt-5.4",
        output: {
          messages: [
            {
              to: "leader",
              tag: "deliver",
              content: "Final submission.",
            },
          ],
          summary: "Round completed.",
        },
        toolCalls: [],
        tokens: { in: 10, out: 5 },
      };
    },
    snapshotPullRequests: async () => [],
    publishArtifact: async () => artifactDir,
    evaluateArtifact: async ({ artifactDir: receivedArtifactDir }) => ({
      artifactDir: receivedArtifactDir,
      trajectoryDir: path.join(receivedArtifactDir, "trajectory"),
      scenarios: [],
    }),
    judgeArtifact: async ({ runId, model }) => ({
      run_id: runId,
      schema_version: SCHEMA_VERSION,
      prompt_version: "artifact-judge.v1",
      rubric: {
        gameplay_completeness: 1,
        learnability: 1,
        content_cohesion: 1,
        visual_polish: 1,
        state_legibility: 1,
      },
      rationale: "Playable.",
      model,
      tokens: { in: 1, out: 1 },
      cost_usd: 0,
    }),
    analyzeTrajectory: async ({ runId, model, openCodeClient }) => {
      analystClientShape = {
        baseUrl: openCodeClient?.baseUrl,
        hasCreateSession: openCodeClient?.createSession !== undefined,
        hasDeleteSession: openCodeClient?.deleteSession !== undefined,
        hasSendPrompt: openCodeClient?.sendPrompt !== undefined,
      };

      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative: "Solo stayed coherent.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
    aggregateMeta: async () =>
      MetaJson.parse({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        topology: {
          slug: "solo",
          name: "Solo",
          leader_id: "leader",
          node_count: 1,
          culture: null,
        },
        seed: 4,
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
          tokens: { in: 10, out: 5, total: 15 },
          cost_usd: 0,
          wall_clock_ms: 1_000,
        },
        tokens_by_node: {
          leader: { in: 10, out: 5, total: 15, cost_usd: 0 },
        },
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
          overall_pass_rate: 0,
          scenarios: {},
        },
        artifact: {
          deploy_success: true,
          build_success: true,
          published_path: "docs/solo",
        },
        milestones: {
          time_to_first_playable_build_ms: 0,
          time_to_first_passing_scenario_ms: null,
        },
        flags: {
          cap_exceeded: false,
          truncated_blobs: false,
          routing_rejections: 0,
          pr_activity_unsummarized: 0,
          node_failures: 0,
        },
      }),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
    openCodeClient: {
      createSession: async ({ baseUrl, directory }) => {
        createdSessions.push({ baseUrl, directory });
        return { id: "session-shared" };
      },
      deleteSession: async ({ baseUrl, sessionId }) => {
        deletedSessions.push({ baseUrl, sessionId });
        return true;
      },
    },
    startOpenCodeServe: async ({
      cwd,
      pidFile,
    }: {
      cwd: string;
      pidFile?: string;
    }) => {
      startedServers.push({ cwd, pidFile });

      return {
        baseUrl: "http://127.0.0.1:4891",
        child: {
          exitCode: null,
          kill: () => true,
          on: () => undefined,
          once: () => undefined,
          stderr: { on: () => undefined },
          stdout: { on: () => undefined },
        },
        closed: false,
        cwd,
        port: 4891,
        readyPromise: Promise.resolve(),
        stderr: "",
        stdout: "",
        pidFile,
      };
    },
    shutdownOpenCodeServe: async (server: { baseUrl: string }) => {
      stoppedServers.push(server.baseUrl);
    },
  });

  assert.deepEqual(startedServers, [
    {
      cwd: workspace.mainWorktreeDir,
      pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
    },
  ]);
  assert.deepEqual(stoppedServers, ["http://127.0.0.1:4891"]);
  assert.deepEqual(roundBaseUrls, ["http://127.0.0.1:4891"]);
  assert.deepEqual(analystClientShape, {
    baseUrl: "http://127.0.0.1:4891",
    hasCreateSession: true,
    hasDeleteSession: true,
    hasSendPrompt: true,
  });
  assert.deepEqual(createdSessions, [
    {
      baseUrl: "http://127.0.0.1:4891",
      directory: workspace.mainWorktreeDir,
    },
  ]);
  assert.deepEqual(deletedSessions, [
    {
      baseUrl: "http://127.0.0.1:4891",
      sessionId: "session-shared",
    },
  ]);
});

test("runSoloBenchmark runs preflight closeOpenPullRequests before initWorkspace so stale PRs never interfere", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-preflight-"),
  );
  const workspace = {
    runDir,
    mainWorktreeDir: path.join(runDir, "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  const callOrder: string[] = [];
  const closeCalls: string[] = [];

  await runSoloBenchmark({
    repoRoot: "/repo",
    runId: "solo",
    runConfig: {
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
      seed: 1,
      maxRounds: 1,
      perRoundTimeoutMs: 60_000,
      brief: "Preflight solo brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:3300",
      createSession: async () => ({ id: "session-solo-pref" }),
      deleteSession: async () => true,
    },
    closeOpenPullRequests: async ({ runId }) => {
      callOrder.push("close_prs");
      closeCalls.push(runId);
      return [];
    },
    initWorkspace: async () => {
      callOrder.push("initWorkspace");
      return workspace;
    },
    initializeInboxes: async () => ({
      leader: path.join(workspace.runDir, "inbox", "leader.jsonl"),
    }),
    runRound: async () => ({
      sessionFile: path.join(runDir, "sessions", "leader.json"),
      model: defaultModels.node.model,
      output: {
        messages: [
          {
            to: "leader",
            tag: "deliver",
            content: "Declaring final submission.",
          },
        ],
        summary: "Done.",
      },
      toolCalls: [],
      tokens: { in: 1, out: 1 },
    }),
    snapshotPullRequests: async () => [],
    publishArtifact: async () => {
      const artifactDir = path.join(runDir, "artifact");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        path.join(artifactDir, "index.html"),
        "<html></html>",
        "utf8",
      );
      return artifactDir;
    },
    evaluateArtifact: async () =>
      ({
        artifactDir: path.join(runDir, "artifact"),
        trajectoryDir: path.join(runDir, "artifact", "trajectory"),
        scenarios: [],
      }) as never,
    judgeArtifact: async () =>
      ({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        model: defaultModels.judge.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        rubric: {
          gameplay_completeness: 3,
          learnability: 3,
          content_cohesion: 3,
          visual_polish: 3,
          state_legibility: 3,
        },
        rationale: "stub",
      }) as never,
    analyzeTrajectory: async () =>
      ({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        model: defaultModels.analyst.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        narrative: "stub",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
      }) as never,
    aggregateMeta: async () => ({ schema_version: SCHEMA_VERSION } as MetaJson),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
  });

  assert.equal(
    callOrder[0],
    "close_prs",
    "preflight close_prs must be the first step so stale PRs are cleared before any workspace setup",
  );
  assert.equal(callOrder[1], "initWorkspace");
  assert.ok(
    closeCalls.filter((runId) => runId === "solo").length >= 2,
    "closeOpenPullRequests should be called at preflight AND at finalize",
  );
});

test("runSoloBenchmark passes XDG_DATA_HOME into startOpenCodeServe so topology runs never share opencode state", async () => {
  const runDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-xdg-"),
  );
  const workspace = {
    runDir,
    mainWorktreeDir: path.join(runDir, "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  const startCalls: Array<{
    cwd: string;
    pidFile?: string;
    xdgDataHome?: string;
  }> = [];

  await runSoloBenchmark({
    repoRoot: "/repo",
    runId: "solo",
    runConfig: {
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
      seed: 1,
      maxRounds: 1,
      perRoundTimeoutMs: 60_000,
      brief: "XDG solo brief.",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    openCodeClient: {
      createSession: async ({ directory }) => ({
        id: `session:${directory}`,
      }),
      deleteSession: async () => true,
    },
    startOpenCodeServe: async ({
      cwd,
      pidFile,
      env,
    }: {
      cwd: string;
      pidFile?: string;
      env?: NodeJS.ProcessEnv;
    }) => {
      startCalls.push({
        cwd,
        pidFile,
        xdgDataHome:
          typeof env?.XDG_DATA_HOME === "string"
            ? env.XDG_DATA_HOME
            : undefined,
      });
      return {
        baseUrl: "http://127.0.0.1:3311",
        child: createMockOpenCodeServeProcess(),
        closed: false,
        cwd,
        port: 3311,
        readyPromise: Promise.resolve(),
        stderr: "",
        stdout: "",
        pidFile,
      };
    },
    shutdownOpenCodeServe: async () => undefined,
    closeOpenPullRequests: async () => [],
    initWorkspace: async () => workspace,
    initializeInboxes: async () => ({
      leader: path.join(workspace.runDir, "inbox", "leader.jsonl"),
    }),
    runRound: async () => ({
      sessionFile: path.join(runDir, "sessions", "leader.json"),
      model: defaultModels.node.model,
      output: {
        messages: [
          {
            to: "leader",
            tag: "deliver",
            content: "Declaring final submission.",
          },
        ],
        summary: "Done.",
      },
      toolCalls: [],
      tokens: { in: 1, out: 1 },
    }),
    snapshotPullRequests: async () => [],
    publishArtifact: async () => {
      const artifactDir = path.join(runDir, "artifact");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        path.join(artifactDir, "index.html"),
        "<html></html>",
        "utf8",
      );
      return artifactDir;
    },
    evaluateArtifact: async () =>
      ({
        artifactDir: path.join(runDir, "artifact"),
        trajectoryDir: path.join(runDir, "artifact", "trajectory"),
        scenarios: [],
      }) as never,
    judgeArtifact: async () =>
      ({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        model: defaultModels.judge.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        rubric: {
          gameplay_completeness: 3,
          learnability: 3,
          content_cohesion: 3,
          visual_polish: 3,
          state_legibility: 3,
        },
        rationale: "stub",
      }) as never,
    analyzeTrajectory: async () =>
      ({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        model: defaultModels.analyst.model,
        tokens: { in: 0, out: 0 },
        cost_usd: 0,
        narrative: "stub",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
      }) as never,
    aggregateMeta: async () => ({ schema_version: SCHEMA_VERSION } as MetaJson),
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
  });

  assert.deepEqual(startCalls, [
    {
      cwd: workspace.mainWorktreeDir,
      pidFile: path.join(workspace.runDir, ".opencode-serve.pid"),
      xdgDataHome: path.join(workspace.runDir, ".xdg"),
    },
  ]);
});

test("runSoloBenchmark enforces the solo per-round timeout and records a failure event", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-bench-timeout-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const briefPath = path.join(repoRoot, "configs", "brief.md");
  const workspace = {
    runDir: path.join(repoRoot, "runs", "solo"),
    mainWorktreeDir: path.join(repoRoot, "runs", "solo", "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  let roundCalls = 0;
  let roundAbortSignal: AbortSignal | undefined;
  let roundObservedAbort = false;
  const openCodeClient = {
    baseUrl: "http://127.0.0.1:4096",
    createSession: async () => ({ id: "session-shared" }),
    deleteSession: async () => true,
  };

  await mkdir(path.dirname(briefPath), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await mkdir(path.join(workspace.runDir, "trajectory"), { recursive: true });
  await writeFile(briefPath, "Resolved benchmark brief.\n", "utf8");

  const result = await runSoloBenchmark({
    repoRoot,
    runId: "solo",
    runConfig: {
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
      seed: 1,
      maxRounds: 1,
      perRoundTimeoutMs: 10,
      brief: "configs/brief.md",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    initWorkspace: async () => workspace,
    initializeInboxes: async () => ({
      leader: path.join(workspace.runDir, "inbox", "leader.jsonl"),
    }),
    runRound: async ({ abortSignal }) => {
      roundCalls += 1;
      roundAbortSignal = abortSignal;
      abortSignal?.addEventListener("abort", () => {
        roundObservedAbort = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        sessionFile: path.join(workspace.runDir, "sessions", "leader.json"),
        model: "openai/gpt-5.4",
        output: {
          messages: [
            {
              to: "leader",
              tag: "deliver",
              content: "Final submission: this should never be observed.",
            },
          ],
          summary: "Timed-out round should be ignored.",
        },
        toolCalls: [],
        tokens: {
          in: 20,
          out: 10,
        },
      };
    },
    snapshotPullRequests: async () => [],
    publishArtifact: async () => artifactDir,
    evaluateArtifact: async ({ artifactDir: receivedArtifactDir }) => ({
      artifactDir: receivedArtifactDir,
      trajectoryDir: path.join(receivedArtifactDir, "trajectory"),
      scenarios: [],
    }),
    judgeArtifact: async ({ runId, model }) => ({
      run_id: runId,
      schema_version: SCHEMA_VERSION,
      prompt_version: "artifact-judge.v1",
      rubric: {
        gameplay_completeness: 1,
        learnability: 1,
        content_cohesion: 1,
        visual_polish: 1,
        state_legibility: 1,
      },
      rationale: "Timed out before a playable build existed.",
      model,
      tokens: { in: 1, out: 1 },
      cost_usd: 0,
    }),
    analyzeTrajectory: async ({ runId, model }) => ({
      run_id: runId,
      schema_version: SCHEMA_VERSION,
      prompt_version: "trajectory-analyst.v1",
      narrative: "The solo node timed out.",
      observations: {
        edge_utilization: [],
        decomposition: {
          leader_direct_subtasks: 0,
          max_delegation_depth: 0,
        },
        idle_neighbors: [],
        patch_churn: {
          superseded: 0,
          reverted: 0,
          rewritten: 0,
        },
        incidents: [],
      },
      model,
      tokens: { in: 1, out: 1 },
      cost_usd: 0,
    }),
    aggregateMeta: async ({
      artifactDir: receivedArtifactDir,
      repoRoot: receivedRepoRoot,
    }) => {
      assert.equal(receivedArtifactDir, artifactDir);
      assert.equal(receivedRepoRoot, repoRoot);
      return MetaJson.parse({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        topology: {
          slug: "solo",
          name: "Solo",
          leader_id: "leader",
          node_count: 1,
          culture: null,
        },
        seed: 1,
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
          tokens: { in: 0, out: 0, total: 0 },
          cost_usd: 0,
          wall_clock_ms: 10,
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
          overall_pass_rate: 0,
          scenarios: {},
        },
        artifact: {
          deploy_success: false,
          build_success: false,
          published_path: "docs/solo",
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
          node_failures: 1,
        },
      });
    },
    cleanupBranches: async () => [],
    persistArtifacts: async () => false,
    teardownWorkspace: async () => undefined,
    openCodeClient,
  });

  assert.equal(roundCalls, 1);
  assert.ok(roundAbortSignal);
  assert.equal(roundObservedAbort, true);
  assert.equal(result.roundsExecuted, 1);
  assert.equal(result.submitted, false);

  const eventsJsonl = await readFile(
    path.join(workspace.runDir, "trajectory", "events.jsonl"),
    "utf8",
  );
  const failureEvent = OrchestratorEvent.parse(JSON.parse(eventsJsonl.trim()));
  assert.equal(failureEvent.type, "failure");
  assert.equal(failureEvent.node_id, "leader");
  assert.equal(failureEvent.failure_kind, "timeout");
});

test("runSoloBenchmark skips evaluator and judge when publish produces no deployable index.html", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-bench-no-index-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const briefPath = path.join(repoRoot, "configs", "brief.md");
  const workspace = {
    runDir: path.join(repoRoot, "runs", "solo"),
    mainWorktreeDir: path.join(repoRoot, "runs", "solo", "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  let evaluateCalls = 0;
  let judgeCalls = 0;
  const callOrder: string[] = [];
  const openCodeClient = {
    baseUrl: "http://127.0.0.1:4096",
    createSession: async () => ({ id: "session-shared" }),
    deleteSession: async () => true,
  };

  await mkdir(path.dirname(briefPath), { recursive: true });
  await mkdir(path.join(artifactDir, "trajectory", "nodes"), {
    recursive: true,
  });
  await writeFile(briefPath, "Resolved benchmark brief.\n", "utf8");
  await writeFile(
    path.join(artifactDir, "trajectory", "nodes", "leader.jsonl"),
    `${JSON.stringify({
      run_id: "solo",
      node_id: "leader",
      round: 1,
      turn: 1,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      prompt_refs: [],
      output: {
        messages: [
          {
            to: "leader",
            tag: "status",
            content: "Timed out before producing a deployable build.",
          },
        ],
        summary: "No deployable build yet.",
      },
      tool_calls: [],
      tokens: { in: 10, out: 5 },
      model: "openai/gpt-5.4",
      latency_ms: 10,
      cost_usd: 0,
    })}\n`,
    "utf8",
  );

  const result = await runSoloBenchmark({
    repoRoot,
    runId: "solo",
    runConfig: {
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
      seed: 5,
      maxRounds: 1,
      perRoundTimeoutMs: 120_000,
      brief: "configs/brief.md",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    initWorkspace: async () => workspace,
    initializeInboxes: async () => ({
      leader: path.join(workspace.runDir, "inbox", "leader.jsonl"),
    }),
    runRound: async () => ({
      sessionFile: path.join(workspace.runDir, "sessions", "leader.json"),
      model: "openai/gpt-5.4",
      output: {
        messages: [
          {
            to: "leader",
            tag: "status",
            content: "Still working toward a playable build.",
          },
        ],
        summary: "Still working.",
      },
      toolCalls: [],
      tokens: {
        in: 10,
        out: 5,
      },
    }),
    snapshotPullRequests: async () => {
      callOrder.push("snapshotPullRequests");
      return [];
    },
    publishArtifact: async () => {
      callOrder.push("publishArtifact");
      return artifactDir;
    },
    evaluateArtifact: async () => {
      evaluateCalls += 1;
      throw new Error(
        "evaluateArtifact should be skipped when no index.html exists",
      );
    },
    judgeArtifact: async () => {
      judgeCalls += 1;
      throw new Error(
        "judgeArtifact should be skipped when no index.html exists",
      );
    },
    analyzeTrajectory: async ({
      artifactDir: receivedArtifactDir,
      runId,
      model,
    }) => {
      callOrder.push("analyzeTrajectory");
      assert.equal(receivedArtifactDir, artifactDir);
      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative:
          "The solo run ended without a deployable site but kept trajectory data.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: {
            superseded: 0,
            reverted: 0,
            rewritten: 0,
          },
          incidents: [],
        },
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
    aggregateMeta: async ({
      artifactDir: receivedArtifactDir,
      repoRoot: receivedRepoRoot,
    }) => {
      callOrder.push("aggregateMeta");
      assert.equal(receivedArtifactDir, artifactDir);
      assert.equal(receivedRepoRoot, repoRoot);
      return MetaJson.parse({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        topology: {
          slug: "solo",
          name: "Solo",
          leader_id: "leader",
          node_count: 1,
          culture: null,
        },
        seed: 5,
        brief: {
          path: "configs/brief.md",
          content_hash:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        models: {
          node: "openai/gpt-5.4",
          evaluator: "unknown",
          judge: "unknown",
          analyst: "openai/gpt-5.4",
        },
        prompts: {
          evaluator_scenarios_version: "evaluator-scenarios.v1",
          judge_prompt_version: "artifact-judge.v1",
          analyst_prompt_version: "trajectory-analyst.v1",
        },
        totals: {
          tokens: { in: 15, out: 6, total: 21 },
          cost_usd: 0,
          wall_clock_ms: 10,
        },
        tokens_by_node: {
          leader: { in: 10, out: 5, total: 15, cost_usd: 0 },
        },
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
          overall_pass_rate: 0,
          scenarios: {},
        },
        artifact: {
          deploy_success: false,
          build_success: false,
          published_path: "docs/solo",
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
    },
    cleanupBranches: async () => {
      callOrder.push("cleanupBranches");
      return [];
    },
    persistArtifacts: async () => {
      callOrder.push("persistArtifacts");
      return false;
    },
    teardownWorkspace: async () => {
      callOrder.push("teardownWorkspace");
    },
    openCodeClient,
  });

  assert.equal(evaluateCalls, 0);
  assert.equal(judgeCalls, 0);
  assert.deepEqual(callOrder, [
    "snapshotPullRequests",
    "publishArtifact",
    "analyzeTrajectory",
    "aggregateMeta",
    "cleanupBranches",
    "persistArtifacts",
    "teardownWorkspace",
  ]);
  assert.equal(result.artifactDir, artifactDir);
  assert.equal(result.meta.artifact.deploy_success, false);
});

test("aggregateRunMeta derives meta.json from published raw logs", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "org-bench-aggregate-"));
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const trajectoryDir = path.join(artifactDir, "trajectory");

  await mkdir(path.join(repoRoot, "configs"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "configs", "brief.md"),
    "Leader-only benchmark brief.\n",
    "utf8",
  );
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html></html>\n",
    "utf8",
  );
  await mkdir(path.join(trajectoryDir, "nodes"), { recursive: true });
  await mkdir(path.join(trajectoryDir, "evaluator"), { recursive: true });
  await mkdir(path.join(trajectoryDir, "patches"), { recursive: true });

  await writeFile(
    path.join(trajectoryDir, "nodes", "leader.jsonl"),
    [
      JSON.stringify({
        run_id: "solo",
        node_id: "leader",
        round: 1,
        turn: 1,
        schema_version: SCHEMA_VERSION,
        ts: "2026-04-16T12:00:00.000Z",
        prompt_refs: [],
        output: {
          messages: [
            {
              to: "leader",
              tag: "status",
              content: "Prepared the first playable build.",
            },
          ],
          summary: "Prepared the first playable build.",
        },
        tool_calls: [],
        tokens: { in: 100, out: 25 },
        model: "openai/gpt-5.4",
        latency_ms: 1500,
        cost_usd: 0,
      }),
      JSON.stringify({
        run_id: "solo",
        node_id: "leader",
        round: 2,
        turn: 1,
        schema_version: SCHEMA_VERSION,
        ts: "2026-04-16T12:00:02.000Z",
        prompt_refs: [],
        output: {
          messages: [
            {
              to: "leader",
              tag: "deliver",
              content: "Declared submission for the playable site.",
            },
          ],
          summary: "Declared submission.",
        },
        tool_calls: [],
        tokens: { in: 80, out: 20 },
        model: "openai/gpt-5.4",
        latency_ms: 2500,
        cost_usd: 0,
      }),
    ].join("\n") + "\n",
    "utf8",
  );

  await writeFile(
    path.join(trajectoryDir, "messages.jsonl"),
    [
      JSON.stringify({
        run_id: "solo",
        round: 1,
        from: "leader",
        to: "leader",
        schema_version: SCHEMA_VERSION,
        ts: "2026-04-16T12:00:01.000Z",
        tag: "status",
        content: "Prepared the first playable build.",
      }),
      JSON.stringify({
        run_id: "solo",
        round: 2,
        from: "leader",
        to: "leader",
        schema_version: SCHEMA_VERSION,
        ts: "2026-04-16T12:00:03.000Z",
        tag: "deliver",
        content: "Declared submission for the playable site.",
      }),
    ].join("\n") + "\n",
    "utf8",
  );

  await writeFile(
    path.join(trajectoryDir, "events.jsonl"),
    JSON.stringify({
      run_id: "solo",
      round: 2,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:04.000Z",
      type: "pr_activity_unsummarized",
      node_id: "leader",
      detail: "Opened PR #41 without summarizing it in an outbound message.",
    }) + "\n",
    "utf8",
  );

  await writeFile(
    path.join(trajectoryDir, "patches", "patch-1.json"),
    JSON.stringify({
      run_id: "solo",
      patch_id: "patch-1",
      schema_version: SCHEMA_VERSION,
      integrator: "leader",
      round: 2,
      branch: "run/solo/leader",
      sha: "abc123",
      disposition: "accepted",
      rationale: "Merged the playable build.",
      ts: "2026-04-16T12:00:04.500Z",
    }) + "\n",
    "utf8",
  );

  await writeFile(
    path.join(trajectoryDir, "evaluator", "loads-cleanly.jsonl"),
    [
      JSON.stringify({
        run_id: "solo",
        scenario: "loads-cleanly",
        attempt: 1,
        step: 1,
        schema_version: SCHEMA_VERSION,
        ts: "2026-04-16T12:00:05.000Z",
        goal: "Open the built site.",
        snapshot_before_ref: "snapshots/a.txt",
        action: { type: "done", note: "The site rendered without errors." },
        snapshot_after_ref: "snapshots/a.txt",
        console_errors: [],
        tokens: { in: 30, out: 10 },
        model: "openai/gpt-5.4",
        latency_ms: 200,
        cost_usd: 0,
      }),
      JSON.stringify({
        run_id: "solo",
        scenario: "loads-cleanly",
        attempt: 2,
        step: 1,
        schema_version: SCHEMA_VERSION,
        ts: "2026-04-16T12:00:06.000Z",
        goal: "Open the built site.",
        snapshot_before_ref: "snapshots/b.txt",
        action: { type: "done", note: "The site rendered without errors." },
        snapshot_after_ref: "snapshots/b.txt",
        console_errors: [],
        tokens: { in: 30, out: 10 },
        model: "openai/gpt-5.4",
        latency_ms: 200,
        cost_usd: 0,
      }),
      JSON.stringify({
        run_id: "solo",
        scenario: "loads-cleanly",
        attempt: 3,
        step: 1,
        schema_version: SCHEMA_VERSION,
        ts: "2026-04-16T12:00:07.000Z",
        goal: "Open the built site.",
        snapshot_before_ref: "snapshots/c.txt",
        action: {
          type: "blocked",
          note: "Console errors prevented the page from loading.",
        },
        snapshot_after_ref: "snapshots/c.txt",
        console_errors: ["ReferenceError"],
        tokens: { in: 35, out: 12 },
        model: "openai/gpt-5.4",
        latency_ms: 240,
        cost_usd: 0,
      }),
    ].join("\n") + "\n",
    "utf8",
  );

  await writeFile(
    path.join(trajectoryDir, "judge.json"),
    JSON.stringify({
      run_id: "solo",
      schema_version: SCHEMA_VERSION,
      prompt_version: "artifact-judge.v1",
      rubric: {
        gameplay_completeness: 4,
        learnability: 4,
        content_cohesion: 4,
        visual_polish: 4,
        state_legibility: 4,
      },
      rationale: "Playable and coherent.",
      model: "openai/gpt-5.4",
      tokens: { in: 40, out: 10 },
      cost_usd: 0,
    }) + "\n",
    "utf8",
  );

  await writeFile(
    path.join(trajectoryDir, "analysis.json"),
    JSON.stringify({
      run_id: "solo",
      schema_version: SCHEMA_VERSION,
      prompt_version: "trajectory-analyst.v1",
      narrative: "Solo execution stayed coherent.",
      observations: {
        edge_utilization: [],
        decomposition: {
          leader_direct_subtasks: 0,
          max_delegation_depth: 0,
        },
        idle_neighbors: [],
        patch_churn: {
          superseded: 0,
          reverted: 0,
          rewritten: 0,
        },
        incidents: [],
      },
      model: "openai/gpt-5.4",
      tokens: { in: 50, out: 20 },
      cost_usd: 0,
    }) + "\n",
    "utf8",
  );

  const meta = await aggregateRunMeta({ artifactDir, repoRoot, seed: 1 });

  assert.deepEqual(meta, MetaJson.parse(meta));
  assert.equal(meta.run_id, "solo");
  assert.deepEqual(meta.topology, {
    slug: "solo",
    name: "Solo",
    leader_id: "leader",
    node_count: 1,
    culture: null,
  });
  assert.equal(meta.seed, 1);
  assert.equal(meta.models.node, "openai/gpt-5.4");
  assert.equal(meta.models.evaluator, "openai/gpt-5.4");
  assert.equal(
    meta.prompts.evaluator_scenarios_version,
    "evaluator-scenarios.v1",
  );
  assert.equal(meta.prompts.judge_prompt_version, "artifact-judge.v1");
  assert.equal(meta.prompts.analyst_prompt_version, "trajectory-analyst.v1");
  assert.deepEqual(meta.totals.tokens, {
    in: 365,
    out: 107,
    total: 472,
  });
  assert.equal(meta.totals.wall_clock_ms, 4640);
  assert.deepEqual(meta.tokens_by_node, {
    leader: {
      in: 180,
      out: 45,
      total: 225,
      cost_usd: 0,
    },
  });
  assert.deepEqual(meta.messages, {
    total: 2,
    by_tag: {
      decompose: 0,
      ask: 0,
      answer: 0,
      deliver: 1,
      status: 1,
      review: 0,
      untagged: 0,
    },
  });
  assert.deepEqual(meta.patches, {
    proposed: 1,
    accepted: 1,
    rejected: 0,
    superseded: 0,
  });
  assert.equal(meta.evaluator.attempts_per_scenario, 3);
  assert.equal(meta.evaluator.overall_pass_rate, 1);
  assert.deepEqual(meta.evaluator.scenarios["loads-cleanly"], {
    passed_attempts: 2,
    total_attempts: 3,
    pass_rate: 2 / 3,
  });
  assert.deepEqual(meta.artifact, {
    deploy_success: true,
    build_success: true,
    published_path: "docs/solo",
  });
  assert.deepEqual(meta.milestones, {
    time_to_first_playable_build_ms: 0,
    time_to_first_passing_scenario_ms: 5000,
  });
  assert.deepEqual(meta.flags, {
    cap_exceeded: false,
    truncated_blobs: false,
    routing_rejections: 0,
    pr_activity_unsummarized: 1,
    node_failures: 0,
  });

  const writtenMeta = MetaJson.parse(
    JSON.parse(await readFile(path.join(artifactDir, "meta.json"), "utf8")),
  );
  assert.deepEqual(writtenMeta, meta);
});

test("aggregateRunMeta infers repoRoot from artifactDir when cwd is elsewhere", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-aggregate-cwd-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const trajectoryDir = path.join(artifactDir, "trajectory");
  const unrelatedCwd = path.join(sandboxDir, "packages", "orchestrator");

  await mkdir(path.join(repoRoot, "configs"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "configs", "brief.md"),
    "Leader-only benchmark brief.\n",
    "utf8",
  );
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html></html>\n",
    "utf8",
  );
  await mkdir(path.join(trajectoryDir, "nodes"), { recursive: true });
  await mkdir(path.join(trajectoryDir, "evaluator"), { recursive: true });
  await mkdir(path.join(trajectoryDir, "patches"), { recursive: true });
  await mkdir(unrelatedCwd, { recursive: true });

  await writeFile(
    path.join(trajectoryDir, "nodes", "leader.jsonl"),
    `${JSON.stringify({
      run_id: "solo",
      node_id: "leader",
      round: 1,
      turn: 1,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:00.000Z",
      prompt_refs: [],
      output: { messages: [], summary: "Prepared the first playable build." },
      tool_calls: [],
      tokens: { in: 100, out: 25 },
      model: "openai/gpt-5.4",
      latency_ms: 1500,
      cost_usd: 0,
    })}\n`,
    "utf8",
  );
  await writeFile(
    path.join(trajectoryDir, "evaluator", "loads-cleanly.jsonl"),
    `${JSON.stringify({
      run_id: "solo",
      scenario: "loads-cleanly",
      attempt: 1,
      step: 1,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:00:05.000Z",
      goal: "Open the built site.",
      snapshot_before_ref: "snapshots/a.txt",
      action: { type: "done", note: "The site rendered without errors." },
      snapshot_after_ref: "snapshots/a.txt",
      console_errors: [],
      tokens: { in: 30, out: 10 },
      model: "openai/gpt-5.4",
      latency_ms: 200,
      cost_usd: 0,
    })}\n`,
    "utf8",
  );

  const originalCwd = process.cwd();

  try {
    process.chdir(unrelatedCwd);

    const meta = await aggregateRunMeta({ artifactDir });

    assert.equal(meta.brief.path, "configs/brief.md");
    assert.equal(meta.topology.slug, "solo");
    assert.equal(meta.artifact.published_path, "docs/solo");
  } finally {
    process.chdir(originalCwd);
  }
});

test("aggregateRunMeta records the topology culture verbatim when a topology config exists", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-aggregate-culture-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "microsoft");
  const trajectoryDir = path.join(artifactDir, "trajectory");

  await mkdir(path.join(repoRoot, "configs", "topologies"), {
    recursive: true,
  });
  await writeFile(
    path.join(repoRoot, "configs", "brief.md"),
    "Leader-only benchmark brief.\n",
    "utf8",
  );
  await writeFile(
    path.join(repoRoot, "configs", "topologies", "microsoft.ts"),
    [
      "export const microsoft = {",
      '  slug: "microsoft",',
      '  name: "Microsoft",',
      '  nodes: ["leader", "divA", "divB", "a1", "b1"],',
      "  edges: [",
      '    { from: "leader", to: "divA", bidir: true },',
      '    { from: "leader", to: "divB", bidir: true },',
      '    { from: "divA", to: "a1", bidir: true },',
      '    { from: "divB", to: "b1", bidir: true },',
      "  ],",
      '  leader: "leader",',
      '  developers: ["divA", "divB", "a1", "b1"],',
      '  integrators: ["leader", "divA", "divB"],',
      "  culture: {",
      '    kind: "microsoft-competition",',
      "    charters: {",
      '      divA: "combat loop and encounter flow",',
      '      divB: "cards, art, and rendered board",',
      "    },",
      '    contested: ["rendered board"],',
      '    leaderPrompt: "Arbitrate between the two divisions on contested surfaces.",',
      '    divisionHeadPrompt: "Advocate for your division vision in contested areas.",',
      '    divisionWorkerPrompt: "Push back on the other division in PR reviews.",',
      "  },",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html></html>\n",
    "utf8",
  );
  await mkdir(path.join(trajectoryDir, "nodes"), { recursive: true });
  await mkdir(path.join(trajectoryDir, "evaluator"), { recursive: true });
  await mkdir(path.join(trajectoryDir, "patches"), { recursive: true });

  await writeFile(
    path.join(trajectoryDir, "nodes", "leader.jsonl"),
    `${JSON.stringify({
      run_id: "microsoft",
      node_id: "leader",
      round: 1,
      turn: 1,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:10:00.000Z",
      prompt_refs: [],
      output: {
        messages: [
          {
            to: "divA",
            tag: "decompose",
            content: "Build the first playable slice.",
          },
        ],
        summary: "Delegated initial work.",
      },
      tool_calls: [],
      tokens: { in: 20, out: 10 },
      model: "openai/gpt-5.4",
      latency_ms: 100,
      cost_usd: 0,
    })}\n`,
    "utf8",
  );
  await writeFile(
    path.join(trajectoryDir, "evaluator", "loads-cleanly.jsonl"),
    `${JSON.stringify({
      run_id: "microsoft",
      scenario: "loads-cleanly",
      attempt: 1,
      step: 1,
      schema_version: SCHEMA_VERSION,
      ts: "2026-04-16T12:10:01.000Z",
      goal: "Open the built site.",
      snapshot_before_ref: "snapshots/a.txt",
      action: { type: "done", note: "Rendered." },
      snapshot_after_ref: "snapshots/a.txt",
      console_errors: [],
      tokens: { in: 10, out: 5 },
      model: "openai/gpt-5.4",
      latency_ms: 100,
      cost_usd: 0,
    })}\n`,
    "utf8",
  );

  const meta = await aggregateRunMeta({ artifactDir, repoRoot });

  assert.deepEqual(meta.topology.culture, {
    kind: "microsoft-competition",
    charters: {
      divA: "combat loop and encounter flow",
      divB: "cards, art, and rendered board",
    },
    contested: ["rendered board"],
    leaderPrompt: "Arbitrate between the two divisions on contested surfaces.",
    divisionHeadPrompt: "Advocate for your division vision in contested areas.",
    divisionWorkerPrompt: "Push back on the other division in PR reviews.",
  });
});

test("cleanupRunBranches deletes agent branches from remote while preserving the run root branch and other runs' branches", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "org-bench-cleanup-"));
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");
  const scratchDir = path.join(sandboxDir, "scratch");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await writeFile(path.join(repoDir, "README.md"), "seed\n", "utf8");
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "README.md"], repoDir);
  await runGit(["commit", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  await initWorkspace({
    repoRoot: repoDir,
    runId: "solo",
    runScratchRoot: scratchDir,
  });
  await initializeNodeWorktrees({
    repoRoot: repoDir,
    runId: "solo",
    nodeIds: ["leader", "alex"],
    runScratchRoot: scratchDir,
  });

  // Seed a sibling run's root branch on the remote so we can prove cleanup
  // only scopes to the target run id.
  await runGit(["branch", "run/apple/main", "main"], repoDir);
  await runGit(["push", "-u", "origin", "run/apple/main"], repoDir);

  const deleted = await cleanupRunBranches({
    repoRoot: repoDir,
    runId: "solo",
    runScratchRoot: scratchDir,
  });

  const leaderBranch = `run/solo/${agentName("solo", "leader")}`;
  const alexBranch = `run/solo/${agentName("solo", "alex")}`;

  assert.deepEqual(deleted.sort(), [alexBranch, leaderBranch].sort());

  // The run root branch must survive as persistent artifact storage.
  const remoteRoot = await runGit(
    ["rev-parse", "refs/heads/run/solo/main"],
    remoteDir,
  );
  assert.match(remoteRoot.stdout.trim(), /^[0-9a-f]{40}$/);

  // The agent branches should have been deleted from the remote.
  for (const branch of [leaderBranch, alexBranch]) {
    const probe = await execFileAsync(
      "git",
      ["rev-parse", `refs/heads/${branch}`],
      { cwd: remoteDir },
    ).then(
      () => "present",
      (error: { stderr?: string }) => error.stderr ?? "missing",
    );
    assert.match(probe, /unknown revision|unknown revision or path/);
  }

  // A sibling run's branches must be untouched.
  const remoteApple = await runGit(
    ["rev-parse", "refs/heads/run/apple/main"],
    remoteDir,
  );
  assert.match(remoteApple.stdout.trim(), /^[0-9a-f]{40}$/);
});

test("cleanupRunBranches returns [] when the run's clone is absent", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-cleanup-missing-"),
  );
  const repoDir = path.join(sandboxDir, "repo");

  await mkdir(repoDir, { recursive: true });

  const deleted = await cleanupRunBranches({
    repoRoot: repoDir,
    runId: "never-ran",
  });

  assert.deepEqual(deleted, []);
});

test("runSoloBenchmark records stage_failed when evaluator throws and still runs judge, analyst, and aggregate", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-solo-bench-stage-fail-"),
  );
  const repoRoot = path.join(sandboxDir, "repo");
  const artifactDir = path.join(repoRoot, "docs", "solo");
  const briefPath = path.join(repoRoot, "configs", "brief.md");
  const workspace = {
    runDir: path.join(repoRoot, "runs", "solo"),
    mainWorktreeDir: path.join(repoRoot, "runs", "solo", "main"),
    mainBranch: "run/solo/main",
    remoteName: "origin",
  };
  const callOrder: string[] = [];
  const openCodeClient = {
    baseUrl: "http://127.0.0.1:4096",
    createSession: async () => ({ id: "session-shared" }),
    deleteSession: async () => true,
  };

  await mkdir(path.dirname(briefPath), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(briefPath, "Resolved benchmark brief.\n", "utf8");
  await writeFile(
    path.join(artifactDir, "index.html"),
    "<html></html>\n",
    "utf8",
  );

  const result = await runSoloBenchmark({
    repoRoot,
    runId: "solo",
    runConfig: {
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
      seed: 7,
      maxRounds: 1,
      perRoundTimeoutMs: 120_000,
      brief: "configs/brief.md",
      models: defaultModels,
      runBudget: {
        tokens: 5_000_000,
        wallClockMs: 10_800_000,
      },
    },
    initWorkspace: async () => workspace,
    initializeInboxes: async () => ({
      leader: path.join(workspace.runDir, "inbox", "leader.jsonl"),
    }),
    runRound: async () => ({
      sessionFile: path.join(workspace.runDir, "sessions", "leader.json"),
      model: "openai/gpt-5.4",
      output: {
        messages: [
          {
            to: "leader",
            tag: "deliver",
            content: "Final submission: declaring the build ready.",
          },
        ],
        summary: "Declared final submission.",
      },
      toolCalls: [],
      tokens: { in: 10, out: 5 },
    }),
    snapshotPullRequests: async () => {
      callOrder.push("snapshotPullRequests");
      return [];
    },
    publishArtifact: async () => {
      callOrder.push("publishArtifact");
      return artifactDir;
    },
    evaluateArtifact: async () => {
      callOrder.push("evaluateArtifact:throw");
      throw new Error(
        "agent-browser exited with code 1: CDP command timed out: Page.captureScreenshot",
      );
    },
    judgeArtifact: async ({ runId, model }) => {
      callOrder.push("judgeArtifact");
      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "artifact-judge.v1",
        rubric: {
          gameplay_completeness: 3,
          learnability: 3,
          content_cohesion: 3,
          visual_polish: 3,
          state_legibility: 3,
        },
        rationale: "Playable after skipped eval.",
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
    analyzeTrajectory: async ({ runId, model }) => {
      callOrder.push("analyzeTrajectory");
      return {
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: "trajectory-analyst.v1",
        narrative: "Ran to completion.",
        observations: {
          edge_utilization: [],
          decomposition: {
            leader_direct_subtasks: 0,
            max_delegation_depth: 0,
          },
          idle_neighbors: [],
          patch_churn: { superseded: 0, reverted: 0, rewritten: 0 },
          incidents: [],
        },
        model,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      };
    },
    aggregateMeta: async () => {
      callOrder.push("aggregateMeta");
      return MetaJson.parse({
        run_id: "solo",
        schema_version: SCHEMA_VERSION,
        topology: {
          slug: "solo",
          name: "Solo",
          leader_id: "leader",
          node_count: 1,
          culture: null,
        },
        seed: 7,
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
          tokens: { in: 10, out: 5, total: 15 },
          cost_usd: 0,
          wall_clock_ms: 10,
        },
        tokens_by_node: {
          leader: { in: 10, out: 5, total: 15, cost_usd: 0 },
        },
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
        patches: { proposed: 0, accepted: 0, rejected: 0, superseded: 0 },
        evaluator: {
          attempts_per_scenario: 3,
          overall_pass_rate: 0,
          scenarios: {},
        },
        artifact: {
          deploy_success: true,
          build_success: true,
          published_path: "docs/solo",
        },
        milestones: {
          time_to_first_playable_build_ms: 0,
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
    },
    cleanupBranches: async () => {
      callOrder.push("cleanupBranches");
      return [];
    },
    persistArtifacts: async () => {
      callOrder.push("persistArtifacts");
      return false;
    },
    teardownWorkspace: async () => {
      callOrder.push("teardownWorkspace");
    },
    openCodeClient,
  });

  assert.deepEqual(callOrder, [
    "snapshotPullRequests",
    "publishArtifact",
    "evaluateArtifact:throw",
    "judgeArtifact",
    "analyzeTrajectory",
    "aggregateMeta",
    "cleanupBranches",
    "persistArtifacts",
    "teardownWorkspace",
  ]);
  assert.equal(result.artifactDir, artifactDir);

  const eventsPath = path.join(artifactDir, "trajectory", "events.jsonl");
  const eventLines = (await readFile(eventsPath, "utf8"))
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const stageFailedEvents = eventLines
    .map((line) => OrchestratorEvent.parse(JSON.parse(line)))
    .filter(
      (event): event is Extract<typeof event, { type: "stage_failed" }> =>
        event.type === "stage_failed",
    );

  assert.equal(stageFailedEvents.length, 1);
  assert.equal(stageFailedEvents[0]?.stage, "evaluator");
  assert.match(stageFailedEvents[0]?.detail ?? "", /CDP command timed out/);
});

test("closeOpenRunPullRequests closes every open PR for the run label", async () => {
  const calls: Array<{ args: string[] }> = [];
  const runner: CommandRunner = async ({ args }) => {
    calls.push({ args });

    if (args[0] === "pr" && args[1] === "list") {
      return {
        stdout: JSON.stringify([{ number: 42 }, { number: 43 }]),
        stderr: "",
        exitCode: 0,
      };
    }

    if (args[0] === "pr" && args[1] === "close") {
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    return { stdout: "", stderr: "unexpected gh call", exitCode: 1 };
  };

  const closed = await closeOpenRunPullRequests({
    runId: "facebook",
    runner,
  });

  assert.deepEqual(closed, [42, 43]);
  assert.deepEqual(calls[0]?.args, [
    "pr",
    "list",
    "--label",
    "run:facebook",
    "--state",
    "open",
    "--json",
    "number",
    "--limit",
    "1000",
  ]);
  assert.deepEqual(calls[1]?.args.slice(0, 4), [
    "pr",
    "close",
    "42",
    "--comment",
  ]);
  assert.deepEqual(calls[2]?.args.slice(0, 4), [
    "pr",
    "close",
    "43",
    "--comment",
  ]);
});

test("closeOpenRunPullRequests tolerates already-closed PRs", async () => {
  const runner: CommandRunner = async ({ args }) => {
    if (args[0] === "pr" && args[1] === "list") {
      return {
        stdout: JSON.stringify([{ number: 99 }]),
        stderr: "",
        exitCode: 0,
      };
    }

    if (args[0] === "pr" && args[1] === "close") {
      return {
        stdout: "",
        stderr: "pull request is already closed",
        exitCode: 1,
      };
    }

    return { stdout: "", stderr: "", exitCode: 1 };
  };

  const closed = await closeOpenRunPullRequests({
    runId: "apple",
    runner,
  });

  assert.deepEqual(closed, []);
});

test("running the bench lifecycle does not modify the host repo's git state", async () => {
  const sandboxDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-host-isolation-"),
  );
  const remoteDir = path.join(sandboxDir, "remote.git");
  const repoDir = path.join(sandboxDir, "repo");

  await runGit(["init", "--bare", remoteDir], sandboxDir);
  await runGit(["init", repoDir], sandboxDir);
  await writeFile(path.join(repoDir, "README.md"), "seed\n", "utf8");
  await runGit(["remote", "add", "origin", remoteDir], repoDir);
  await runGit(["add", "README.md"], repoDir);
  await runGit(["commit", "-m", "seed"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);
  await runGit(["push", "-u", "origin", "main"], repoDir);

  const snapshotHostGitState = async () => {
    const branches = await execFileAsync("git", ["branch", "--list"], {
      cwd: repoDir,
    });
    const stashes = await execFileAsync("git", ["stash", "list"], {
      cwd: repoDir,
    });
    const reflog = await execFileAsync(
      "git",
      ["reflog", "show", "--all"],
      { cwd: repoDir },
    );
    return {
      branches: branches.stdout,
      stashes: stashes.stdout,
      reflog: reflog.stdout,
    };
  };

  const before = await snapshotHostGitState();

  await initWorkspace({
    repoRoot: repoDir,
    runId: "isolation",
  });
  await initializeNodeWorktrees({
    repoRoot: repoDir,
    runId: "isolation",
    nodeIds: ["leader", "alex"],
  });
  await cleanupRunBranches({
    repoRoot: repoDir,
    runId: "isolation",
  });
  await teardownRunWorkspace({
    repoRoot: repoDir,
    runId: "isolation",
  });

  const after = await snapshotHostGitState();

  assert.equal(after.branches, before.branches);
  assert.equal(after.stashes, before.stashes);
  assert.equal(after.reflog, before.reflog);
});

async function runGit(args: string[], cwd: string) {
  return execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test User",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test User",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}
