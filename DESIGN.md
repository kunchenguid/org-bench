# DESIGN: Leader-Routed Duel TCG Topology Benchmark

> Specifies _how_ we build it. For _what_ we are building and why, see [PRD.md](./PRD.md).

Companion to [PRD.md](./PRD.md). Section references like "PRD §8" point to the numbered sections there.

## 1. Scope

Technical shape of the harness, task brief, evaluator, and output pipeline. Assumes the PRD is agreed.

Non-goals: model fine-tuning, custom inference serving, a general multi-agent framework beyond what this benchmark needs.

## 2. Tech stack

TypeScript everywhere. There is no scaffolding code in the benchmark - each topology starts from an empty worktree and builds the game from scratch. The tech stack is _prescribed in the task brief_ given to the leader, not shipped as a starter repo. This means delegation quality includes making sure every worker knows which framework to use.

### 2.1 Benchmark harness (orchestrator, evaluator, judge, analyst, viewer)

- **Runtime**: Node 20+.
- **Package manager**: npm with workspaces. No pnpm, no Bun - one less thing to install, one less thing to explain.
- **Schema validation**: Zod. Single source of truth for messages, events, patches, and `meta.json`.
- **Browser automation**: `agent-browser` ([vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)). Fast native Rust CLI that ships its own Chrome from Chrome for Testing, with `@eN` accessibility-tree refs that map cleanly onto LLM-as-player actions. Own daemon so we don't race with a remote-debug port; `errors` is separated from `console` for a clean uncaught-exception signal.
- **Git and GitHub**: shell out to `git` for local work and `gh` for anything that touches GitHub. PRs, reviews, comments, merges all go through `gh`; we never hit the REST API directly. Keeps agent-driven git ops and harness-driven finalization symmetric.
- **Agent runtime**: OpenCode. Every LLM call goes through OpenCode - topology nodes, artifact judge, trajectory analyst, and LLM-as-player. No raw Anthropic/OpenAI SDK calls anywhere in the harness. When building or touching any OpenCode integration point, use the `/opencode-integration` skill for the canonical setup, session/JSON-output patterns, and auth wiring. This DESIGN describes what we call OpenCode for; the skill is the source of truth for how.
- **Model (V1)**: GPT 5.4 across every OpenCode session and role - nodes, judge, analyst, LLM-as-player - to remove cross-model confounds from the comparison. Pinned in `configs/models.ts`. We may change the model down the road; doing so is a deliberate config change (and invalidates prior runs for direct comparison).
- **Structured output**: OpenCode invoked with JSON output mode and a Zod-backed schema for judge and analyst outputs. Same toolchain as nodes, just without tool access and with a short turn count. See `/opencode-integration` for the exact invocation shape.
- **Viewer**: Vite + Preact, static output for Pages.
- **Logging**: structured JSONL written directly to trajectory files. No separate logger.
- **CI/CD**: GitHub Actions for build/lint/deploy of the viewer only. Benchmark runs happen off-CI because they are long, stateful, and expensive.

### 2.2 Prescribed stack for the game (written into the task brief)

Every run's leader receives these choices as part of the brief. They are not enforced by scaffolding - if a topology gets them wrong, it fails evaluation. Frozen in Phase 1 so topologies are not compared across framework choices.

- **Language**: TypeScript.
- **Bundler**: Vite. Static output with relative asset paths, required because each run is served from `docs/runs/<topology>/<seed>/`.
- **UI**: Preact. Small, React-compatible; picked over React for bundle weight, over Svelte/Vue to avoid framework drift between runs.
- **Game state**: plain TypeScript modules. No Redux, no state library.
- **Persistence**: browser-local only (localStorage or IndexedDB). No backend, no network calls. Format is up to the agent; the evaluator only checks that reload preserves visible state.
- **Package manager in the worktree**: npm.

Agents are free to choose content, card data, AI logic, DOM structure, and UI layout within this stack.
No test API or DOM hook list is prescribed - the evaluator (PRD §12) drives the UI like a player, so building a game a human can play is how you build a game the evaluator can play.

## 3. Repo layout

