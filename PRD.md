# PRD: Leader-Routed Duel TCG Topology Benchmark

> Specifies _what_ we are building and why. For _how_ it is built, see [DESIGN.md](./DESIGN.md).

## 1. Goal

Compare multi-agent organizational topologies under identical conditions. Each topology produces the same artifact: a polished static website containing a finished single-player duel TCG, hosted on GitHub Pages.

The benchmark answers three questions, in order of importance:

1. Why did each topology succeed or fail? (the primary output: a readable story of how each org coordinated or broke down)
2. Which topology produces the best final artifact?
3. Which topology is most efficient in cost and time?

## 2. Background: what multi-agent coordination is

A single-agent system is one LLM session doing a task from start to finish: one context window, one plan, one thread. Most agent benchmarks measure this.

A multi-agent system is several LLM sessions on the same task concurrently, each with its own context and tools, making progress by passing messages. Common reasons to split work this way: parallelism, specialization, context isolation, role separation.

Once you have more than one agent, you need an organizational structure: who talks to whom, who decides, who merges. That shape is the topology - nodes are agents, edges are communication channels.

Real companies face the same question. A tight hierarchy at Amazon behaves differently than a dense peer network at Google, which behaves differently than siloed product groups at Microsoft. The tradeoffs show up in how fast decisions move, how much work is duplicated, how often integration fails, and whether information reaches the people who need it.

This benchmark asks the same question for agent systems: given a fixed task and node count, which topology coordinates best, and why?

## 3. Core mechanic

Only the leader receives the full task brief.

Every other node receives only:

- common baseline context (benchmark rules, tool constraints)
- the full topology: adjacency list, leader ID, its own node ID and role, integration authority rules
- inbox messages from its neighbors

No shared document, no side channels. The task brief is the only thing gated by the graph; the org chart is public to every node, the way it would be in any real company.

This is what makes the benchmark measure coordination rather than raw capability. If every worker saw the brief, topology would barely matter. The leader must decompose work, describe sub-tasks to workers who do not yet know what is being built, and integrate what comes back.

How the leader chooses to use their channel bandwidth - long delegations, short nudges, forwarding the brief wholesale, composing tailored sub-briefs - is left to the leader. The trajectory analyst (§13.4) describes what actually happened; nothing is rejected or capped.

What this measures: task decomposition, delegation quality, information transmission across real org structure, integration discipline, communication overhead, organizational bottlenecks, recovery from miscommunication.

## 4. Artifact requirements

Each run outputs a deployable static site with:

- Home page
- Play page with the actual game
- How to Play / Rules page
- Card gallery / reference page
- Local save / resume support (browser storage, no backend)

### 4.1 Deployment path

All artifacts live in this repo's `docs/` directory, one subdirectory per run. GitHub Pages serves from `docs/` on main, so every run is publicly accessible without a redeploy pipeline.

```
docs/
  index.html                   # public comparison site (Section 15)
  assets/                      # shared comparison-site assets
  runs/
    <topology>/
      <seed>/
        index.html             # the finished game for this run
        assets/                # run-scoped JS, CSS, images
        meta.json              # derived aggregates (Section 4.2)
        trajectory/            # raw execution trace (Section 4.2)
          messages.jsonl
          nodes/<node-id>.jsonl
          evaluator/<scenario>.jsonl
          patches/<patch-id>.json
          prs/<pr-number>.json
          events.jsonl
          judge.json
          analysis.json
```

URLs follow the directory shape: e.g. `/<repo>/runs/apple/seed-03/`, `/<repo>/runs/amazon/seed-01/`. The comparison site at `/<repo>/` links into these. Topology slugs are lowercased company names (`apple`, `amazon`, `microsoft`, `google`, `facebook`, `oracle`, `solo`).

Constraints on agents:

- relative asset paths (each run is served from a sub-path)
- no absolute `/` references
- no backend calls
- browser storage (localStorage / IndexedDB) keys scoped by an orchestrator-injected namespace so seeds do not collide in the same browser

A single push publishes all topologies plus traces at once.

