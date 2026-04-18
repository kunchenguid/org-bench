# org-bench

Benchmarks multi-agent coding topologies on a shared task (build an in-browser spreadsheet in plain vanilla HTML/CSS/JS). Seven topologies (`apple`, `amazon`, `microsoft`, `google`, `facebook`, `oracle`, `solo`), each run once per pilot. Agents coordinate through inbox messages and real GitHub PRs; every run ships a deployed artifact to GitHub Pages (and must also open from `file://`).

Core design questions are in `PRD.md` and `DESIGN.md`.

## Layout

```
packages/
  orchestrator/    # run loop, workspace setup, finalize pipeline (main runtime)
  judge/           # agent-driven artifact judge (spawns opencode serve + agent-browser)
  analyst/         # trajectory post-mortem
  schemas/         # shared zod types
  viewer/          # public comparison site (GitHub Pages)

configs/
  <topo>.ts              # adjacency, write access, culture overlay
  run-<topo>.ts          # entry point passed to `npm run bench` (run-id = <topo>)
  brief.md               # task brief given to the leader

docs/<topology>/                 # published artifact per topology (Pages root); re-running a topology overwrites it
$TMPDIR/org-bench-runs/<run-id>/ # per-run scratch; lives OUTSIDE the host repo; wiped at teardown (includes per-run .xdg/opencode/ so topology runs never share opencode state)
```

## One-time repo setup

The harness assumes **all** `run/**/main` branches on the remote are protected by a repository ruleset that requires a PR for every update. Without this ruleset, agents can (and did, once) force-push work straight onto `run/<topo>/main` and the PR-based culture collapses.

Configure the ruleset on GitHub (Settings → Rules → Rulesets → New branch ruleset):

- **Target branches:** `run/**/main` (include pattern).
- **Rules:**
  - Require a pull request before merging (0 required approvals is fine; integrators merge without human review).
  - Require linear history.
  - Block force pushes.
- **Bypass list:** leave empty. The orchestrator itself lands artifacts via `gh pr create` + `gh pr merge`, so it does not need to bypass.
- **Do not** check "Restrict creations" or "Restrict deletions" - `initWorkspace` creates and recycles `run/<topo>/main` for each run.

If you enable stricter rules (required approvals, required checks, signed commits) you will need to either teach the orchestrator to bypass or add a bot account; out of the box the harness only exercises the three rules above.

## Run model

Every run operates in a disposable clone at `$TMPDIR/org-bench-runs/<run-id>/.git` (bare). Worktrees:

- `$TMPDIR/org-bench-runs/<run-id>/main/` - the shared trunk, branch `run/<run-id>/main`
- `$TMPDIR/org-bench-runs/<run-id>/worktrees/<agent-name>/` - per-node worktrees, branches `run/<run-id>/<agent-name>`

Scratch lives under `os.tmpdir()` on purpose: it keeps agents from walking `..` into the host repo and accidentally committing there. `initWorkspace` refuses to run if the configured `runScratchRoot` is inside `repoRoot`.

The host repo's `.git` is never touched by agents. All agent pushes, branches, stashes land in the per-run clone.

## Round scheduling

Every node wakes every round. Nodes with empty inboxes see a prompt stub explaining they received no messages this round and offering three options: (a) stand down, (b) continue ongoing work, (c) reach out to peers. This trades tokens for visibility: no node is silently "forgotten" just because nobody pinged them in the previous round.

## Lifecycle

1. **Setup**: bare-clone the remote into `$TMPDIR/org-bench-runs/<run-id>/.git`, push orphan `run/<run-id>/main` (covered by the repo-level ruleset above - no per-run branch-protection call), add per-node worktrees at detached HEAD.
2. **Rounds**: every node wakes every round; parallel OpenCode sessions per node; outbound messages routed per topology adjacency; agents open PRs against `run/<run-id>/main`; integrators merge. Solo runs also land via PR (the solo builder opens + self-merges their own PRs).
3. **Finalize** (in order): snapshot PRs → publish artifact (fetch + reset main worktree to remote, copy worktree source + `trajectory/` to `docs/<topo>/`, excluding `.git`, `node_modules`, `dist`, `.org-bench-artifacts`) → judge → analyst → aggregate meta → close open PRs → delete agent branches on remote → persist `inbox/` + `trajectory/` under `.org-bench-artifacts/` on `run/<run-id>/main` via a `run/<run-id>/artifacts` PR (opened + merged by the orchestrator, not a direct push) → `rm -rf $TMPDIR/org-bench-runs/<run-id>/`.

