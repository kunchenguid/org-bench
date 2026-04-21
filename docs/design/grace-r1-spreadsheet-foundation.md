## Problem statement

The repository starts empty, but the benchmark requires a local-first spreadsheet that opens directly from `file://`, supports a visible grid immediately, and grows into formulas, range operations, history, and structural edits without rewrites.

This round's goal is to establish the shell and the core state helpers needed for deterministic selection and namespaced persistence, while documenting how the implementation can extend to formulas, clipboard, undo/redo, and structural edits without a rewrite.

## Data

- Current product files at start of work: 0.
- Required minimum visible grid from the brief: 26 columns x 100 rows = 2,600 visible cells.
- Required storage isolation: every persisted key must be prefixed by the run namespace.
- Required deployment target: direct `file://` open with no build step.

## Options considered

### Option 1 - `contenteditable` cell grid

Pros:
- Lowest initial code volume.

Cons:
- Browser-native editing behavior conflicts with spreadsheet editing rules.
- Harder to make keyboard navigation, selection, and history deterministic.

### Option 2 - DOM grid with explicit state model

Pros:
- Clear control over selection, formula bar synchronization, persistence, and future formula recalculation.
- Compatible with plain HTML/CSS/JS and `file://`.

Cons:
- More initial code than `contenteditable`.

### Option 3 - Canvas-first grid with DOM overlays for editing

Pros:
- High visual control.
- Potentially lower DOM count if the sheet grows much larger later.

Cons:
- Keyboard focus, text selection, and copy/paste behavior still need DOM overlays, so the hardest judged UX remains custom.
- Range handles, formula bar synchronization, and browser clipboard interaction under `file://` become more complex earlier.
- Harder to inspect and verify with the browser harness because semantic cells are not naturally present in the DOM.

## Chosen approach

Use a DOM grid with a single JavaScript state model.

Why DOM grid over canvas for this benchmark:

- The judged interactions are keyboard-heavy and editing-heavy. Native focusable DOM cells and inputs make active-cell movement, formula-bar editing, and browser clipboard shortcuts more predictable than a canvas event system.
- The browser harness inspects and interacts with the rendered page like a real user. DOM cells provide stable semantics for click, drag, focus, and text entry under `file://` without custom hit-testing.
- Canvas would still need hidden DOM editors and selection plumbing for text input, so it adds rendering complexity without reducing the hardest interaction risk in the brief.

Round 2 implementation target:

- `index.html` spreadsheet shell
- `styles.css` tool-quality grid styling
- `core.js` pure helpers for coordinates and namespaced persistence keys
- `app.js` grid rendering, selection, formula bar synchronization, and local persistence

Follow-on implementation targets:

- formula parser and evaluator with dependency tracking
- clipboard and range selection with relative and absolute reference rewriting
- undo/redo stack with user-action granularity
- row and column insertion and deletion with reference rewriting and `#REF!` behavior

## TDD plan

- Start each feature with a failing unit test for the pure helper that drives it.
- Keep parser, evaluator, dependency ordering, and reference rewriting in testable functions before wiring UI events.
- Use `node --test` for pure JavaScript behavior that does not require a browser.
- Use `agent-browser` for browser-level verification under `file://` once unit tests are green.
- For interaction-heavy features, add a small helper-level test first, then verify the full workflow in the browser harness.

Planned test slices:

- coordinates and selection clamping
- namespaced persistence keys and state serialization
- formula tokenizing and evaluation
- relative and absolute reference rewriting on paste
- insert and delete rewrite behavior for formulas
- undo and redo history transitions

## Success metrics

- Opening `index.html` from `file://` renders a 26x100 grid with no console errors.
- Exactly one active cell is visible at a time.
- Formula bar always reflects the selected cell's raw contents.
- Persisted data uses a namespace-prefixed key.
- Browser verification shows arrow-key movement stays inside bounds.
- Copying a relative formula and pasting it to a new location rewrites relative components by the source-to-destination offset while preserving absolute components.
- Inserting or deleting rows and columns updates references structurally, with deleted targets surfacing as `#REF!`.
- Circular references render a stable error marker instead of looping or crashing.
- Undo/redo retains at least 50 user actions and reverses paste, clear, and structural edits as one action each.

## Risks and mitigations

- Risk: UI logic becomes hard to test.
  - Mitigation: keep coordinate and persistence helpers in `core.js` with direct unit tests.
- Risk: later formula work may require state reshaping.
  - Mitigation: store raw cell contents in a sparse map keyed by cell address from the start.
- Risk: clipboard and reference rewrite bugs may only show up in integrated browser flows.
  - Mitigation: test rewrite helpers directly first, then verify copy/paste under `agent-browser` from `file://`.
- Risk: row and column mutations can corrupt unrelated formulas.
  - Mitigation: perform structural rewrites on parsed references, not naive string replacement.