```
/
  PRD.md
  DESIGN.md
  package.json                # npm workspace root (workspaces field)
  package-lock.json

  packages/
    orchestrator/             # benchmark harness
    schemas/                  # shared Zod schemas: messages, events, patches, meta
    evaluator/                # agent-browser + LLM-as-player scenarios
    judge/                    # artifact judge (LLM, rubric-scored)
    analyst/                  # trajectory analyst (LLM, descriptive)
    viewer/                   # public comparison site (static app)

  configs/
    topologies/               # adjacency lists per topology (TS)
    brief.md                  # the task brief (V1: TCG).
    models.ts                 # V1: GPT 5.4 for every role. Profiles differ only in tools/thinking/turn-count.

  runs/                       # scratch space for in-flight runs (gitignored)
    <run-id>/                 # run-id = <topology>-seed-<N>
      worktrees/<agent-name>/ # per-node git worktrees, each on branch run/<run-id>/<agent-name>
      main/                   # worktree tracking run/<run-id>/main; the run's shared trunk
      sessions/<node-id>.json # opencode session state
      inbox/<node-id>.jsonl   # pending messages for round t+1
      trajectory/             # trace being written; copied to docs/runs/ on publish
        prs/<pr-number>.json  # PR snapshots fetched via `gh` at finalize (per PRD §4.2)

  docs/                       # published output (GitHub Pages root)
    index.html                # viewer build output
    runs/<topology>/<seed>/   # per PRD §4.1
```

`runs/` is local and gitignored. `publish.ts` copies the final artifact and trajectory into `docs/runs/<topology>/<seed>/` and commits.

## 4. Orchestrator core loop

Single event loop, driven by round number.

```
loadConfig(topology, seed, brief)
initWorkspace(runId)           // init empty repo, create empty worktrees per node
createInboxes(nodes)
seedLeader(brief)              // leader's inbox gets the full brief once

for round in 1..maxRounds:
  outputs = runRoundParallel(nodes, round)   // Promise.all over nodes
  for msg in outputs.messages:
    validateEnvelope(msg); checkEdge(msg, topology)
    routeToInbox(msg.to, msg, arriveAt=round+1)
  for action in outputs.integratorActions:    // merge/reject/supersede on a branch
    recordPatchDecision(action)
  if leaderSubmitted() or budgetExceeded(): break

finalize(runId)                // evaluator, judge, analyst, publish
```

Parallelism within a round is `Promise.all` over `runNode(id)` workers. Node failures are caught and recorded; they do not cancel siblings. Between rounds is a serial barrier: all nodes complete before routing and the next round starts.

## 5. Node runtime

Each node is an OpenCode session in its own git worktree.

Per round the orchestrator:

1. Ensures the worktree is on branch `run/<run-id>/<agent-name>`.
2. Assembles the round prompt: system prompt (common context + node ID + agent name + role + neighbor list + integration authority rule + PR-activity-summary rule + any topology behavioral overlay that applies to this node per PRD §6.3) plus user turn (newly arrived inbox messages + round instruction).
3. Invokes OpenCode with the persistent session file `sessions/<node-id>.json`. OpenCode handles history compaction across rounds.
4. Waits up to `perRoundTimeoutMs`.
5. Parses the node's structured output: zero or more messages. PR activity happened inline during the turn via `gh` tool calls; the orchestrator learns about it from the agent's outbound message summaries and, at finalize, from `gh` itself.

Why persistent sessions across rounds: keeps each node's working memory (plans, partial designs) without the orchestrator rebuilding it from logs. Session resumption is OpenCode's job, not ours. Follow the `/opencode-integration` skill for session file layout, resume semantics, and tool registration.

Sandboxing: the node's only writable path is its own worktree. Other paths under `runs/<run-id>/` are read-only from its view. Enforced in V1 via tool-invocation path checks; containerization is a later hardening step.

### 5.1 Behavioral overlays

Some topologies carry a prompt-level overlay (PRD §6.3). The orchestrator resolves the overlay at prompt-assembly time:

