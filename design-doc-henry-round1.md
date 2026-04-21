# Spreadsheet design doc - round 1

Author: Henry

## Problem statement

We are starting from an empty repository and need to ship a single-page spreadsheet that works directly from `file://` with no build step. The brief sets a clear minimum feature bar: a 26 x 100 grid, formula evaluation with 12 required functions, rectangular range selection, clipboard support, undo/redo for at least 50 actions, row and column insertion and deletion with reference repair, and persistence of raw cell contents plus selection.

## Options considered

### 1. HTML table with one DOM node per cell

Pros:
- Smallest implementation for the required 2,600 visible cells.
- Native focus, selection, and accessibility primitives help keyboard support.
- Easy to inspect and debug during agent-browser validation.

Cons:
- Header + cell event handling can get tangled if model and view are not separated.
- Large DOM updates can become expensive if recalculation redraws the whole grid.

### 2. Canvas-rendered grid with overlay editors

Pros:
- Strong control over rendering and selection visuals.
- Better long-term scaling if the grid grows far beyond 2,600 visible cells.

Cons:
- Higher implementation cost for hit testing, text layout, clipboard flows, and editing.
- More risk in round 1 because the benchmark evaluates real user interactions, not just visuals.

### 3. Hybrid DOM spreadsheet with model-driven state

Pros:
- Keeps the grid in DOM for interaction clarity while isolating evaluation, history, persistence, and reference rewriting in plain JavaScript modules.
- Smallest path to shipping the benchmark-critical features with low runtime risk under `file://`.

Cons:
- Still requires careful redraw boundaries to keep edits responsive.

## Chosen approach

Use option 3.

Implementation shape:
- `index.html` as the single entry point with a formula bar, grid shell, and lightweight status affordances.
- Plain script files loaded with classic `<script>` tags so the app works under `file://`.
- A normalized workbook model keyed by cell address storing raw input, parsed dependencies, computed value, and error state.
- A formula engine with tokenization, parsing to a small AST, dependency tracking, and stable recomputation.
- A selection model that supports active cell, rectangular range anchor/focus, and edit mode.
- A history stack that records user actions at commit granularity instead of per keystroke.
- Persistence in `localStorage` using the injected benchmark namespace prefix for all keys.

## Trade-offs

- We will optimize for correctness and interaction completeness first, not unbounded sheet size. The benchmark minimum is 2,600 cells, so full-DOM rendering is acceptable if updates stay scoped.
- Formula parsing and reference rewriting will be implemented once in a reusable way because row and column insertion, deletion, copy, and paste all depend on the same address semantics, including mixed absolute and relative references.
- Clipboard interoperability will prioritize tab/newline text blocks because that matches browser clipboard behavior and spreadsheet expectations.

## Success metrics

- Functional coverage: all benchmark minimums implemented, including the 12 named functions and 26 x 100 grid.
- Correctness: relative and absolute references shift correctly on paste; deleted references surface `#REF!`; circular references surface a clear circular error.
- Responsiveness: initial interactive render feels immediate on local open; single-cell edits and arrow navigation remain visually synchronous; recalculation after a small precedent change only recomputes impacted dependents.
- Persistence: reload restores raw formulas and current selection using namespaced storage keys.
- Validation: agent-browser pass over entry, editing, formulas, range clear, undo/redo, structural row or column edits, and reload restore.

## Proposed execution order

1. Build the workbook model, parser, evaluator, and dependency recomputation.
2. Build the grid UI, formula bar, active selection, and edit flows.
3. Add range selection, clipboard, and history.
4. Add row and column insertion and deletion with reference rewriting.
5. Add persistence, polish, and browser-driven verification.
