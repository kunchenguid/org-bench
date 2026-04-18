#!/usr/bin/env bash
# Pilot v3 chain. Fresh start after clean-slate wipe.
# - maxRounds reduced to 8 (configs already updated)
# - Leader prompts now include the 8-round budget upfront
# - cleanupRunBranches gated off via ORG_BENCH_PRESERVE_BRANCHES=1
# - Opencode disk storage cleaned before each topology (prevents 5GB+ bloat)
# - Each completed topology is archived into pilot-archives/v3/<run-id>/
set -u

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$repo_root"

log_dir="/tmp/org-bench-pilot-v3"
mkdir -p "$log_dir"
chain_log="$log_dir/chain.log"

export ORG_BENCH_PRESERVE_BRANCHES=1

clean_opencode_storage() {
  # Safe: opencode server is dead between runs. Keep auth.json and bin/.
  rm -rf \
    "$HOME/.local/share/opencode/storage/session_diff" \
    "$HOME/.local/share/opencode/storage/session" \
    "$HOME/.local/share/opencode/storage/part" \
    "$HOME/.local/share/opencode/storage/message" \
    "$HOME/.local/share/opencode/snapshot" \
    "$HOME/.local/share/opencode/tool-output" \
    "$HOME/.local/share/opencode/opencode.db" \
    "$HOME/.local/share/opencode/opencode.db-shm" \
    "$HOME/.local/share/opencode/opencode.db-wal" \
    2>/dev/null || true
}

{
  echo "=== pilot-v3 chain started $(date) ==="
  echo "cleaning opencode storage before first run"
  clean_opencode_storage

  for topo in apple amazon microsoft google facebook oracle solo; do
    echo
    echo "=== starting $topo ==="
    date
    npm run bench -- "configs/run-$topo-seed-01.ts" > "$log_dir/$topo-seed-01.log" 2>&1
    echo "=== exit $? for $topo at $(date) ==="

    echo "=== archiving $topo ==="
    ./pilot-archives/v3/archive-run.sh "$topo" seed-01

    echo "=== cleaning opencode storage after $topo ==="
    clean_opencode_storage
  done

  echo
  echo "=== pilot-v3 chain done $(date) ==="
} > "$chain_log" 2>&1
