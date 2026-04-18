# Pilot v3 full-runs orchestration

Your job is to launch the full-runs chain, watch it finish, archive results, and hand back a coherent
set of artifacts for the public site.

Everything in this doc is current as of 2026-04-18, ~00:15 PDT.

## 30-second context

- Org-bench benchmarks 6 multi-node topologies + 1 solo topology, each running
  a TCG-build task. One seed per topology (`seed-01`). 7 runs total.
- Two earlier pilot chains were aborted:
  - **v1**: bugs (worker PRs not opening, integrator write-access resolver wrong).
  - **v2**: killed because opencode was eating 17+ GB RAM per run.
- **v3 is the clean-slate relaunch.** All bugs fixed, memory limits mitigated,
  budget reduced from 12 rounds to 8 rounds. Repo state wiped.
- Launch the chain, let it run (which may take ~10+ hours), then finalize.

## Current state

- Branch: `main`. All v3 prep work is in the single root commit
  `feat: initial commit` - history was squashed and pushed to origin/main.
- Working tree clean (no uncommitted changes).
- No open PRs. 63 historical PRs remain as "closed" in GitHub history
  (can't hard-delete via API - that's fine, the v3 run will create fresh PRs
  with new numbers).
- `runs/`, `docs/runs/`, `~/.local/share/opencode/` all wiped.

## Launching

```bash
pilot-archives/v3/run-chain.sh
```

Run it with `run_in_background: true` (or `nohup ... &`). Do NOT keep your
shell attached. Chain writes to `/tmp/org-bench-pilot-v3/chain.log` and per-topology
`<topo>-seed-01.log` alongside it.

Chain order: **apple → amazon → microsoft → google → facebook → oracle → solo**
Solo runs last as the single-node baseline for the public comparison site. It
uses the same brief, budget, and evaluator as the others - the only difference
is topology (one node, no messaging, no PR flow beyond the leader merging its
own branch).

## Monitoring

```bash
# Chain status
tail -f /tmp/org-bench-pilot-v3/chain.log

# Current topology's live log
tail -f /tmp/org-bench-pilot-v3/<current-topo>-seed-01.log

# Memory sanity check (should peak around 12-20 GB per topology, drop to ~0 between topologies)
ps -ax -o pid,rss,etime,command | grep 'opencode serve' | grep -v grep

# Round progress per topology
wc -l runs/<topo>-seed-01/trajectory/nodes/leader.jsonl
```

If opencode RSS climbs past ~40 GB: something might be wrong, consider killing
and investigating. Laptop RAM is finite.

If a topology's `steps.test`-like zombie appears: unrelated orphan, kill it
(we hit one during v2).

## Timing expectations

- Per run: **75-110 minutes** wall clock (8 rounds × ~9-13 min/round, plus
  finalize). Was 90-110 min at 12 rounds; should be faster with fewer rounds.
- Per run tokens: **1.5-2.5M** (budget is 50M - relaxed ceiling).
- Full chain: **~10-13 hours** start to finish.
- User is hands-off - reviewing results at end. Don't ping for mid-chain
  decisions unless something is genuinely broken across multiple runs.

## Agent name map (deterministic from topology+seed+nodeId)

| Topology  | Leader                         | Useful to know                                                |
| --------- | ------------------------------ | ------------------------------------------------------------- |
| Apple     | Chloe                          | Star topology, only leader merges                             |
| Amazon    | Iris                           | Tree, leader + n1/n2 sub-leads all merge                      |
| Microsoft | Cleo                           | Leader + divA head (n1) + divB head (n4) merge                |
| Google    | Quinn                          | Leader + middles (m1-m4) merge                                |
| Facebook  | (whoever lands on leader slot) | Everyone merges. Peer mesh, not leader-routed                 |
| Oracle    | Vera                           | Leader merges; review node (also Vera) must NOT open code PRs |
| Solo      | (single node, `leader` id)     | 1 node, no edges, no messaging. Leader merges its own branch. |

The integration branch is always `run/<topo>-seed-01/main`. Worker branches are
`run/<topo>-seed-01/<AgentName>`. Ad-hoc worker branches may be anything they
pick (unprefixed) - those get auto-created as they commit but are not cleaned
because `ORG_BENCH_PRESERVE_BRANCHES=1`.

## When the chain finishes

1. Check `/tmp/org-bench-pilot-v3/chain.log` for any `=== exit N ===` with N != 0.
2. For each topology: verify `pilot-archives/v3/<topo>-seed-01/` exists with
   `main/` (source), `trajectory/`, `inbox/`, `run.log`, `branches-sha.txt`.