### 4.2 Trajectory files

Every run's full execution trace is published in `docs/runs/<topology>/<seed>/trajectory/` alongside the game. The trace viewer (Section 15) is a static app fetching these files - no backend, database, or log server.

Append-only JSONL where order matters, JSON for single documents. UTF-8. Gzip decision (`.jsonl.gz` with content-encoding vs uncompressed) frozen in Phase 1.

**Raw data is authoritative; `meta.json` is derived.** LLM calls are expensive. Every call's token count, latency, model, and cost are written into the relevant raw log as the call happens, and that log is never overwritten. Summaries (totals, averages, flags) live in `meta.json` and can always be regenerated from the raw logs. If an aggregation is wrong, we re-derive it, not re-run the LLMs.

Raw logs (append-only, one record per event, never rewritten):

- `messages.jsonl` - every inbox message, one per line:
  ```json
  {
    "round": 3,
    "from": "node-2",
    "to": "node-5",
    "tag": "decompose",
    "schema_version": 1,
    "content": "...",
    "ts": "..."
  }
  ```
- `nodes/<node-id>.jsonl` - per-node timeline: one record per OpenCode turn with prompts, tool calls, outputs, `tokens: {in, out}`, `model`, `latency_ms`, `cost_usd`, `ts`. Large prompts reference content-addressed blobs under `trajectory/blobs/` to keep JSONL readable.
- `evaluator/<scenario>.jsonl` - one record per LLM-as-player step with snapshot ref, chosen action, resulting snapshot, console errors, and the same `tokens`/`model`/`latency_ms`/`cost_usd` fields.
- `events.jsonl` - orchestrator events: plan revisions, merge decisions, non-neighbor message rejections, cap-exceeded, failures, final submission.
- `patches/<patch-id>.json` - an integrator's decision on a branch reference: which integrator, which round, which branch and SHA, disposition (`accepted` / `rejected` / `superseded`), rationale. The code itself lives in git history, not here.
- `prs/<pr-number>.json` - a snapshot of every PR opened during the run: URL, author (agent name + node id), title, body, reviewer assignments, state timeline (opened / approved / changes-requested / merged / closed), and all comments with agent-identity attribution. Fetched via `gh` at finalize and frozen.

One-shot LLM outputs (single file per role, raw metadata inline):

- `judge.json` - LLM artifact-judge output (Section 13.2): rubric scores + rationale, plus its own `tokens`, `model`, `cost_usd`.
- `analysis.json` - LLM trajectory-analyst output (Section 13.4): narrative + structured observations, plus its own `tokens`, `model`, `cost_usd`.

Derived:

- `meta.json` - aggregates rebuilt from the above: total tokens, tokens by node, total USD, wall clock, message counts by tag, scenario pass rates, deploy success, etc. Re-derivable at any time; never a source of truth.

Every file carries `schema_version`. Schemas are frozen in Phase 1 under `schemas/trajectory/`.

Rules: no API keys or credentials; prompts and model outputs published as-is.

Size: expected in low single-digit MB per run, compressible. Hard cap 50 MB uncompressed; beyond that, the orchestrator truncates per-node blobs and records it in `events.jsonl`. If repo bloat becomes a problem, move trajectories to release-asset storage with stable URLs.

This gives a single linkable address for every message every agent sent. Anyone can pull the raw data without running anything.

## 5. Game spec

### 5.1 Product

A finished single-player duel TCG. Player vs AI opponents with preconstructed decks. Should feel complete and publicly presentable.

### 5.2 Scope constraints

V1 is intentionally narrow. Not a Magic clone.

Must include:

- player HP and enemy HP
- deck / hand / discard / battlefield zones
- simple mana or resource system
- creature cards and spell cards
- deterministic turn flow
- AI opponents
- 3 to 5 encounters or a challenge ladder
- preconstructed decks only

Must not include:

- instant-speed interaction
- priority passing
- stack complexity
- deckbuilder
- multiplayer
- any backend service

### 5.3 Recommended bounds

