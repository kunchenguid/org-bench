# Spreadsheet Manual Verification Matrix

Use this as the shared integration checklist once the app is runnable. Keep bug reports tied to a specific case ID.

## Smoke

- M1 - Open the entry `html` over `file://`. The grid loads without a splash screen, without runtime errors, and is ready to type within 2 seconds.
- M2 - Confirm at least 26 columns (`A` through `Z`) and 100 rows are visible or scrollable. Column headers are letters and row headers are numbers.
- M3 - Confirm exactly one active cell is visibly selected on load.

## Cell Editing

- E1 - Click a cell, type `42`, press `Enter`. Value commits and selection moves down one row.
- E2 - Click a cell, type `hello`, press `Tab`. Value commits and selection moves right one column.
- E3 - Put content in a cell, press `F2` or `Enter` to edit in place, change text, press `Escape`. Original content is restored.
- E4 - Double-click a populated cell. Edit mode preserves the current raw contents.
- E5 - While a cell is selected, the formula bar shows that cell's raw contents. Editing in the formula bar updates the same cell.

## Navigation And Selection

- N1 - Use arrow keys from a middle cell. Selection moves one cell per keypress.
- N2 - Use arrow keys at each sheet edge. Behavior is consistent and does not move out of bounds.
- N3 - Drag from one cell to another. A rectangular range highlights and the active cell remains visually distinct.
- N4 - Hold `Shift` and press arrow keys. The selection range extends from the active cell.
- N5 - Hold `Shift` and click another cell. The selection expands to that rectangle.

## Formulas And Values

- F1 - Enter numbers and plain text. Numbers evaluate as numbers; non-numeric text stays literal.
- F2 - Enter `=1+2*3`, `=(1+2)*3`, and `=-A1`. Operator precedence, parentheses, and unary minus behave correctly.
- F3 - Enter comparisons like `=A1=A2`, `=A1<>A2`, `=A1>=A2`. Results display as `TRUE` or `FALSE`.
- F4 - Enter string concatenation like `="Total: "&A1`.
- F5 - Verify boolean literals `TRUE` and `FALSE` work in formulas.
- F6 - Verify direct references like `=A1`, mixed absolute references like `=$A1`, `=A$1`, `=$A$1`, and ranges like `=SUM(A1:A5)`.
- F7 - Verify required functions: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `IF`, `AND`, `OR`, `NOT`, `ABS`, `ROUND`, `CONCAT`.
- F8 - Verify empty referenced cells behave as `0` in numeric formulas and empty string in text formulas.
- F9 - Create a circular reference. The cell shows a clear circular error marker such as `#CIRC!`.
- F10 - Trigger syntax, bad function, divide-by-zero, and broken-reference errors. Cells show clear error markers while the formula bar preserves the raw formula.

## Recalculation

- R1 - Set `A1=1`, `A2=2`, `A3==A1+A2`. Change `A1` to `5`. `A3` updates immediately to `7`.
- R2 - Build a short dependency chain such as `A3==A1+A2`, `A4==A3*2`, `A5==A4+1`. Change an input and verify all dependents update in stable order.

## Clipboard And Relative References

- C1 - Copy a single value cell with `Cmd/Ctrl+C` and paste with `Cmd/Ctrl+V` into another cell.
- C2 - Cut a single populated cell with `Cmd/Ctrl+X` and paste it elsewhere. Source clears after paste.
- C3 - Copy a formula like `=A1+B1` from `C1` to `C2`. Relative references shift to `=A2+B2`.
- C4 - Copy a formula containing absolute references like `=$A$1+B1`. Only relative components shift after paste.
- C5 - Copy a rectangular range and paste into a single target cell. Source block lands with the target as top-left.
- C6 - Copy a rectangular range and paste into an equally sized selected range. Values land cell-by-cell.
- C7 - Select a range and press `Delete` or `Backspace`. Every cell in the range clears.

## Undo And Redo

- U1 - Commit a cell edit, then press `Cmd/Ctrl+Z`. The previous cell state returns.
- U2 - After undo, press `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y`. The action reapplies.
- U3 - Verify paste, cut, and range clear each undo as a single user action rather than per cell.

## Row And Column Operations

- O1 - Use the row header affordance to insert a row above existing data. Existing data shifts correctly.
- O2 - Use the row header affordance to delete a row. Deleted references become `#REF!` when appropriate.
- O3 - Use the column header affordance to insert and delete columns.
- O4 - Verify formulas update to keep pointing at the same logical data after row or column insertion or deletion when possible.
- O5 - Confirm unrelated formulas remain intact after row or column operations.

## Persistence

- P1 - Enter a mix of text, numbers, and formulas. Select a non-default cell. Reload the page.
- P2 - Confirm raw cell contents are restored after reload, not just evaluated values.
- P3 - Confirm the selected cell position is restored after reload.
- P4 - If the harness injects a storage namespace, inspect storage keys and confirm persisted keys are prefixed with that namespace.

## Polish Checks

- V1 - Grid typography is consistent across headers, cells, and formula bar.
- V2 - Active selection, range selection, and edit mode are all unmistakable at a glance.
- V3 - Numbers and text align consistently within the chosen visual system.
- V4 - Error cells are obvious without visually overpowering normal content.
- V5 - The app remains readable and usable at common laptop widths without layout breakage.

## Bug Report Template

- Case ID:
- Build or commit:
- Browser + OS:
- Repro steps:
- Expected:
- Actual:
- Screenshot or console errors:
