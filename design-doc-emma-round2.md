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
