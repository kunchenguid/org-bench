# Round 3 Design: Grid Interaction Foundation

## Problem statement

The spreadsheet must feel ready for evaluator interaction immediately after opening `index.html` from `file://`. The grid interaction layer needs to cover the acceptance-path mechanics before deeper formula work: 26+ columns, 100+ rows, exactly one active cell, rectangular range selection, keyboard navigation, edit semantics, clipboard copy/cut/paste, range clear, and undo/redo for at least 50 user actions.

The main risk is not raw rendering volume. The minimum grid is 100 rows x 26 columns = 2,600 cells, which is small enough for direct DOM rendering. The risk is interaction correctness: user actions must map to spreadsheet concepts consistently so later formula shifting and insert/delete behavior can build on stable selection and history primitives.

## Options considered

1. Canvas grid with custom hit testing.
   - Pros: Scales better if we later render tens of thousands of rows.
   - Cons: Requires custom text editing, accessibility roles, selection painting, clipboard mapping, and browser smoke testing. Higher implementation risk for the current 2,600-cell target.
2. DOM table with one `td` per cell.
   - Pros: Native layout, straightforward evaluator interaction, simple selectors, easy active/range styling, works under `file://` with classic scripts, and 2,600 cells is within normal DOM capacity.
   - Cons: Less scalable for very large sheets and requires care to avoid excessive full-grid refresh work.
3. CSS grid of div cells.
   - Pros: Flexible styling and easier virtualization later.
   - Cons: Recreates more table semantics manually, including headers and screen-reader role mapping.

## Chosen approach

Use a vanilla DOM table for the first complete interaction slice. Keep interaction state in a small controller:

- `active = { row, col }` for the single active cell.
- `anchor = { row, col }` for the opposite corner of the rectangular range.
- `undo` and `redo` stacks storing user-level cell changes; cap `undo` at 50 entries.
- `SpreadsheetModel` stores raw cell contents and evaluates display values.

Navigation clamps at the grid edges. This is simpler and more predictable than wrapping: pressing ArrowLeft on A1 leaves the selection at A1 instead of jumping to another row.

Editing semantics:

- Click selects a cell.
- Double-click, Enter, or F2 starts edit mode preserving current contents.
- Typing a printable key starts edit mode replacing current contents.
- Enter commits and moves down.
- Tab commits and moves right.
- Escape cancels edit.
- Formula bar edits the raw cell content and commits on Enter.

Range semantics:

- Shift+click and Shift+arrow extend from `anchor` to `active`.
- Drag selection should use pointer down + pointer enter/move to update `active` while retaining the original `anchor`.
- The range is painted with `.range`; the active cell inside it also has `.active`.
- Delete/Backspace clears all cells in the selected rectangle as one undoable action.

Clipboard semantics:

- Copy serializes selected raw cell contents as TSV.
- Cut serializes TSV and clears the source range as one undoable action.
- Paste splits TSV into rows/columns and writes from the active cell as top-left.
- When pasting formulas, relative references shift by destination offset; absolute row/column parts remain fixed. This requires a formula-reference transform helper before paste applies changes.

Undo/redo semantics:

- History entries are arrays of `{ ref, before, after }` and represent one user action.
- `Cmd/Ctrl+Z` restores `before` values.
- `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` restore `after` values.
- The stack retains at least 50 actions; implementation target is exactly the latest 50 to keep memory bounded.

## DOM selectors and affordances

- Entry point: `index.html` directly openable via `file://`.
- Grid table: `#grid`.
- Scroll container: `#grid-wrap`.
- Formula bar: `#formula-bar` with `aria-label="Formula bar"`.
- Active cell name: `#name-box`, showing addresses like `A1`.
- Cell elements: `td[data-row="0"][data-col="0"]` for A1, zero-based indices for predictable automation.
- Active cell affordance: `td.active` has a blue outline.
- Range affordance: `td.range` has a pale blue fill; `td.active.range` keeps the active outline.
- Error affordance: `td.error` displays `#ERR!`, `#DIV/0!`, or `#CIRC!` in red text.
- Header action buttons: `#insert-row`, `#delete-row`, `#insert-col`, `#delete-col`; these remain visible while formula-safe shifting is implemented.

## Data and success metrics

- Grid size: render at least 100 rows x 26 columns = 2,600 cells.
- File loading: `agent-browser open file://.../index.html` shows the grid within one browser command and `agent-browser errors` reports no uncaught console errors.
- Selection: exactly one `td.active` exists after load, click, arrow navigation, Shift+arrow, and Shift+click.
- Navigation: arrows clamp at A1 and at the bottom/right bounds rather than moving out of range.
- Editing: click A1, type `2`, press Enter; A1 displays `2`, active moves to A2, and `#name-box` shows `A2`.
- Formula bar: selecting a formula cell shows raw formula text, not evaluated display text.
- Ranges: Shift+arrow and drag produce a visible rectangular `.range` set with active cell distinguishable.
- Clear: Delete or Backspace clears every raw cell in the selected range as one undoable action.
- Clipboard: copy/cut/paste use TSV; cut-paste clears the source cells.
- Relative formulas: copying `=A1` from B1 to B2 shifts the pasted formula to `=A2`; `$A$1` remains fixed.
- Undo/redo: at least 50 cell/range actions can be undone with Cmd/Ctrl+Z and redone with Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y.
- Persistence: reload restores raw cell contents and active selection under the injected namespace-prefixed localStorage key.
- Unit tests: parser/model tests cover arithmetic recomputation, `SUM` ranges, circular references, comparison, boolean functions, and relative-reference shifting before those behaviors are considered complete.

## Current PR status and gaps

- Implemented in PR 594: DOM table, active cell, formula bar, keyboard edit path, Shift+arrow/Shift+click range path, Delete clear, basic paste, undo/redo stack, persistence, arithmetic formulas, and `SUM` ranges.
- Needs follow-up before merge or in the next patch on the same PR: drag range selection, relative-reference formula shifting on paste, robust cut event handling, and automated tests for 50-action undo/redo.
- Insert/delete row and column formula shifting is outside this interaction doc but remains required by the full brief.
