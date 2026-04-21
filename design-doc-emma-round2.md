# Spreadsheet Design Doc - Round 2

## Problem

Emma's private worktree is still empty, while the benchmark requires a spreadsheet that works directly from `file://` and supports formulas with recalculation. The next smallest useful unit is a baseline spreadsheet with a tested formula engine and dependency-aware recomputation.

## Options Considered

### 1. DOM-only cells with inline evaluation logic

- Pros: Fastest initial coding path.
- Cons: Harder to test in isolation and risky for formula regressions.

### 2. Separate pure spreadsheet core plus thin DOM layer

- Pros: Lets us use Node tests for parser and recomputation behavior, keeps `file://` runtime simple, and supports later clipboard or structural-edit work.
- Cons: Slightly more upfront structure.

## Chosen Approach

Use one plain JavaScript file that exports pure spreadsheet-core helpers for Node tests and also boots the browser UI. The core will store raw cell contents, evaluate formulas from raw values, and recursively recompute references with circular-reference detection.

## Success Metrics For This Slice

- 26 by 100 grid renders from `file://`.
- Raw contents persist with a run-scoped `localStorage` key.
- Formulas support arithmetic, parentheses, cell references, booleans, comparison, and a small function set.
- Dependent cells recompute when precedent cells change.
- Circular references return a clear error marker instead of looping.

## Deferred

- Range references and copy-paste shifting.
- Undo and redo.
- Insert and delete rows or columns.
- Rectangular selection and clipboard workflows.

## Next Slice Acceptance Checks

- Clipboard: browser-verified copy, cut, and paste across at least a 2 by 2 block, including one relative-reference formula shift example.
- Undo and redo: explicit tests and browser verification for commit, paste, and clear actions.
- Persistence: browser verification that a raw formula remains visible in the formula bar after reload while the grid shows the evaluated value.
- Edit semantics: browser verification for Enter, Tab, F2, and Escape from the active cell and formula bar.
- Error handling: explicit tests for divide-by-zero, bad syntax, and out-of-bounds references.

## Round 4 Extension

- Implement range references for function arguments so formulas like `SUM(A1:B2)` can be evaluated without adding broader parser complexity.
- Add clipboard-core helpers in the pure layer first so relative and absolute references can be shifted and tested before wiring browser clipboard events.
- Measure this slice by explicit counts: one range-function case, one non-IF boolean/comparison reuse case, one single-cell relative-vs-absolute paste case, and one rectangular 2 by 2 paste case.

## Round 7 Extension

- Add rectangular selection state to the pure layer so browser interactions can render a visible selected block instead of a single active cell only.
- Wire keyboard copy, cut, and paste in the browser against the existing pure clipboard helpers first, using an internal clipboard buffer so the feature works from `file://` without extra platform setup.
- Keep raw formulas authoritative in error states by proving a `#DIV/0!` cell still reloads with the original formula in storage.
- Measure this slice by explicit counts: one rectangular-selection helper case, one cut-clears-range case, one raw-formula error persistence case, and one browser-verified visible multi-cell selection case.

## Round 8 Extension

- Add undo-redo in the pure layer first so browser shortcuts can revert commit, cut, and paste actions without intertwining history logic with DOM concerns.
- Keep history snapshots at the spreadsheet-state level rather than inventing per-operation inverses, because the current grid is small and the benchmark values correctness over memory efficiency.
- Wire standard undo-redo shortcuts in the browser only after the pure helpers are proven with tests.
- Measure this slice by explicit counts: one commit undo-redo case, one cut undo-redo case, one paste undo-redo case, and one browser-visible cell-value reversion case.
