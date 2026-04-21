# Manual Test Matrix

Owner: Henry
Purpose: Integration QA checklist against the benchmark acceptance bar.

## Boot And Rendering

1. Open `index.html` from a `file://` URL.
Expected: no runtime error, one-page spreadsheet UI, visible formula bar, visible grid, no network dependency.

2. Reload the page after a normal interaction.
Expected: app rehydrates from namespaced browser storage without blank-screening.

3. Resize from desktop width to mobile width.
Expected: controls remain readable, formula bar stays accessible, grid remains scrollable.

## Selection And Navigation

1. Click `A1`, `C3`, and `Z100`.
Expected: exactly one active cell at a time, active selection styling is unmistakable, name box follows the selection.

2. Use arrow keys from middle cells and boundary cells.
Expected: selection moves one cell per keypress and clamps or wraps consistently at edges.

3. Use `Shift+click` and `Shift+Arrow`.
Expected: rectangular range expands from active cell, active cell remains visually distinct inside the range.

## Editing

1. Type into a selected cell.
Expected: typing replaces contents when not already editing.

2. Use double-click, `Enter`, and `F2` to enter edit mode.
Expected: existing raw contents become editable without loss.

3. Commit with `Enter` and `Tab`, cancel with `Escape`.
Expected: `Enter` commits and moves down, `Tab` commits and moves right, `Escape` restores pre-edit contents.

4. Edit through the formula bar.
Expected: formula bar shows raw cell contents and commits the same data model as in-cell editing.

## Values And Formulas

1. Enter plain numbers, plain text, and formulas beginning with `=`.
Expected: numbers render as numbers, non-number literals render as text, formulas evaluate.

2. Enter arithmetic and comparison formulas.
Expected: precedence is correct and comparisons produce `TRUE` or `FALSE`.

3. Enter formulas using `&`, boolean literals, and referenced cells.
Expected: concatenation and boolean behavior match spreadsheet expectations.

4. Enter formulas using `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `IF`, `AND`, `OR`, `NOT`, `ABS`, `ROUND`, `CONCAT`.
Expected: each function evaluates correctly for scalar and range inputs where applicable.

5. Create bad syntax, unknown function, divide-by-zero, circular reference, and deleted-reference cases.
Expected: clear spreadsheet-style error markers such as `#ERR!`, `#DIV/0!`, `#CIRC!`, `#REF!`; formula bar preserves raw formula.

## Recalculation

1. Make `A3` depend on `A1` and `A2`, then edit `A1`.
Expected: dependents recompute immediately and deterministically.

2. Chain dependencies across several cells.
Expected: evaluation order is stable and results do not flicker or stall.

## Clipboard And Range Operations

1. Drag-select a rectangular range and press `Delete` or `Backspace`.
Expected: every cell in the range clears.

2. Copy, cut, and paste a single cell and a rectangular block.
Expected: copied contents land starting at the target top-left; cut clears the source after paste.

3. Copy a relative formula and paste it elsewhere.
Expected: relative references shift by offset; absolute references remain anchored.

## Undo And Redo

1. Commit a cell edit, paste a range, clear a range, then undo step by step.
Expected: each user action is undone as a single history step.

2. Redo with `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y`.
Expected: undone actions replay in order.

3. Exceed 50 edits.
Expected: recent history is retained to at least 50 actions without corruption.

## Row And Column Mutation

1. Insert a row above referenced data.
Expected: dependent formulas still point at the same logical data.

2. Delete a referenced row or column.
Expected: affected references degrade to `#REF!` without corrupting unrelated formulas.

3. Confirm insertion and deletion affordances are discoverable from headers.
Expected: feature is visible enough for first-time use.

## Persistence

1. Enter a mix of raw values and formulas, select a non-default cell, then reload.
Expected: raw contents and active selection restore exactly.

2. Inspect browser storage keys.
Expected: persisted keys are prefixed with the run-scoped namespace.
