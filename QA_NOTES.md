# Manual QA Notes

## Verified in current branch

- App opens directly to the grid with no splash surface.
- Grid renders 26 columns by 100 rows with sticky headers.
- Single-cell selection is visible and persisted.
- Typing replaces the selected cell contents.
- `Enter`, `Tab`, `Escape`, arrow keys, `F2`, and double click work for the current single-cell editing flow.
- Formula bar shows and edits the raw cell contents.
- Raw formulas persist and simple arithmetic references recompute.
- Circular references render as `#CIRC!`.
- Session state restores from namespaced `localStorage`.
- Visual polish pass: stronger active-cell affordance, selected-cell name box, numeric alignment, formula tinting, and clearer error styling.

## Known gaps against the brief

- No rectangular range selection yet.
- No clipboard copy, cut, or paste yet.
- No undo or redo yet.
- No row or column insertion or deletion yet.
- Formula engine is still partial: no ranges, absolute references, comparison operators, concatenation, or built-in functions yet.
- No explicit `#REF!` handling yet.
- No manual browser regression script yet beyond the checklist above.