- **competing-divisions** (Microsoft): each division head's prompt gets its own `charters[divId]` as its scope, the `contested` list as "areas where only one vision will ship", and the `competitivePrompt` string verbatim. Division reports inherit their head's charter. The leader's prompt includes the full overlay so it knows both charters and can choose which vision to merge on contested surfaces.
- **move-fast** (Facebook): every node's prompt gets the overlay's `velocityPrompt` string verbatim. No per-node variation - the whole org is told to prefer shipping over deliberating.
- **process-first** (Oracle): the review node's prompt gets the governance framing from the overlay; everyone else sees only the adjacency fact that the review node gates merges.

Overlays do not touch adjacency, write access, routing, or any log format. They are strictly prompt additions, recorded verbatim in `meta.json` under `topology.overlay` so the analyst and any reader can see exactly what each node was told.

## 6. Workspace isolation: git worktrees on real GitHub

Work happens on real branches in the `kunchenguid/org-bench` GitHub repo so PRs become public, inspectable coordination artifacts (PRD §10).

### 6.1 Branch layout per run

Given `run-id = <topology>-seed-<N>`:

- `run/<run-id>/main` - the run's shared trunk. Created from an empty root commit at run start, pushed to the remote immediately. Agents with write access per PRD §6.2 can merge into it; others open PRs against it.
- `run/<run-id>/<agent-name>` - each node's personal branch, also tracked on the remote. Agent name comes from the deterministic assignment (§6.4).

All branches under the `run/<run-id>/` prefix are deleted (or archived to a tag like `archive/<run-id>`) after the run's artifact is published to `docs/runs/<topology>/<seed>/`.

### 6.2 Setup

Once per run, the orchestrator:

```
# create and push the trunk
git worktree add runs/<run-id>/main -b run/<run-id>/main --orphan
(cd runs/<run-id>/main && git commit --allow-empty -m "empty" && git push -u origin run/<run-id>/main)

# one worktree per node, branched from the run's main
for node in nodes:
  name = agentName(run-id, node.id)
  git worktree add runs/<run-id>/worktrees/<name> -b run/<run-id>/<name> run/<run-id>/main
  (cd runs/<run-id>/worktrees/<name> && git push -u origin run/<run-id>/<name>)
```

Every topology starts from zero and builds the full project through agent work. Worktrees give us cheap local isolation (shared object store, real branches); remote pushes make the work public.

### 6.3 PR flow

Non-integrators do work on their own branch and open a real PR against `run/<run-id>/main` via `gh pr create`. Integrators (per PRD §6.2) review, comment, and merge via `gh pr review` / `gh pr merge`. Integrators with write access may also push directly to `main` for their own work.

Every PR is tagged with two labels so the repo can be filtered down to one run:

- `benchmark-run` - any run, any topology
- `run:<run-id>` - e.g. `run:apple-seed-03`

GitHub shows `kunchenguid` as the actor on all PR actions. Agent identity (§6.4) lives in the PR body, comment prefixes, and inbox messages.

### 6.4 Agent identity

Every node is assigned a human first name per run: `agentName = pool[hash("<run-id>-<node-id>") mod len(pool)]` where `pool` is a fixed list of ~30 short first names shipped in `configs/agent-names.ts`. Names rotate across runs so readers do not build biases around any particular name.

The orchestrator injects the name into each node's common context. Agents are required to:

- Sign every PR description with `Author: <name> (<role>, node <id>)`.
- Prefix every PR comment with `**<name> (<role>):**`.
- Use their name when referring to themselves in inbox messages.

### 6.5 Finalization

At run end, the orchestrator:

1. Fetches every PR tagged `run:<run-id>` via `gh pr list --label run:<run-id>` and then `gh pr view <n> --json ...` for each, writing `trajectory/prs/<pr-number>.json` (PRD §4.2).
2. Checks out `run/<run-id>/main` and builds it; the resulting `dist/` is what gets copied into `docs/runs/<topology>/<seed>/`.
3. Deletes (or archives) every branch under the `run/<run-id>/` prefix.

## 7. Messaging: envelope and routing

Single lightweight envelope, validated by Zod only for routing fields. Content is free-form markdown - everything the sender wants the recipient to know lives there, including branch names and SHAs when shipping patches.