- 20-card decks
- 12 to 24 unique cards
- 2 factions or themes max
- 4 to 6 keywords max

## 6. Topologies

Named after the big tech company whose org shape each evokes - evocative, memorable, social-shareable ("which company's org built the best game?"). Each name is backed by a precise structural definition.

Default: 9 nodes. Each entry in the config carries the literal adjacency list. Slugs are stable IDs used in paths and metrics; Name is what the public site displays.

### 6.1 V1 topology set

| Name      | Slug        | Structure                                                            | Leader     | Evokes                                                |
| --------- | ----------- | -------------------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| Solo      | `solo`      | 1 node                                                               | self       | Single-agent control. No coordination cost.           |
| Apple     | `apple`     | N=9, 1 center (CEO) with 8 direct reports, no peer edges             | center     | Star. Tight central control, no cross-team comms.     |
| Amazon    | `amazon`    | N=9, tree, depth 3, branching 2-3                                    | root       | Classic hierarchy. Two-pizza sub-teams under leader.  |
| Microsoft | `microsoft` | N=9, leader + 2 division heads each with 3 reports                   | root       | Siloed subtrees with competing divisions (§6.3).      |
| Google    | `google`    | N=9, bipartite workers with dense peer cross-edges, leader on top    | top        | Dense DAG. High peer bandwidth, flat-ish under top.   |
| Facebook  | `facebook`  | N=9, near-complete peer graph + designated leader                    | designated | Mesh with leader. Move-fast peer network (§6.3).      |
| Oracle    | `oracle`    | N=9, tree with a separate review/governance branch that gates merges | root       | Governed tree. Process gate before anything ships.    |

### 6.2 Integration authority

Each topology has a single canonical rule for who can merge PRs into the run's `main` branch. No centralized/distributed split; the authority is baked into the topology's shape because that is what the topology is supposed to evoke.

| Topology  | Who has write access to `main`                                             |
| --------- | -------------------------------------------------------------------------- |
| Solo      | everyone (the single node)                                                 |
| Apple     | leader only                                                                |
| Amazon    | leader + sub-leads (each owns merges within their subtree, leader across)  |
| Microsoft | leader + 2 division heads (divisions self-integrate, leader merges across) |
| Google    | leader + middle-layer nodes (promoted peer integrators)                    |
| Facebook  | everyone (mesh with broad write access)                                    |
| Oracle    | leader merges, but only after the review node approves                     |

Non-integrators do work on their own branches and open real GitHub PRs asking an integrator to review and merge. See Section 10 for the full workflow.

### 6.3 Behavioral overlays

A topology is its adjacency list and its integration-authority rule, but for some companies the meme is *also* about how the org behaves - the classic "orgs pointing guns at each other" Microsoft cartoon is the obvious one. Encoding those dynamics purely through edges would require contortions; it is cleaner to let some topologies carry a small behavioral prompt overlay, injected into the common context of the nodes it applies to.

Overlays are prompt-level only. They do not change adjacency, write access, or any harness behavior. They are published alongside the topology config so readers can see exactly what each topology was told.

V1 overlays:

| Topology  | Overlay                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft | **Competing divisions.** Each division head's common context includes a distinct charter that intentionally overlaps with the other division's on a contested surface (e.g. Division A owns combat + play page; Division B owns cards + rules + play page). Nodes are told explicitly: "You are competing with the other division. The leader will merge only one vision per contested area. Advocate for yours in PR descriptions and reviews." |
| Facebook  | **Move fast.** All nodes' common context includes: "Prefer shipping over deliberating. Commit partial work early and iterate via PRs. A merged imperfect change beats a perfect unmerged one. Do not wait for consensus if you can see a reasonable next step." Without this, a dense peer mesh defaults to Google-style consensus-seeking and loses the topology's identity.                                                                       |
| Oracle    | **Process-first.** The review node's common context frames its role as a governance gate: it must block merges that skip review, cite rules from the brief when requesting changes, and prefer process correctness over speed.                                                                                                                                                                                    |