The judge stage spawns its own dedicated `opencode serve` process (separate from the run's node-facing serve) with `AGENT_BROWSER_SESSION=org-bench-judge-<topo>` in its env, then sends a single prompt asking the agent to drive the artifact through `agent-browser` via bash and return a rubric JSON. There is no separate harness-driven evaluator stage; scoring and scenario exercise both happen inside that one judge session.

Two durable outputs survive teardown:

- `docs/<topo>/` on host main (deployed artifact + viewer data; one entry per topology)
- `run/<run-id>/main` branch on the remote (source + full post-mortem in `.org-bench-artifacts/`)

## Orchestrate a run

Run one topology at a time. Each invocation is self-contained: preflight closes any stale `run:<topo>` PRs, `initWorkspace` wipes `docs/<topo>/` and `$TMPDIR/org-bench-runs/<topo>/`, and opencode serve runs with `XDG_DATA_HOME=$TMPDIR/org-bench-runs/<topo>/.xdg` so topology runs never share opencode storage.

```bash
npm run bench -- configs/run-<topo>.ts
```

Expect multi-hour runtime per topology. Redirect to a log if you want to background it:

```bash
npm run bench -- configs/run-<topo>.ts > /tmp/org-bench-<topo>.log 2>&1 &
```

## Monitoring

```bash
tail -f /tmp/org-bench-<topo>.log
wc -l "${TMPDIR:-/tmp}/org-bench-runs/<topo>/trajectory/nodes/leader.jsonl"   # round progress
ps -ax -o pid,rss,etime,command | grep 'opencode serve'   # RAM sanity check
```

If opencode RSS climbs past ~40 GB, kill and investigate. A `stage_failed` event (judge flake, analyst flake, etc.) is non-fatal; finalize continues.

### Peeking inside an in-progress turn

`trajectory/nodes/<node>.jsonl` only flushes at turn end, so it will be empty
while the first turn is still running. To see whether an agent is actually
making progress mid-turn, read opencode's session DB directly:

```bash
RUN=facebook   # topology currently running
DB="${TMPDIR:-/tmp}/org-bench-runs/$RUN/.xdg/opencode/opencode.db"

# Which model, and how many messages so far?
sqlite3 "$DB" "SELECT json_extract(data,'\$.role'),
  json_extract(data,'\$.model.providerID')||'/'||json_extract(data,'\$.model.modelID')
  FROM message ORDER BY rowid;"

# Most recent parts - what is the agent actually doing right now?
sqlite3 "$DB" "SELECT json_extract(data,'\$.type'),
  json_extract(data,'\$.tool'),
  json_extract(data,'\$.state.status'),
  substr(data,1,200)
  FROM part ORDER BY rowid DESC LIMIT 20;"

# Git activity in each worktree - real commits = real progress
for w in "${TMPDIR:-/tmp}/org-bench-runs/$RUN"/worktrees/*; do
  echo "== $(basename "$w") =="; git -C "$w" log --oneline -5 2>/dev/null
done
```

## After a run

1. Check `docs/<topo>/` for `index.html`, `trajectory/meta.json`, `trajectory/judge.json`, `trajectory/analysis.json`. The judge writes one `judge.json`; it does not produce per-scenario jsonl files.
2. Rebuild the viewer manifest: `npm run --workspace @org-bench/viewer build:manifest`.
3. Review any open PRs that didn't close (should be none - preflight and finalize both call `gh pr close` for `run:<topo>`).
4. Commit the published topology dir under `docs/` + any viewer rebuild artifacts when the user asks.

## Dev loop

```bash
npm run typecheck
npm run lint
```

## Conventions

- No em-dashes (`-` only) anywhere.
- No AI co-author lines in commits.
- Do NOT do TDD. Do not write any test cases for this project - we've found tests are not useful here.
- Don't commit or push without an explicit ask.