```ts
const MessageEnvelope = z.object({
  run_id: z.string(),
  round: z.number().int().positive(),
  from: z.string(),
  to: z.string(),
  schema_version: z.literal(1),
  ts: z.string(), // set by orchestrator on receive
  tag: z
    .enum(["decompose", "ask", "answer", "deliver", "status", "review"])
    .optional(), // self-reported hint, no enforcement
  content: z.string().min(1), // free-form markdown, non-empty
});
```

No `patch` field: patches are git branches and PRs, and git/GitHub are already the source of truth for what was delivered. A node shipping work just mentions the branch, SHA, and (when applicable) PR URL in `content` (e.g. "branch `run/apple-seed-03/jamie` at `a1b2c3`, opened PR #41, adds hand rendering"); the recipient runs `git` or `gh pr view` to inspect.

PR activity is a secondary communication channel (PRD §10.3). A node that opens, reviews, comments on, or merges a PR in round `t` must summarize that activity in at least one outbound message that same round, with the PR URL and the one-line reason. This keeps the inbox record self-describing: the analyst does not need to cross-reference GitHub to follow the coordination story.

No `tokens` field: per-call token usage is telemetry, captured by the orchestrator around each OpenCode invocation and written into `nodes/<node-id>.jsonl`. It does not ride on messages because the sender did not choose to communicate it.

`tag` is a hint for the analyst and viewer, not a constraint - nothing rejects a message for tag choice or absence.

Routing is the single behavioral check. On send, the orchestrator rejects any message whose `from -> to` pair is not an edge in the topology; the sender gets a `routing_rejection` event next round.

Transport: one JSONL file per node at `runs/<run-id>/inbox/<node-id>.jsonl`, appended by the orchestrator between rounds. At the start of a node's round, its inbox is drained into the prompt; after the round, outbound messages are appended to recipients' inboxes for round t+1.

JSONL on disk is the source of truth. Resuming a failed run means replaying from the trajectory files; no in-process queue state is authoritative.

## 8. Rules of engagement

PRD §8 is deliberately small, and so is the implementation:

- **Edge check**: `from -> to` must exist in the topology's adjacency list. Violations rejected at send time, logged as `routing_rejection`.
- **Round barrier**: messages sent in round t are held in a staging buffer and appended to recipient inboxes only after all nodes finish round t.
- **Envelope validation**: Zod checks envelope shape. Malformed envelopes are rejected; the node's round counts as a no-op.
- **PR activity summary**: if a node performed PR actions this round (detected by scanning its tool-call log for `gh pr ...` invocations), the orchestrator emits a `pr_activity_unsummarized` event when the outbound messages contain no matching PR URL. This is a soft signal for the analyst, not a rejection - we measure discipline, not enforce it.

No content size caps, no bandwidth caps, no leakage detection, no quoting ban. The trajectory analyst (§10) describes how each topology used its channels after the fact.

## 9. Evaluator

`agent-browser` + LLM-as-player, in `packages/evaluator/run.ts`. The evaluator never reads internal game state; it only sees what a user sees.

```
1. vite preview --port <port> <built-artifact-dir>
2. agent-browser open http://localhost:<port>         // auto-starts the daemon + browser
3. for each scenario in scenarios/*.ts:
     if scenario.setup: run setup commands (e.g. reload mid-turn)
     for step in 1..scenario.stepCap:
       snapshot   = agent-browser snapshot            // @eN-tagged a11y tree
       screenshot = agent-browser screenshot <tmp>
       pageErrs   = agent-browser errors              // uncaught JS exceptions only
       action     = await llmPlayer.nextAction({
                      subGoal: scenario.goal, snapshot, screenshot, pageErrs, history
                    })
       if action.type === "done" or "blocked": break
       agent-browser <action.verb> ...args            // dispatch
     verdict = scenario.checkOutcome({ snapshot, pageErrs, history })
4. agent-browser close
5. aggregate scenario verdicts into meta.json; write transcripts to trajectory/evaluator/
```