Apple, Amazon, Google, and Solo have no overlay in V1 - their memes are fully captured by adjacency and write access alone. Adding an overlay to any topology is a deliberate design decision (every overlay is a confound for structural comparison), recorded here.

### 7.1 Common context (all nodes)

- benchmark rules
- tool constraints and sandboxing rules
- public success criteria (see 11.3)
- full topology: adjacency list, leader ID, own node ID, own role label, integration authority rules
- message envelope format (see §8) and patch-pointer shape
- explicit instruction: task content only arrives via inbox; the brief itself is leader-only

### 7.2 Leader-only brief

Full task brief, acceptance requirements, submission responsibility.

### 7.3 Final authority

- only nodes with write access per §6.2 can merge PRs into the run's `main` branch
- only the leader can submit the final artifact for evaluation (by declaring submission in an outbound message; see §10)

## 8. Messaging rules

Kept deliberately small. Topology is defined by the edges and the leader-only brief; everything else is agent behavior, which we measure rather than constrain.

### 8.1 Envelope

Every message carries: `from`, `to`, `round`, optional self-tag (`decompose`, `ask`, `answer`, `deliver`, `status`, `review`), and free-form markdown content. That is the whole envelope. Tags are hints to the analyst; they are not enforced and have no quantity or size limits.

Everything else a node might want to convey - sub-task specs, branch names and SHAs for patch handoff, questions, reviews, status notes - goes in the free-form content.

### 8.2 Routing

A message from A to B is delivered only if there is an edge `A -> B` in the topology. Messages to non-neighbors are rejected by the orchestrator. Messages sent in round t arrive in round t+1.

### 8.3 No other constraints

No content length cap, no per-node or per-edge bandwidth cap, no quoting ban, no leakage detector, no forced message schema. Each topology is free to use its channels however it likes; the trajectory analyst (§13.4) describes what each actually did.

### 8.4 PR-activity summary requirement

Because PRs are a secondary communication channel (§10.3), a node that performs PR activity in round `t` must summarize it in at least one outbound message that round: PR URL, action taken (opened / reviewed / commented / merged / closed), and the one-line reason. The inbox record alone should tell the coordination story without having to cross-reference GitHub.

## 9. Execution model

Each node runs as an isolated OpenCode session. The orchestrator handles session lifecycle, prompt injection, inbox routing, topology edge enforcement, round scheduling, telemetry, workspace management, evaluation, and deployment.

### 9.1 Scheduling

Round-based. Defaults: 12 rounds per run, each node acts once per round, messages sent in round t arrive in round t+1, per-round timeout per node.

### 9.2 Failure handling

Node fails (crash, timeout, malformed envelope) -> skips the round. Run continues. Failure events recorded in telemetry.

Leader fails to submit -> run scored as deploy failure, latest partial artifact captured for trace review.

### 9.3 Run budget caps

Per-run hard caps: total token budget, total wall-clock. Hitting a cap terminates the run as `cap_exceeded` with latest state captured. No per-message or per-node message-count caps - budget is enforced globally by tokens and time.

## 10. Workspace model

Work happens on real GitHub inside the `org-bench` repo, so PRs become public, inspectable artifacts of how each topology coordinated.

### 10.1 Branches

Every run carves its own namespace via branch prefix:

- `run/<topology>-seed-<N>/main` - the source of truth for what the run is building. Starts empty. The leader owns it in the sense that its final tree becomes the submitted artifact.
- `run/<topology>-seed-<N>/<agent-name>` - each node's personal branch (agent names per 10.4).

All branches are deleted (or archived) after the run's artifact is published to `docs/runs/<topology>/<seed>/`.

### 10.2 PR-based integration

Non-integrators do work on their own branch and open a real GitHub PR against the run's `main` when they have something to hand off. An integrator (per §6.2) reviews, discusses in comments, and merges when satisfied. Integrators with write access may also push directly to `main` for their own work - the PR step is for handoff between nodes, not a forced gate for self-merges.

Every PR is tagged with a `benchmark-run` label and a run-scoped label like `run:apple-seed-03`, so the full project can be filtered to one run.

