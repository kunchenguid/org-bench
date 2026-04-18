# org-bench

Benchmarks multi-agent coding topologies on a shared task (build a canvas-rendered TCG in plain vanilla HTML/CSS/JS). Seven topologies (`apple`, `amazon`, `microsoft`, `google`, `facebook`, `oracle`, `solo`), each run once per pilot. Agents coordinate through inbox messages and real GitHub PRs; every run ships a playable artifact to GitHub Pages (and must also open from `file://`).

Core design questions are in `PRD.md` and `DESIGN.md`.

## Layout

```
packages/
  orchestrator/    # run loop, workspace setup, finalize pipeline (main runtime)
  evaluator/       # headless-browser scenario harness
  judge/           # rubric-based artifact judge
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

## Run model

Every run operates in a disposable clone at `$TMPDIR/org-bench-runs/<run-id>/.git` (bare). Worktrees:

- `$TMPDIR/org-bench-runs/<run-id>/main/` - the shared trunk, branch `run/<run-id>/main`
- `$TMPDIR/org-bench-runs/<run-id>/worktrees/<agent-name>/` - per-node worktrees, branches `run/<run-id>/<agent-name>`

Scratch lives under `os.tmpdir()` on purpose: it keeps agents from walking `..` into the host repo and accidentally committing there. `initWorkspace` refuses to run if the configured `runScratchRoot` is inside `repoRoot`.

The host repo's `.git` is never touched by agents. All agent pushes, branches, stashes land in the per-run clone.

## Round scheduling

- Round 1 wakes only the leader. The leader lands the initial scaffold and decomposes work by sending messages to neighbors.
- Round N (> 1) wakes only nodes whose inbox received messages in round N-1.
- If a round would have zero active nodes, the leader is woken as a fallback so the run can still make progress (e.g., declare submission).

This replaces the old "wake every node every round" behavior, which cost tokens on nodes that had nothing to do.

## Lifecycle

1. **Setup**: bare-clone the remote into `$TMPDIR/org-bench-runs/<run-id>/.git`, push orphan `run/<run-id>/main`, apply branch protection, add per-node worktrees and push each agent branch.
2. **Rounds**: per-round active set selected from inbox state; parallel OpenCode sessions per active node; outbound messages routed per topology adjacency; agents open PRs against `run/<run-id>/main`; integrators merge.
3. **Finalize** (in order): snapshot PRs → publish artifact (sync main with remote, copy worktree source + `trajectory/` to `docs/<topo>/`, excluding `.git`, `node_modules`, `dist`, `.org-bench-artifacts`) → evaluator → judge → analyst → aggregate meta → close open PRs → delete agent branches on remote → commit `inbox/` + `trajectory/` under `.org-bench-artifacts/` on `run/<run-id>/main` and push → `rm -rf $TMPDIR/org-bench-runs/<run-id>/`.

Two durable outputs survive teardown:

- `docs/<topo>/` on host main (playable build + viewer data; one entry per topology)
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

If opencode RSS climbs past ~40 GB, kill and investigate. A `stage_failed` event (evaluator flake, etc.) is non-fatal; finalize continues.

## After a run

1. Check `docs/<topo>/` for `index.html`, `trajectory/meta.json`, `trajectory/judge.json`, `trajectory/analysis.json`, `trajectory/evaluator/*.jsonl`.
2. Rebuild the viewer manifest: `npm run --workspace @org-bench/viewer build-manifest`.
3. Review any open PRs that didn't close (should be none - preflight and finalize both call `gh pr close` for `run:<topo>`).
4. Commit the published topology dir under `docs/` + any viewer rebuild artifacts when the user asks.

## Dev loop

```bash
npm run typecheck
npm test
npm run lint
```

## Conventions

- No em-dashes (`-` only) anywhere.
- No AI co-author lines in commits.
- TDD for fixes and new features.
- Don't commit or push without an explicit ask.
