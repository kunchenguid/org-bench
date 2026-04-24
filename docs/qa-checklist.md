# Spreadsheet QA Checklist

This checklist covers the acceptance bar from the project brief. Run it against the delivered `index.html` from a clean browser profile or with a run-scoped storage namespace.

## Judge Path Smoke Pass

Use this as the first acceptance pass before deeper coverage. It follows the path the evaluator is likely to exercise.

- Open `index.html` directly from `file://` and confirm the grid is ready for input with no runtime errors.
- Click `A1`, type `10`, press `Enter`, and confirm the active cell moves to `A2`.
- Type `20`, press `Enter`, then use arrow keys to navigate back to `A1` and across nearby cells.
- Enter `=A1+A2` in `A3` and confirm it evaluates to `30`.
- Change `A1` to `15` and confirm `A3` recalculates to `35` without a manual refresh.
- Select `A1:A3`, press `Delete` or `Backspace`, and confirm all three cells clear as one range operation.
- Re-enter `1` in `A1`, `=A1+1` in `B1`, copy `B1`, paste into `B2`, and confirm the relative reference shifts to row 2.
- Press `Cmd/Ctrl+Z` and confirm the paste is undone in one step.
- Create a referenced block, insert a row above it, and confirm dependent formulas keep pointing at the same logical data.
- Reload the page and confirm cell raw contents, evaluated values, and the active selection restore.
- Repeat any failing step once from a clean reload to distinguish product bugs from test setup mistakes.

## Setup

- Open the app directly from `file://.../index.html`.
- Confirm the grid appears within 2 seconds with no splash screen or modal.
- Open browser console and confirm there are no uncaught runtime errors.
- Confirm the formula bar is visible and shows the raw content of the active cell.

## Core Grid

- Confirm at least 26 columns are visible or reachable, labeled `A` through `Z`.
- Confirm at least 100 rows are visible or reachable, labeled `1` through `100`.
- Confirm exactly one active cell is visually distinct.
- Click another cell and confirm the active selection moves there.

## Editing And Navigation

- Click `A1`, type `10`, press `Enter`, and confirm `A1` stores `10` and selection moves to `A2`.
- Type `20`, press `Tab`, and confirm selection moves to `B2`.
- Use arrow keys at several positions and confirm selection moves predictably and clamps or wraps consistently at edges.
- Double-click or press `F2`/`Enter` on a populated cell and confirm edit mode preserves current contents.
- Start editing a populated cell, change text, press `Escape`, and confirm the previous value is restored.
- Edit through the formula bar and confirm the selected cell updates identically to in-cell editing.

## Formula Evaluation

- Enter `=A1+A2` in `A3` and confirm it evaluates to `30`.
- Change `A1` from `10` to `15` and confirm `A3` updates to `35`.
- Enter `=SUM(A1:A3)` and confirm range references evaluate correctly.
- Enter formulas using arithmetic precedence, parentheses, unary minus, comparisons, boolean literals, and string concatenation.
- Verify supported functions: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `IF`, `AND`, `OR`, `NOT`, `ABS`, `ROUND`, `CONCAT`.
- Enter a circular reference and confirm it renders a clear circular-reference error instead of hanging.
- Enter an invalid formula and confirm the cell displays an error while the raw formula remains visible in the formula bar.

## Range And Clipboard

- Select a rectangular range with drag, `Shift+click`, or `Shift+arrow`.
- Press `Delete` or `Backspace` and confirm every cell in the range clears as one action.
- Copy a multi-cell range and paste it with a single top-left destination cell selected.
- Copy a cell containing a relative formula and paste it elsewhere; confirm references shift by the paste offset.
- Copy a formula with absolute references such as `=$A$1+A$2+$A3` and confirm absolute components do not shift.
- Cut a range, paste it elsewhere, and confirm the source range clears.

## Undo And Redo

- Undo a single cell edit with `Cmd/Ctrl+Z` and confirm the previous state returns.
- Redo it with `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y`.
- Undo a paste and confirm it reverts as one action, not cell by cell.
- Undo a range delete and confirm the entire range restores.

## Rows, Columns, And References

- Find the row and column insert/delete affordances from headers without external instructions.
- Insert a row above a block of referenced data and confirm formulas still point at the same logical data.
- Delete a row or column referenced by a formula and confirm affected formulas show a clear reference error.
- Confirm unrelated formulas are not corrupted by row or column operations.

## Persistence

- Populate several cells including raw text, numbers, formulas, and an error formula.
- Select a non-default cell.
- Reload the page.
- Confirm raw cell contents, evaluated values, errors, and selected cell position restore.
- Confirm stored keys are prefixed with the run-scoped namespace when the harness injects one.

## Final Pass Criteria

- No runtime errors during normal usage.
- Every acceptance workflow can be completed with visible, understandable UI.
- The app remains responsive during edits, paste, undo, row insert/delete, and reload.
- The visual treatment feels cohesive: grid, headers, active cell, formula bar, range selection, and errors all look intentional.
