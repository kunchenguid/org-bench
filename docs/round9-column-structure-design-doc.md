# Round 9 Design Doc

## Problem

The branch now has the first structural-edit slice for rows, but the brief also requires column insertion and deletion with formula updates. Without the column axis, structural editing remains only half implemented and formula maintenance is inconsistent.

## Options Considered

1. Jump directly to UI affordances for the existing row logic.
   - Pros: makes one structural path user-visible sooner.
   - Cons: still leaves column semantics unimplemented in the core, so the structural model remains incomplete.
2. Mirror the tested row logic for columns first, then expose row and column affordances together.
   - Pros: closes the second axis of structural correctness and keeps the eventual UI layer thinner.
   - Cons: postpones the visible affordance one more round.

## Chosen Approach

Build option 2. Add core helpers for inserting and deleting columns, update stored cell positions, rewrite affected column references in formulas, and emit `#REF!` when a deleted column was referenced.

This finishes the structural core model before the UI wiring round.

## Success Metrics

- Inserting a column shifts stored cell contents rightward.
- A formula like `=B1` updates to `=C1` when a column is inserted before B.
- Deleting a referenced column changes the formula text to `#REF!` in the affected reference position.
- A formula referencing columns to the right of a deleted column shifts left to keep pointing at the same data.
