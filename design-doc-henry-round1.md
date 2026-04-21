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

## TDD plan for first slices

Each slice starts with a failing automated check, then the minimum implementation to pass it, then a browser-level confirmation where interaction matters.

1. Workbook model
- First failing unit tests: empty workbook shape, cell raw-content storage, numeric/text coercion, and address helpers for `A1` through `Z100`.
- Green condition: model API stores raw values without losing formulas and clamps coordinates to the valid 26 x 100 sheet.
- Browser confirmation: open `index.html` from `file://`, verify the grid renders 26 labeled columns and 100 labeled rows, and confirm the selected cell starts at `A1`.

2. Parser and evaluator
- First failing unit tests: arithmetic precedence, parentheses, unary minus, boolean literals, string concatenation, comparison operators, and the 12 required function calls on fixed inputs.
- Green condition: formulas evaluate to expected scalar values and syntax or function errors produce stable spreadsheet-style error markers instead of exceptions.
- Browser confirmation: enter formulas through the formula bar and confirm displayed values match the unit-test cases.

3. Dependency recalculation
- First failing unit tests: dependency graph capture for direct references and ranges, recompute order for `A1 -> B1 -> C1`, circular reference detection, and selective recalculation when only one precedent changes.
- Green condition: changing a precedent updates only impacted dependents, and cycles surface `#CIRC!` or equivalent.
- Browser confirmation: edit a precedent cell, verify dependents update immediately, then introduce a cycle and verify the visible error state is clear and recoverable.

4. Persistence namespace handling
- First failing unit tests: all persisted keys are prefixed with the injected namespace, raw formulas are serialized rather than computed values, and selection state round-trips through storage.
- Green condition: restore logic can rebuild workbook contents and active selection from namespaced storage alone.
- Browser confirmation: edit cells, reload the page, and confirm both the raw formula and selected cell restore under the benchmark namespace.

5. Grid interactions
- First failing unit tests: selection movement clamping, edit commit targets, undo stack action boundaries, and copy-paste reference shifting helpers.
- Green condition: state transitions for click, arrow keys, Enter, Tab, Escape, delete, and paste match spreadsheet expectations.
- Browser confirmation: click/select/edit/navigate in the real grid, then verify range clear, copy-paste, and undo-redo using agent-browser.

## Claim-to-check mapping

- Claim: DOM rendering is sufficient for the benchmark-scale sheet.
  Acceptance check: browser snapshot shows the full 26 x 100 grid and interactive selection on local open with no console errors.
- Claim: the workbook model preserves raw inputs safely.
  Acceptance check: unit tests assert that a formula such as `=A1+A2` is stored as raw text while the rendered value is derived separately.
- Claim: parser and evaluator correctness covers the benchmark operators and functions.
  Acceptance check: table-driven unit tests cover arithmetic, comparison, concatenation, boolean literals, cell references, ranges, and the 12 required functions.
- Claim: dependency recomputation is stable and correct.
  Acceptance check: unit tests verify topological recomputation on a small dependency chain and browser checks confirm visible dependent updates after a precedent edit.
- Claim: persistence is correctly namespaced.
  Acceptance check: unit tests inspect the storage keys written for a benchmark namespace string and reload tests verify those exact keys restore the prior sheet state.
- Claim: grid interactions are benchmark-ready.
  Acceptance check: browser checks cover click selection, typing, Enter-to-commit-and-move-down, Tab-to-move-right, arrow navigation, formula-bar editing, range clear, copy-paste, and undo-redo.

## Proposed execution order

1. Build the workbook model, parser, evaluator, and dependency recomputation.
2. Build the grid UI, formula bar, active selection, and edit flows.
3. Add range selection, clipboard, and history.
4. Add row and column insertion and deletion with reference rewriting.
5. Add persistence, polish, and browser-driven verification.
