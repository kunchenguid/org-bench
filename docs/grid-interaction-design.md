# Grid Interaction Design

## Problem statement

The spreadsheet must feel ready for evaluator interaction immediately after opening `index.html` from `file://`. The grid interaction layer needs to cover the acceptance-path mechanics before deeper formula work: 26+ columns, 100+ rows, exactly one active cell, rectangular range selection, keyboard navigation, edit semantics, clipboard copy/cut/paste, range clear, and undo/redo for at least 50 user actions.

The main risk is not raw rendering volume. The minimum grid is 100 rows x 26 columns = 2,600 cells, which is small enough for direct DOM rendering. The risk is interaction correctness: user actions must map to spreadsheet concepts consistently so formula shifting and insert/delete behavior can build on stable selection and history primitives.

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

Use a vanilla DOM grid/table for the complete interaction slice. Keep interaction state in a small controller:

- `active = { row, col }` for the single active cell.
- `anchor = { row, col }` for the opposite corner of the rectangular range.
- Undo and redo stacks store user-level cell changes and retain at least the latest 50 entries.
- The model stores raw cell contents separately from evaluated display values.

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
- Drag selection uses pointer down plus pointer enter/move to update `active` while retaining the original `anchor`.
- The range is painted with a range class; the active cell inside it remains visually distinct.
- Delete/Backspace clears all cells in the selected rectangle as one undoable action.

Clipboard semantics:

- Copy serializes selected raw cell contents as TSV.
- Cut serializes TSV and clears the source range as one undoable action.
- Paste splits TSV into rows/columns and writes from the active cell as top-left.
- When pasting formulas, relative references shift by destination offset; absolute row/column parts remain fixed.

Undo/redo semantics:

- History entries represent one user action, not a keystroke.
- `Cmd/Ctrl+Z` restores prior raw values.
- `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` reapply undone raw values.
- The stack retains at least 50 actions.

## DOM selectors and affordances

- Entry point: `index.html` directly openable via `file://`.
- Grid element: stable grid container or table selector.
- Formula bar: visible input with an accessible label.
- Active cell name: visible name box showing addresses like `A1`.
- Cell elements: stable row/column metadata for predictable evaluator automation.
- Active cell affordance: blue outline or equivalent high-contrast marker.
- Range affordance: filled rectangular highlight with active cell still distinguishable.
- Error affordance: `#ERR!`, `#DIV/0!`, `#CIRC!`, and `#REF!` render visibly in the cell while raw formula remains in the formula bar.
- Header controls: visible row/column insert/delete affordances, either via buttons, header menu, or documented shortcut.

## Data and success metrics

- Grid size: render at least 100 rows x 26 columns = 2,600 cells.
- File loading: `agent-browser open file://.../index.html` shows the grid within one browser command and `agent-browser errors` reports no uncaught console errors.
- Selection: exactly one active cell exists after load, click, arrow navigation, Shift+arrow, Shift+click, and drag.
- Navigation: arrows clamp at A1 and at the bottom/right bounds rather than moving out of range.
- Editing: click A1, type `2`, press Enter; A1 displays `2`, active moves to A2, and the name box shows `A2`.
- Formula bar: selecting a formula cell shows raw formula text, not evaluated display text.
- Ranges: Shift+arrow and drag produce a visible rectangular range with active cell distinguishable.
- Clear: Delete or Backspace clears every raw cell in the selected range as one undoable action.
- Clipboard: copy/cut/paste use TSV; cut-paste clears the source cells.
- Relative formulas: copying `=A1` from B1 to B2 shifts the pasted formula to `=A2`; `$A$1` remains fixed.
- Undo/redo: at least 50 cell/range actions can be undone with Cmd/Ctrl+Z and redone with Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y.
- Persistence: reload restores raw cell contents and active selection under the injected namespace-prefixed localStorage key.
- Unit tests: parser/model tests cover arithmetic recomputation, `SUM` ranges, circular references, comparison, boolean functions, and relative-reference shifting before those behaviors are considered complete.
