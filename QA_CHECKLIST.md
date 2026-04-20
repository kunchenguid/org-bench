# Spreadsheet QA Checklist

Use this as the manual acceptance pass before merge or release.

## Launch and file loading

- [ ] Open `index.html` directly from `file://...` and confirm the grid renders without runtime errors.
- [ ] Confirm the app lands directly in the spreadsheet with no splash screen or modal.
- [ ] Confirm asset paths stay relative and the app still loads when served from a nested path.

## Grid and selection

- [ ] Confirm there are at least 26 visible columns labeled `A` through `Z` and 100 rows labeled `1` through `100`.
- [ ] Click a cell and verify exactly one active cell is clearly highlighted.
- [ ] Drag across cells and verify a rectangular range highlights with the active cell still visually distinct.
- [ ] Use `Shift+click` and `Shift+Arrow` to extend the current selection.

## Editing and navigation

- [ ] Type into a selected cell and verify the old contents are replaced.
- [ ] Double-click a cell, press `F2`, and press `Enter` from a selected cell to confirm edit mode preserves existing contents.
- [ ] Press `Enter` to commit and move the active cell down.
- [ ] Press `Tab` to commit and move the active cell right.
- [ ] Press `Escape` during edit mode and confirm the original contents are restored.
- [ ] Use all arrow keys and confirm movement clamps or wraps consistently at the sheet edges.

## Formula bar

- [ ] Select a formula cell and confirm the formula bar shows the raw formula, not the evaluated result.
- [ ] Edit a cell through the formula bar and confirm it behaves the same as in-cell editing.

## Values and formulas

- [ ] Enter plain numbers and text and confirm numbers are parsed numerically while non-numeric input stays literal.
- [ ] Verify arithmetic with precedence: `=1+2*3`, `=(1+2)*3`, `=-A1`.
- [ ] Verify comparisons: `=A1=A2`, `=A1<>A2`, `=A1<=A2`, `=A1>=A2`.
- [ ] Verify string concatenation: `="Total: "&SUM(A1:A3)`.
- [ ] Verify boolean literals and boolean functions: `TRUE`, `FALSE`, `AND`, `OR`, `NOT`.
- [ ] Verify numeric functions: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ABS`, `ROUND`.
- [ ] Verify `IF(cond, then, else)` and `CONCAT(...)`.
- [ ] Verify empty referenced cells act like `0` in numeric formulas and empty string in text concatenation.
- [ ] Create a circular reference and confirm the cell shows `#CIRC!` or an equivalent clear marker.
- [ ] Trigger bad syntax, unknown function, divide by zero, and deleted-reference cases and confirm error markers such as `#ERR!`, `#DIV/0!`, and `#REF!` render in the cell while the raw formula remains recoverable in the formula bar.

## Recalculation

- [ ] Set `A1=1`, `A2=2`, `A3=A1+A2`, then change `A1` and confirm `A3` updates immediately.
- [ ] Verify dependent chains recompute consistently across multiple referenced cells.

## Clipboard and range operations

- [ ] Copy and paste a rectangular range with `Cmd/Ctrl+C` and `Cmd/Ctrl+V`.
- [ ] Cut and paste a range with `Cmd/Ctrl+X` and confirm the source clears after paste.
- [ ] Paste a copied formula into a new location and confirm relative references shift while absolute references stay fixed.
- [ ] Press `Delete` or `Backspace` on a selected range and confirm every selected cell clears.

## Undo and redo

- [ ] Undo a single-cell edit with `Cmd/Ctrl+Z`.
- [ ] Redo with `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y`.
- [ ] Undo and redo paste, cut, and range clear actions.
- [ ] Confirm undo history is action-based, not per keystroke while typing inside an edit session.

## Structural edits

- [ ] Use the row header affordance or context menu to insert above and below a data block.
- [ ] Use the column header affordance or context menu to insert left and right of a data block.
- [ ] Delete a referenced row and confirm dependent formulas show `#REF!` where appropriate.
- [ ] Insert a row above referenced data and confirm formulas keep pointing at the same logical cells.
- [ ] Repeat the same checks for column insertion and deletion.

## Persistence

- [ ] Enter raw values and formulas, change the active selection, reload the page, and confirm both cell contents and selection restore.
- [ ] Verify persisted keys are prefixed with the injected run namespace instead of a global shared key.

## Finish bar

- [ ] The sheet feels responsive and legible on desktop and mobile widths.
- [ ] Numbers, text, and errors are visually distinct and consistent.
- [ ] No obvious console errors appear during the full acceptance pass.