Scenarios live in `packages/evaluator/scenarios/`. Each is a small module: a goal string for the LLM, an optional setup block (CLI commands to prepare state), a step cap, and a pure `checkOutcome` over the final snapshot + console + history. The scenario set matches PRD §12.2.

LLM-as-player goes through the same OpenCode layer as everything else (§10), pinned to a fast profile with JSON output for actions. The action schema maps 1:1 onto `agent-browser` verbs:

```ts
type PlayerAction =
  | { type: "click";  uid: string }
  | { type: "fill";   uid: string; text: string }
  | { type: "type";   text: string }
  | { type: "press";  key: string }
  | { type: "scroll"; dir: "up" | "down" | "left" | "right" }
  | { type: "wait";   ms?: number; text?: string }
  | { type: "done" | "blocked"; note?: string };
```

UIDs come from the `snapshot` command, so the LLM always names targets using IDs it just saw - no selector guessing. Every step is recorded as JSONL under `trajectory/evaluator/<scenario>.jsonl` with the snapshot, chosen action, resulting snapshot, and any console errors.

Each scenario runs a fixed number of attempts (V1: 3). A scenario passes when a majority of attempts reach the goal, absorbing LLM-as-player stochasticity without needing bit-identical replay (PRD §17).

No public test code is shipped to agents. The brief describes what the evaluator will try to do (PRD §12.2) in prose; agents build a playable UI, the evaluator plays it.

## 10. Judge and analyst

Two LLM roles, each with a distinct job. Both go through OpenCode in JSON output mode - no raw SDK calls - so auth, model routing, token accounting, and session recording match the topology nodes. Implementation details follow the `/opencode-integration` skill.

- **Artifact judge** (PRD §13.2, `packages/judge/`): rubric-based, scores the final site for gameplay completeness, rules clarity, content cohesion, visual polish, and navigation. Reads screenshots and rendered HTML captured by the evaluator run. Judge profile (GPT 5.4, tools off, JSON output validated by Zod). One call per run; writes `judge.json`.
- **Trajectory analyst** (PRD §13.4, `packages/analyst/`): descriptive, not scored. Reads `messages.jsonl`, `events.jsonl`, `meta.json`, and a repo diff summary. Produces a narrative plus structured observations (edge utilization, fan-out, idle neighbors, patch churn, incident pointers). Analyst profile (GPT 5.4 with extended thinking, JSON output). One call per run; writes `analysis.json`.

The two are kept separate on purpose. The judge answers "how good is the final thing" and earns a rubric. The analyst answers "what happened" and deliberately does not score, because the benchmark takes no position on which coordination style is preferable.

Each is a small wrapper:

```ts
const result = await openCode.oneShot({
  profile: models.judge, // or models.analyst; pinned in configs/models.ts
  system: loadPrompt("artifact-judge.v3"), // or "trajectory-analyst.v1"
  user: buildInputs(run),
  output: { format: "json", schema: ArtifactJudgeOutput }, // or TrajectoryAnalysisOutput
  tools: [], // no tool access
});
```

Prompts live as versioned files under `packages/judge/prompts/` and `packages/analyst/prompts/` with a `version` field stamped on every output. Re-running with a new version is expected; outputs are keyed by version.

Model ID and prices pinned in `configs/models.ts`. V1 uses GPT 5.4 for every role - profiles vary only in tools/thinking/turn-count. Upgrading the model is an explicit config change, not a library bump, and invalidates prior runs for direct comparison.

## 11. Telemetry and persistence

Everything is appended to trajectory files in real time, not batched at the end. A mid-run crash leaves a valid, inspectable trajectory.

**Raw event data is authoritative; everything else is derived.** LLM calls are expensive, so the invariant is: every OpenCode call, every inbox message, every orchestrator event is written to a raw log as it happens and never overwritten. Any summary, aggregate, or scoreboard is computable from those raw logs. If a derived field has a bug, we re-derive - we do not re-run.

Raw logs (append-only, never rewritten):

