# BUILD: Phased work plan

> How we get from empty repo to published benchmark. Each item is a checkable work unit. See [PRD.md](./PRD.md) for _what_ we are building and [DESIGN.md](./DESIGN.md) for _how_.

Phase ordering pulls risk forward: the brief and evaluator come before the orchestrator because everything depends on them. Finishing a phase means every item in it is checked off AND the phase exit criterion is met.

## Phase 0: Repo scaffolding

- [x] `npm init` workspace root with `workspaces` field pointing at `packages/*`
- [x] Create empty package dirs: `packages/{orchestrator,schemas,evaluator,judge,analyst,viewer}` each with its own `package.json`
- [x] `configs/` dir with empty `topologies/`, placeholder `brief.md`, `models.ts`, `agent-names.ts`
- [x] TypeScript config: root `tsconfig.base.json`, per-package `tsconfig.json` extending it
- [x] ESLint + Prettier with one shared config at root
- [x] `.gitignore`: `runs/`, `node_modules`, `dist`, `.opencode/`
- [x] GitHub Actions workflow stub (`.github/workflows/ci.yml`) - install, typecheck, lint only
- [x] Enable GitHub Pages on `main` serving from `/docs`
- [x] Add `benchmark-run` label to the repo
- [x] Document how to run `gh auth login` for the operator in a short `SETUP.md`

Exit: `npm install && npm run typecheck && npm run lint` passes with no code.

## Phase 1: Design lock and foundation

Everything the brief and evaluator depend on. No orchestrator yet.

### 1.1 Schemas (`packages/schemas/`)

- [x] `MessageEnvelope` (Zod) per DESIGN §7
- [x] `OrchestratorEvent` union: `routing_rejection`, `merge`, `failure`, `submission`, `cap_exceeded`, `pr_activity_unsummarized`
- [x] `NodeTurnRecord` (per-turn JSONL record: prompts, outputs, tool calls, tokens, model, latency, cost)
- [x] `EvaluatorStepRecord` (snapshot ref, action, resulting snapshot, console errors, tokens, cost)
- [x] `PatchDecision` (integrator, round, branch, SHA, disposition, rationale)
- [x] `PRSnapshot` (URL, author identity, title, body, reviewers, state timeline, all comments)
- [x] `ArtifactJudgeOutput` (rubric scores + rationale + token/cost metadata)
- [x] `TrajectoryAnalysisOutput` (narrative + structured observations + metadata)
- [x] `MetaJson` (aggregates; all fields derivable)
- [x] `schema_version` stamped on every type; freeze under `schemas/trajectory/` as JSON Schema exports

### 1.2 Task brief (`configs/brief.md`)

- [x] Write brief prose: product (TCG), stack (TS/Vite/Preact/etc), acceptance criteria, deployment path constraints, save-key namespace convention, evaluator expectations
- [x] Include banned-mechanics list and recommended bounds (PRD §5)
- [x] No test code, no DOM hook list - describe what evaluator tries in prose only
- [x] Dogfood: a human dev ships a working minimal game from the brief alone (reference impl; not shipped to agents)

### 1.3 Evaluator harness (`packages/evaluator/`)

- [x] `agent-browser` wrapper (open/close, snapshot, screenshot, errors, dispatch)
- [x] LLM-as-player loop: snapshot + screenshot + sub-goal in, `PlayerAction` out, dispatch, repeat
- [x] `PlayerAction` Zod schema matching DESIGN §9 verbs
- [x] Scenario module shape: `{ goal, setup?, stepCap, checkOutcome }`
- [x] Scenarios matching PRD §12.2: loads-cleanly, navigates, starts-a-game, completes-a-turn, finishes-an-encounter, persists, rules-informative
- [x] Each scenario runs N=3 attempts, pass = majority success
- [x] Per-step records written to `trajectory/evaluator/<scenario>.jsonl`
- [x] `npm run evaluate -- <built-artifact-dir>` entry point for standalone use

### 1.4 Judge and analyst prompts (`packages/judge/`, `packages/analyst/`)

- [x] Artifact judge prompt v1 with rubric (gameplay completeness, rules clarity, content cohesion, visual polish, navigation)
- [x] Trajectory analyst prompt v1 (narrative + structured observations described in PRD §13.4)
- [x] Both wired through OpenCode JSON output mode per `/opencode-integration`
- [x] `configs/models.ts` pins GPT 5.4 for every role
- [x] Prompt version stamped on every output

### 1.5 Reference implementation (dogfood)