The `gh` CLI is the transport. The harness never hits the GitHub REST API directly; every PR action is an agent invoking `gh pr create / review / comment / merge` (or equivalent) inside its worktree. GitHub shows `kunchenguid` as the actor on all of it (see §10.4 for how agent identity is disambiguated inside the content).

### 10.3 PRs as a secondary communication channel

PR descriptions and comment threads are agent-to-agent communication, same as inbox messages. The trajectory analyst must see them.

To keep the inbox record self-describing, nodes are asked to **summarize their PR activity this round in their outbound message(s)**: which PR they opened, which PRs they reviewed or commented on, what they decided. PR URLs included. The full PR text and thread still lives on GitHub (and is captured into `trajectory/prs/<pr-number>.json` per §4.2), but the inbox record alone tells the story.

### 10.4 Agent identity

Every node is assigned a human first name per run, deterministic from `hash("<topology>-seed-<N>-<node-id>")` against a fixed pool of ~30 short names. Names rotate across runs so readers do not build biases about any particular name.

Agents are told their name in common context and are required to:

- Sign every PR description with their identity: `Author: <name> (<role>, node <id>)`
- Prefix every PR comment with `**<name> (<role>):**`
- Use their name when referring to themselves in inbox messages

GitHub itself will show `kunchenguid` as the author across all runs. The agent identity lives in the content, not the actor field.

## 11. Task brief and prescribed stack

There is no starter repo. Every topology starts from an empty worktree and builds the project from scratch. The tech stack and rules of engagement are prescribed in the task brief delivered to the leader; getting them through the topology intact is part of what delegation has to carry.

### 11.1 Prescribed stack

Written into the leader's brief. Enforced only by the evaluator - if a topology picks a different framework, it simply fails:

- TypeScript
- Vite bundler, static output, relative asset paths (each run is served from a sub-path)
- Preact for UI
- Plain TS modules for game state (no state library)
- browser-local persistence only (localStorage or IndexedDB); no backend, no network. Save format is the agent's choice.
- Output builds into the worktree's `dist/` and is copied by the harness into `docs/runs/<topology>/<seed>/`
- npm as the package manager

### 11.2 Contracts shipped in the brief

Kept small on purpose. Agents are told what the evaluator will do, not how to build the game:

- Deployment path constraints (Section 4.1: relative paths, no absolute `/` refs, no backend)
- browser-storage key namespace convention (injected by the orchestrator so seeds do not collide)
- Interaction expectations (Section 12): the evaluator drives the game the way a real player would - reading the screen, clicking visible controls, typing where the UI invites it. No hidden test API, no required DOM attributes. Build a UI a human can play, and the evaluator can play it too.

### 11.3 Public success criteria

Described in the brief as prose, not shipped as runnable tests:

- build succeeds with a single `npm run build`
- game starts without error
- a player can navigate home, rules, card gallery, and play
- a full turn sequence resolves against an AI opponent
- state persists across a page reload
- all pages render without console errors

The evaluator (Section 12) is the only source of truth for pass/fail. Agents may write local tests for confidence; none are shipped or graded.

## 12. Evaluator contract

The evaluator interacts with the built artifact the way a human would: it opens the page, looks at what is on screen, and clicks or types. There is no prescribed test API and no required DOM attributes. "Can a reasonable player figure out how to play this?" is part of what is being evaluated.

### 12.1 Interaction model

The evaluator uses `agent-browser` ([vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)) to drive Chrome, plus an LLM-as-player sitting on top of it. Each step:

1. The harness runs `agent-browser snapshot` to get an `@eN`-tagged accessibility-tree representation and `agent-browser screenshot` for the pixels.
2. The LLM-as-player receives both plus its current sub-goal ("start an encounter", "play a turn to completion", "reload and resume", etc.).
3. The LLM emits one action referencing an `@eN` ref from the snapshot: `click @ref`, `fill @ref <text>`, `type <text>`, `press <key>`, `scroll <dir>`, `wait`, or `done`/`blocked`.
4. The harness dispatches the action as an `agent-browser` command and loops.