- `messages.jsonl`: every inbox message with its envelope
- `events.jsonl`: orchestrator events (routing rejections, merges, failures, submission, `pr_activity_unsummarized`)
- `nodes/<node-id>.jsonl`: one record per OpenCode turn for a topology node; includes prompt refs, output, tool calls (including every `gh` invocation), `tokens: {in, out}`, `model`, `latency_ms`, `cost_usd`
- `evaluator/<scenario>.jsonl`: one record per LLM-as-player step; same token/model/cost fields
- `patches/<patch-id>.json`: written once per integrator action (merge/reject/supersede), keyed to a branch SHA
- `prs/<pr-number>.json`: frozen snapshot of every PR tagged `run:<run-id>`; fetched via `gh pr view --json` at finalize and never rewritten

One-shot LLM outputs (single file each, raw metadata inline):

- `judge.json`: artifact judge output plus its own `tokens`, `model`, `cost_usd`
- `analysis.json`: trajectory analyst output plus its own `tokens`, `model`, `cost_usd`

Derived (safe to regenerate from the above):

- `meta.json`: aggregates - total tokens, tokens by node, total USD, wall clock, message counts, evaluator scenario pass rates, flags. Rewritten on summary changes; last write is canonical but never the source of truth.

Final publish: atomic `cp -r runs/<run-id>/trajectory docs/runs/<topology>/<seed>/trajectory`, then commit.

A standalone `npm run aggregate -- <run-dir>` rebuilds `meta.json` from the raw logs. Used for bug fixes in the aggregator and for any meta-schema migration, without touching the LLMs.

## 12. Configuration

TypeScript, not YAML. Configs are imported, not parsed.

```ts
// configs/topologies/apple.ts
export const apple: TopologyConfig = {
  slug: "apple",
  name: "Apple",
  nodes: ["leader", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"],
  edges: [{ from: "leader", to: "n1", bidir: true } /* ... */],
  leader: "leader",
  // single canonical rule per topology (PRD §6.2). "leader-only" for Apple;
  // other topologies use "leader+subleads", "everyone", "review-gated", etc.
  writeAccess: { kind: "leader-only" },
  // no behavioral overlay - purely structural
  overlay: null,
};

// configs/topologies/microsoft.ts
export const microsoft: TopologyConfig = {
  slug: "microsoft",
  name: "Microsoft",
  nodes: ["leader", "divA", "divB", "a1", "a2", "a3", "b1", "b2", "b3"],
  edges: [/* ... */],
  leader: "leader",
  writeAccess: { kind: "leader+divisions", divisionHeads: ["divA", "divB"] },
  // PRD §6.3 behavioral overlay: competing divisions with overlapping charters.
  overlay: {
    kind: "competing-divisions",
    charters: {
      divA: "combat loop, encounter flow, AI opponents, and the play page",
      divB: "card content, deckbuilding rules, the rules page, and the play page",
    },
    contested: ["play page"],
    competitivePrompt:
      "You are competing with the other division. The leader will merge only one vision per contested area. Advocate for yours in PR descriptions and reviews.",
  },
};

// configs/topologies/facebook.ts
export const facebook: TopologyConfig = {
  slug: "facebook",
  name: "Facebook",
  nodes: ["leader", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"],
  edges: [/* near-complete peer graph + leader */],
  leader: "leader",
  writeAccess: { kind: "everyone" },
  // PRD §6.3 behavioral overlay: velocity bias applied to every node.
  overlay: {
    kind: "move-fast",
    velocityPrompt:
      "Prefer shipping over deliberating. Commit partial work early and iterate via PRs. A merged imperfect change beats a perfect unmerged one. Do not wait for consensus if you can see a reasonable next step.",
  },
};

// configs/run.ts (example)
export const run: RunConfig = {
  topology: apple,
  seed: 3,
  maxRounds: 12,
  perRoundTimeoutMs: 120_000,
  brief: loadBrief("configs/brief.md"),
  models: models.default,
  runBudget: { tokens: 5_000_000, wallClockMs: 3 * 3600_000 },
};
```

Orchestrator CLI takes a run config file and executes it. No global flags; everything is in the config.

## 13. Deployment

GitHub Actions on push to main:

1. Install, type-check, lint.
2. Build viewer into `docs/index.html` + assets.
3. Validate every `docs/runs/*/*/meta.json` against schema.
4. Deploy via the Pages action (Pages serves from `docs/` on main).

Benchmark runs are off-CI. The operator runs `npm run bench -- <run-config>` locally or on a dedicated box, commits the resulting `docs/runs/<topology>/<seed>/` directory, and pushes. Pages updates on the next build.

Secrets: OpenCode owns provider credentials via its own auth config (`opencode auth`). The harness never reads or stores API keys, never passes them in env vars it controls, and never writes them to trajectory files. CI has no secrets because CI does not run benchmarks.

## 14. Reproducibility

LLM calls are nondeterministic; the benchmark addresses this with multiple seeds rather than bit-identical replay. What is deterministic:

- RNG seeded by `run.seed` for message arrival ties and node ID assignment within a topology
- model IDs and prompt versions pinned in `meta.json` (including the LLM-as-player profile and scenario version)
- brief content hash pinned in `meta.json`

Re-running with the same config will not reproduce identical trajectories, but will reproduce the same topology, brief, and evaluation gauntlet. Cross-run analysis should key off the meta fields, not assume equivalence.

## 15. Observability and debugging

- `npm run bench -- --watch <config>` tails trajectory files with pretty printing.
- Orchestrator serves a local dev viewer at `localhost:4100` during a run: the same viewer as Pages, fed from the in-flight trajectory.
- `npm run replay -- <docs/runs/...>` plays a finished run's trajectory back into the viewer for post-mortem.
- Worktrees are preserved at `runs/<run-id>/worktrees/<node-id>/` after a run for manual inspection until explicitly cleaned.

## 16. Decisions made

Resolved in design, noted here so the rationale is discoverable.

- **Session persistence**: no cross-run session resumption. If the orchestrator dies mid-run, we do not try to pick up where it left off - we record enough state to reproduce the run from scratch instead. Simpler, and the expensive thing is the LLM calls, not the wall-clock restart.
- **Worker read access to the submission branch**: workers see `run/<run-id>/main` the same way they see any branch on the remote (via `git fetch` and `gh`). PRs are public within the repo, and the main branch is what they're shipping to. Topology effects come from messaging edges and write access, not from hiding git state.
- **Trajectory file encoding**: uncompressed JSONL. No gzip, no content-encoding dance. Simpler to read, simpler to fetch, and the sizes are well under the PRD §4.2 cap.
- **Viewer graph library**: Cytoscape for the message graph. Bundle weight is acceptable for a static viewer where users explicitly click into the trace view.
- **Node sandboxing**: V1 relies on path-prefix checks in tool invocations plus the write-access rules enforced by GitHub branch protection on `run/<run-id>/main`. Container isolation is deferred.
- **Browser backend** (§2.1): `agent-browser`, not `chrome-devtools-axi`. `chrome-devtools-axi` relied on whatever Chrome the system had and failed opaquely when its CDP endpoint became unreachable, which silently turned benchmark scores into noise (the original Phase 2.3 solo seeds scored 0/7 for this reason, not because the sites were broken). `agent-browser` ships its own Chrome from Chrome for Testing and owns the browser lifecycle through its daemon, so unreachability is not a class of failure we have to defend against in the evaluator. The `@eN` ref shape is identical, so the LLM-as-player action schema is unchanged.
- **Orchestrator subprocess lifecycle**: every subprocess the orchestrator owns (`opencode serve` per run, and in future any similar helper) must survive three kill paths - graceful Ctrl-C/SIGTERM, normal benchmark completion, and SIGKILL (e.g. OOM on the parent). The harness enforces this via three independent mechanisms: a signal-handler registry in `bench-cli.ts` that SIGTERMs every tracked child synchronously before the parent exits, a module-level registry that auto-unregisters cleanly-shut-down children, and a `.opencode-serve.pid` pidfile under `runs/<run-id>/` that the next run reaps on startup. Any one of the three catches a leak the others miss; all three exist because we observed the feedback loop in practice (leaked serves eating RAM, OOM-killing the next bench, producing more leaks).