- [x] Build the minimal TCG from the brief, human only, in a throwaway branch
- [x] Run evaluator against it; all scenarios pass
- [x] Iterate the brief until this is true without modifying evaluator logic

**Phase 1 exit**: a single human dev ships a working minimal game from the brief alone that passes every evaluator scenario. Brief is frozen.

## Phase 2: Solo baseline

Smallest possible orchestrator: one node, one worktree, no messaging. Proves the pipeline end to end.

### 2.1 Orchestrator skeleton (`packages/orchestrator/`)

- [x] Run config loader (`configs/run.ts` shape)
- [x] `initWorkspace(runId)`: create `runs/<run-id>/` tree, orphan `run/<run-id>/main` branch, push to origin
- [x] Single-node runner: spawn one OpenCode session, pin model to GPT 5.4, inject common context + full brief (solo = leader)
- [x] Node turn logging into `trajectory/nodes/<node-id>.jsonl` with tokens/model/latency/cost on every turn
- [x] Run budget caps: total tokens, total wall clock; terminate with `cap_exceeded` event

### 2.2 Finalize pipeline

- [x] `gh pr list --label run:<run-id>` -> snapshot each PR into `trajectory/prs/<pr-number>.json` (empty list is fine for Solo)
- [x] Build artifact from `run/<run-id>/main`, copy `dist/` to `docs/runs/solo/seed-<N>/`
- [x] Run evaluator against the built artifact
- [x] Run artifact judge -> `judge.json`
- [x] Run trajectory analyst -> `analysis.json`
- [x] `npm run aggregate` derives `meta.json` from raw logs
- [x] Branch cleanup: delete (or archive) all `run/<run-id>/*` branches

### 2.3 Solo runs

- [x] Solo end-to-end, 5 seeds
- [x] Verify trajectory files open in a plain JSONL reader
- [x] Spot-check analyst narrative reads as a coherent account
- [x] Verify `meta.json` can be rebuilt from raw logs (delete and re-derive)

**Phase 2 exit**: Solo produces deployable sites with real evaluator scores, full telemetry, readable trajectory analysis. Re-deriving `meta.json` from raw logs matches the original.

> Validated by `solo-seed-05` (commit `#146`): the same seed-05 artifact scored 6/7 on the agent-browser evaluator, with the single failure being a legitimate `finishes-an-encounter` gameplay timeout - not a browser-unreachable error. Seeds 01-04 published earlier under the unreliable `chrome-devtools-axi` backend so their scores are not comparable; the pipeline itself is validated and further solo seeds are not required before Phase 3.

## Phase 3: Orchestrator MVP (multi-node)

Add messaging, round scheduling, topology enforcement, agent identity, PR flow.

### 3.1 Topology and identity

- [x] `TopologyConfig` type with `writeAccess` kind (`leader-only`, `leader+subleads`, `leader+divisions`, `leader+middle`, `everyone`, `review-gated`) and optional `overlay` field
- [x] Overlay types: `competing-divisions`, `move-fast`, `process-first` (PRD §6.3, DESIGN §5.1)
- [x] Implement Apple topology in `configs/topologies/apple.ts` (no overlay)
- [x] Agent name pool in `configs/agent-names.ts` (~30 short first names)
- [x] `agentName(runId, nodeId)` deterministic hash
- [x] Common-context builder: node id, agent name, role, full adjacency, leader id, write-access rule, resolved overlay text for this node
- [x] `meta.json` records the topology's overlay verbatim under `topology.overlay`

### 3.2 Messaging

- [x] Per-node inbox files at `runs/<run-id>/inbox/<node-id>.jsonl`
- [x] Envelope validation on send; malformed = no-op for the round
- [x] Edge check: reject non-neighbor sends, emit `routing_rejection` event
- [x] Round barrier: staged-on-send, delivered-at-round-end; messages sent in round t arrive in round t+1
- [x] `messages.jsonl` append on delivery

### 3.3 Round scheduling

- [x] Round loop with `Promise.all` over nodes per round
- [x] Per-round timeout per node; timeout = skip round, `failure` event
- [x] Leader submission detection (outbound message declares submission)
- [x] Budget checks between rounds

### 3.4 Multi-node workspace and PRs

- [x] One worktree per node on branch `run/<run-id>/<agent-name>`, pushed to origin
- [x] `main` worktree at `runs/<run-id>/main/`
- [x] Branch protection on `run/<run-id>/main` enforcing write-access rules per topology (via `gh api` at setup)
- [x] Agents have `gh` available as a tool; identity-sign PR bodies and comments per DESIGN §6.4
- [x] `run:<run-id>` label applied to every PR by a pre-create hook or instruction
- [x] PR-activity detector: scan node turn tool calls for `gh pr ...`; if found and no PR URL in outbound messages, emit `pr_activity_unsummarized` event

