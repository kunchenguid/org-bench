# Round 6 Design Doc

## Problem

The sheet now supports editing, formulas, range operations, and clipboard flows, but there is still no undo/redo history. The brief requires at least 50 actions of session-scoped history, and paste/cut/delete are especially risky without a reliable way back.

## Options Considered

1. Add ad hoc undo handling inside the UI for a few event types.
   - Pros: quick path for one or two shortcuts.
   - Cons: easy to miss actions, harder to reason about, and brittle once rows or columns arrive.
2. Add a small history layer in the core state and route all user-initiated mutations through it.
   - Pros: keeps action boundaries explicit, is testable, and will scale to later row/column operations.
   - Cons: requires threading state updates through one more helper.

## Chosen Approach

Build option 2. Add a bounded history stack to the core state with explicit `pushHistory`, `undoHistory`, and `redoHistory` helpers, and update the UI so cell commits, deletes, cut, and paste are recorded as single actions.

This preserves the current session semantics the brief allows while giving later structural operations a consistent place to hook in.

## Success Metrics

- Undo restores the previous raw cell contents and selection after a single-cell edit.
- Redo reapplies the reverted edit.
- A multi-cell clear or paste is recorded as one action, not one entry per cell.
- History retains only the latest 50 user actions.