Same LLM profile across runs, with a short per-step token budget and a per-scenario step cap. Transcripts are recorded alongside the trajectory so the interaction is inspectable and re-gradable.

### 12.2 What the evaluator checks

Scenarios run as black-box sessions against the live site. Each produces a pass/fail and a short rationale.

- **Loads cleanly**: build succeeds, page renders, no uncaught console errors.
- **Navigates**: home -> play, home -> rules, home -> card gallery, all reachable from visible affordances.
- **Starts a game**: LLM-as-player can find and launch an encounter.
- **Completes a turn**: a legal turn resolves, turn passes to the AI, state visibly advances.
- **Finishes an encounter**: some encounter ends in a visible win or loss state within a step budget.
- **Persists**: after a full reload mid-encounter, the game offers to resume and the visible state matches what was there before.
- **Rules page is informative**: the LLM-as-player, reading only the rules page, can answer basic rule questions generated from the brief.

Scenarios are kept small, deterministic in their checks (pass/fail + rationale), and non-overlapping with the artifact judge's polish rubric.

### 12.3 What the evaluator does not do

- No reaching into game state. If it is not visible to a human player, the evaluator does not see it.
- No required DOM structure. Agents may use whatever markup they like; the LLM-as-player adapts.
- No hidden test file shipped to agents. The scenarios above are described in prose in the brief; the actual step logic lives in the harness and is never exposed.

## 13. Scoring

### 13.1 Objective metrics

- evaluator scenario pass rate (Section 12.2)
- deploy success / failure
- total token usage, total USD, token usage by node
- wall-clock runtime
- messages sent, by self-tag
- patches proposed / accepted / rejected
- time to first playable build
- time to first passing evaluator scenario

### 13.2 LLM judge (primary qualitative signal)

Strong LLM scores the final artifact on a rubric: gameplay completeness, rules clarity, content cohesion, visual polish, site navigation and flow.

Used on every run. Cheaper and faster than humans; paired with the rubric it gives reproducible scores.

### 13.3 Human evaluation (validation + public signal)

Blind side-by-side voting on a subset of runs, used to validate the LLM judge's rubric and populate the public comparison site.

Questions:

- Which site would you rather share?
- Which game feels more polished?
- Which game would you rather keep playing?

Gathered post-launch; does not gate internal results.

### 13.4 LLM trajectory analyst (primary explanatory output)

After each run, an LLM analyst reads the trajectory files at `docs/runs/<topology>/<seed>/trajectory/` (Section 4.2) and produces a description of what happened, not a score. Outputs:

- **Narrative**: a readable account of the run. How the leader used the brief, how decomposition fanned out, which edges were active vs idle, where decisions got stuck, where work got duplicated or reverted, whether and how integration happened, what finally shipped.
- **Structured observations** (factual, not evaluative, suitable for cross-run aggregation):
  - edge utilization map (messages per edge, both directions)
  - decomposition fan-out (direct sub-tasks from leader, depth of delegation chains)
  - idle neighbors (edges that carried no messages)
  - patch churn (patches superseded, reverted, or rewritten)
  - incident pointers: brief handoff events, miscommunications, integration failures, with JSONL line refs

Written to `analysis.json` in the same directory. Because inputs are public, anyone can re-run the analyst with a different prompt or model and publish their own reading.

This is the benchmark's most interesting output and is treated as a first-class result. It deliberately does not assign a coordination score, because the benchmark takes no position on which coordination style is "better" - that is what cross-topology comparison is for.

### 13.5 Derived coordination metrics

- leader bottleneck share (% of merges, messages, decisions at leader)
- duplication rate (overlapping work across nodes)
- rework rate (patches later reverted or rewritten)
- success vs cost frontier across topologies

## 14. Seeds and repeatability

V1 runs every topology with a single canonical seed (`seed-01`) so that results are comparable across topologies and across versions of the harness, without spending budget on variance characterization. A seed parameterizes:

- agent sampling temperature seed
- message arrival order within a round (ties broken by seeded RNG)
- initial role assignment within the topology (which worker gets which node ID)

Brief held constant across topologies. Multi-seed variance characterization and distributional reporting are a V2 concern - single-seed V1 results are necessarily point estimates, and readers should treat any single comparison as suggestive rather than conclusive.

## 15. Public results format

A comparison site, not a leaderboard. Lives at `docs/index.html`, deep-links into each run.

Per benchmark brief:

- brief summary
- links to every playable final site (direct subpath links, no iframe)
- screenshots and previews
- blind voting flow (topology labels hidden until vote)
- revealed labels after vote
- key metrics: score, cost, time
- short qualitative summary per topology from the trajectory analyst
- expandable trace viewer per run (message graph, per-node timelines)

Side-by-side comparison is two tabs. Adding a new run is a commit under `docs/runs/`.

The trace viewer is what makes this different from other agent leaderboards - a static app reading the public trajectory files (Section 4.2), so anyone can fork and run their own analysis. Claims about topologies are falsifiable: pull trajectories, re-analyze with a different model or prompt, spot-check whether a leader really decomposed or just broadcast.

## 16. V1 defaults

### Benchmark

- 9 nodes per topology
- 7 topologies (see 6.1)
- single canonical integration-authority rule per topology (§6.2)
- 1 seed per topology (single canonical `seed-01`; multi-seed variance is V2)
- 8 rounds per run
- leader-only brief and final submission

### Game

- single-player only, preconstructed decks only
- deterministic rules
- 3 to 5 AI encounters
- local save, rules page, card gallery all required

### Evaluation

- LLM-as-player scenarios via `agent-browser` (Section 12)
- LLM artifact judge + LLM trajectory analyst on every run
- human voting on public site post-launch
- full cost and time accounting

## 17. Risks

**Topology convergence** - every topology's optimal play turns out to be "leader forwards the brief to everyone, workers go solo", and differences wash out. Mitigation: none, by design. If that is what happens, it is a real finding about multi-agent coordination for tasks of this shape. The trajectory analyst characterizes what each topology actually did, and results are reported accordingly rather than hidden.

**Rules sprawl** - card game grows into Magic-level complexity. Mitigation: strict scope constraints and banned mechanics list in the brief.

**Brief quality dominates outcomes** - an ambiguous brief means every topology fails in interesting-but-uninformative ways. Mitigation: brief is drafted, dogfooded by a human developer, and frozen in Phase 1. Exit criterion for Phase 1 is that a single human dev can ship a working game from the brief alone.

**Scaffolding time eats the run** - starting from empty means topologies spend early rounds on package.json / Vite config / folder layout before touching gameplay. Mitigation: this is expected and measured; the time-to-first-build metric captures it. If it consistently dominates, the brief will include a small explicit "package.json layout" block in Phase 1.

**Aesthetics-only comparisons** - public attention overweights polish, ignores correctness. Mitigation: evaluator scenario scores shown alongside public voting; trajectory-analyst summary always visible.

**Variance swamps signal** - one unlucky run kills a topology's apparent performance. V1 runs a single seed per topology to keep budget tractable, so point-estimate comparisons are acknowledged as suggestive; a multi-seed V2 is the path to distributional reporting and distributional-dominance conclusions.

**Evaluator non-determinism** - LLM-as-player is stochastic, so the same artifact may pass 9/10 scenarios one run and 10/10 the next. Mitigation: each scenario runs a fixed number of attempts with a step cap; pass requires a majority of attempts to reach the goal, not a single success. Evaluator transcripts are published so borderline cases are inspectable.

## 18. Success criteria

- runs are repeatable across topologies on the shared V1 seed
- final outputs are real playable sites
- cost, time, quality, and coordination are all measurable
- trajectory analyst outputs explain outcomes in under five minutes
- public can understand the setup quickly
- results are interesting enough to share and argue about

## 19. Build phases

See [BUILD.md](./BUILD.md) for the phased work breakdown with checkable items.