### 3.5 Apple dry run

- [x] Verify non-neighbor message is rejected and logged
- [x] Verify only leader can merge PRs into `run/<run-id>/main`
- [x] Verify PR snapshots captured correctly at finalize
- [x] Verify deployable artifact published to `docs/runs/apple/seed-<N>/`

**Phase 3 exit**: Apple run produces coherent artifact; routing rejection and write-access enforcement both demonstrably work; PRs visible and filtered by label. (Met by apple-seed-01 at iter 164; multi-seed stability now folded into the Phase 5.2 full run.)

## Phase 4: Pilot runs

Add remaining topologies, validate stability and variance.

- [x] Implement Amazon topology (tree, depth 3, branching 2-3, `leader+subleads` write access, no overlay)
- [x] Implement Microsoft topology (leader + 2 division heads + 3 reports each, `leader+divisions`, `competing-divisions` overlay with charters and contested surfaces per PRD §6.3)
- [x] Implement Google topology (bipartite workers + dense peer edges + top leader, `leader+middle`, no overlay)
- [x] Implement Facebook topology (near-complete peer graph + leader, `everyone`, `move-fast` overlay applied to every node)
- [x] Implement Oracle topology (tree with review branch, `review-gated`, `process-first` overlay on the review node)

> Remaining Phase 4 items (live runs, spot-checks, trace review, budget tuning) and the Phase 4 exit criterion moved to the combined "Full runs" block at the end of this file.

## Phase 5: Full benchmark and public site

### 5.1 Viewer (`packages/viewer/`)

- [x] Vite + Preact static app
- [x] Index page listing all runs grouped by topology
- [x] Per-run page with: screenshots, key metrics, embedded playable artifact link, analyst narrative
- [x] Blind side-by-side compare (two runs, topology labels hidden until vote)
- [x] Trace viewer: message graph (Cytoscape), per-node timelines, PR list with links
- [x] All fetches from static `trajectory/*.jsonl` files; no backend
- [x] Deploy through the existing Pages action

### 5.2 Full run

- [x] Per-topology summary pages linked from index

> Remaining Phase 5.2 items (the 7 live runs, artifact publish, viewer-deploy validation) moved to the combined "Full runs" block at the end of this file.

### 5.3 Human voting

- [x] Collected votes stored as PRs to `docs/votes/` (or similar lightweight no-backend mechanism)

> Remaining Phase 5.3 items (live blind-voting UI, post-launch vote aggregation + writeup) and the Phase 5 exit criterion moved to the gated section at the end of this file.

## Gated: live benchmark runs

> **DO NOT EXECUTE UNTIL EXPLICITLY DISCUSSED WITH THE USER.**
>
> Every item below either launches a live multi-hour multi-node benchmark job or depends on the output of one. The user wants to review all topology implementations (and potentially tweak them) before budget is spent on the real runs that produce the PRD's actual results. Do not start any item in this section until the user signs off.

### Full runs (from Phase 4 and Phase 5.2)

- [ ] Run all 7 topologies with 1 seed each = 7 runs
- [ ] Spot-check Microsoft: do the two divisions actually produce competing PRs for the play page, and does the leader pick between them?
- [ ] Spot-check Facebook: is time-to-first-merged-PR meaningfully faster than Google, and does rework rate rise accordingly? If not, the `move-fast` overlay isn't landing.
- [ ] Review trace quality: does the analyst narrative read as a coherent account for each run?
- [ ] Tune per-round timeout and total budget if actual run costs warrant
- [ ] Publish all artifacts under `docs/runs/<topology>/seed-01/`
- [ ] Viewer builds and deploys cleanly

> Multi-node harness validation is folded into this step: if an early run fails or produces an incoherent artifact, kill the chain and loop back to brief/harness fixes before completing the remaining topologies.

### Human voting (from Phase 5.3)

- [ ] Blind voting UI live on the public site
- [ ] Post-launch: gather votes, validate against LLM judge rubric, publish comparison writeup

### Phase exits (depend on items above)

- **Phase 4 exit**: each of the 7 topologies produces one coherent run with consistent telemetry. Any topology that fails or exceeds budget is flagged for brief or harness fixes.
- **Phase 5 exit**: public comparison site live, all 7 runs visible, blind voting works, trace viewer loads every run without errors.