3. Verify `docs/runs/<topo>/seed-01/` exists with `index.html`, `assets/`,
   `meta.json`, and `trajectory/` (with judge.json, analysis.json, evaluator/).
4. Regenerate viewer manifest: `npm run --workspace @org-bench/viewer build-manifest`
   (or whatever the equivalent command is; see `packages/viewer/scripts/build-manifest.mts`).
5. Per-topology spot-checks (what makes each topology's meme land):
   - **Apple**: star, only leader merges; check `docs/runs/apple/seed-01/trajectory/prs/` - integrator = Chloe on every merge.
   - **Amazon**: tree; check that Iris (leader) + n1/n2 (sub-leads) all appear as merge authors across PRs.
   - **Microsoft**: divisions competing. Look for BOTH `run/microsoft-seed-01/<divA-name>` AND `run/microsoft-seed-01/<divB-name>` opening PRs for the `play` surface. Leader merge commits should explain the pick.
   - **Google**: dense peer mesh. Check `docs/runs/google/seed-01/trajectory/messages.jsonl` - peer-to-peer (non-leader) messages should be a substantial share (target >50%).
   - **Facebook**: everyone merges. Peer mesh activity should be highest of all topologies.
   - **Oracle**: review-gated. Vera should appear in `gh pr review`/`gh pr comment` tool calls but NOT in `gh pr create`. Engineering nodes open code PRs.
   - **Solo**: single-node baseline. `messages.jsonl` should only contain self-addressed messages (leader → leader). All PRs (if any) authored and merged by the leader. Use this as the "what does one agent alone ship?" control against the multi-node topologies.
6. Artifacts must be graphical (not text-only). `grep -rE "svg|canvas|<img|background-image" runs/<topo>-seed-01/main/src | head` should return results. Judge rubric `aesthetics` should be >=3 on all 7 runs (including solo).
7. Close any lingering open PRs (the `close_prs` stage should have handled this, but double-check): `gh-axi pr list --state open`. Any still-open ones, close manually.
8. Commit the archived pilot-archives/v3/ directory (and any ancillary fixes). Per the user's preferences:
   - Use `-` not `—` in commit messages
   - **Do not add Claude as co-author** (user's global rule)
   - Short, direct, conventional-commit-style messages (e.g. `feat: ...`, `fix: ...`, `docs: ...`) match the current `main` style. The older `gnhf #<N>:` style from the squashed history is not required.

## User preferences (non-negotiable)

- **No em-dashes** (`—`) in any output. Use `-` (plain dash).
- **No Claude as co-author** in commits. Ever. Not even with --amend. If a
  hook inserts it, unset the hook, don't work around it.
- **TDD** for bug fixes and new features. Tests first, code second.
- **Never commit without explicit ask.** User controls when commits happen.
- **Never push without explicit ask.**

## Known flaky behaviors (don't panic)

- `CDP command timed out: Page.captureScreenshot` during evaluator: retry logic
  handles 3 attempts with 750ms backoff. If all 3 fail, `stage_failed` event is
  emitted and the rest of finalize still runs.
- `remote ref does not exist` during any git push --delete: tolerated by
  `cleanupRunBranches`.
- Opencode occasionally becomes slow when returning long structured outputs.
  Not a correctness issue.
- Per-round timeouts are 60 min (per config). A round hitting 60 min is rare
  but possible; the specific node that timed out gets a `failure` event, the
  others continue normally.

## If something goes catastrophically wrong

- User's laptop pressure or OOM: kill everything. `pgrep -f 'opencode serve|npm run bench|bench-cli' | xargs kill -TERM`. Investigate before re-launching.
- A topology produces a completely broken artifact (no `index.html`): log it,
  let the chain continue to the next topology. Don't kill the chain for one
  bad run.
- More than one topology produces broken artifacts in sequence: stop the
  chain, ping the user, don't burn more budget.

## Files worth knowing

- `configs/run-<topo>-seed-01.ts` - the entry point invoked by each `npm run bench`
- `configs/topologies/<topo>.ts` - culture prompts, node counts, edges
- `configs/brief.md` - the brief given to every leader (graphical TCG spec)
- `packages/orchestrator/src/index.ts` - the whole multi-node runtime (~4500 lines)
- `packages/evaluator/src/index.ts` - agent-browser harness + retry logic
- `packages/judge/src/prompts/artifact-judge.v1.ts` - 8-dim rubric prompt
- `pilot-archives/v3/run-chain.sh` - chain driver
- `pilot-archives/v3/archive-run.sh` - per-run archiver
