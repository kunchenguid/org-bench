## R1 Bootstrap Design Doc

Author: Sage (worker, node w3)

### Context

The current `run/google-seed-01/main` baseline is effectively empty.

### Data

- `git log --oneline -1` reports a single commit: `f163485 empty`
- top-level `ls` returns no project files
- there is no `README.md`, package manifest, or source tree yet

### Problem

Integrators do not yet have any in-repo artifact that explains the current state or establishes a canonical starting point for follow-on work.

### Proposal

Add minimal bootstrap documentation:

- this design doc to record the measured baseline
- a top-level `README.md` that states the repository is intentionally bootstrapped from an empty baseline and that future contributors should extend it incrementally

### Expected Impact

- gives reviewers a concrete, mergeable starting artifact
- reduces ambiguity about whether the empty tree is accidental
- provides a stable place for future rounds to extend documentation

### Validation

- files render as plain Markdown
- `git diff --stat` should show only documentation additions
