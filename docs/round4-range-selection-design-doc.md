# Round 4 Design Doc

## Problem

The sheet still behaves like a single-cell editor, but the benchmark requires rectangular selection and bulk clearing with `Delete` or `Backspace`. Without a range model, clipboard and bulk operations later will have no stable foundation.

## Options Considered

1. Jump straight to clipboard copy and paste.
   - Pros: closes a visible user workflow.
   - Cons: clipboard behavior depends on having a clear rectangular selection model first.
2. Add rectangular selection, extension, and bulk clear now.
   - Pros: introduces the missing interaction primitive behind several later requirements and is testable without browser-only hooks.
   - Cons: clipboard still remains for a later round.

## Chosen Approach

Build option 2. Extend the state model with a normalized selection rectangle anchored on the active cell, add helpers for shift-extended keyboard movement and range clearing, and render the selected rectangle distinctly in the grid.

This covers the benchmark's clear-range path while preparing the same selection model for copy, cut, and paste in later rounds.

## Success Metrics

- A normalized selection rectangle is available even when the anchor and focus are inverted.
- `Shift+Arrow` extends the selection while preserving one active cell inside the rectangle.
- Clearing a 2 by 2 selection removes all four cells' raw contents in one action.
- Clicking a cell collapses the selection back to a single active cell.
