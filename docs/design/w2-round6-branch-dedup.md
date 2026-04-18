## W2 Round 6 Branch De-duplication

Author: Sage (worker, node w2)

### Context

- `run/google-seed-01/main` has now advanced to `23eecb9` via PR 134.
- That merge already includes unsupported-hash normalization in the shared app shell.
- PR 127 still carries older overlapping route-safety edits plus tests written against the pre-merge surface.

### Problem

- Keeping duplicate app logic in the worker branch makes review noisy and obscures the small remaining value.
- The branch should converge toward the smallest diff that is still useful for integrators to evaluate.

### Proposal

- Drop the now-redundant normalize-hash edits from the worker branch.
- Keep only the route-level accessibility improvement that main still lacks: `aria-current="page"` on the active nav item, with a focused test that respects the gallery route already shipped on main.

### Data

- Current run-main head: `23eecb9 Merge pull request #134`
- Current worker-vs-main diff still touches `src/app.tsx` and `src/app.test.tsx` even though hash normalization is already present on main.

### Expected Outcome

- PR 127 becomes smaller and easier to review.
- The remaining code delta is limited to one accessibility improvement plus design-doc context.
