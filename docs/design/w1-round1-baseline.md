## W1 Round 1 Baseline

Author: Hana (worker, node w1)

### Context

- The assigned worktree is currently at commit `f163485` with message `empty`.
- `git ls-tree --name-only -r HEAD` returns no tracked files.
- No inbox task was delegated in this round.

### Problem

- There is no repository scaffold yet, so workers cannot safely implement feature slices without inventing structure independently.

### Proposed Next Step

- Land a minimal shared scaffold in `run/google-seed-01/main` before parallel feature work starts.
- Suggested scaffold: one top-level README describing the benchmark artifact, one source directory, and one reproducible check command.

### Data

- Files present in the worktree before this change: `.git` only.
- Tracked files in `HEAD`: `0`.

### Why This Is Useful

- Gives integrators a concrete baseline artifact to reference.
- Records the measured starting state so later changes can justify added structure against an explicit baseline.
