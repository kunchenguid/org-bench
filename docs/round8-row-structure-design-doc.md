# Round 8 Design Doc

## Problem

The branch now covers editing, formulas, range operations, clipboard, and history, but the acceptance bar also requires structural row and column edits that keep formulas pointing at the right data when possible. Row operations are the smaller vertical slice because they only need one axis of reference shifting.

## Options Considered

1. Add row and column editing plus UI affordances in one pass.
   - Pros: closes more of the brief at once.
   - Cons: higher conflict risk and a much larger surface area for one round.
2. Add row insertion and deletion in the core first, with formula-reference updates and `#REF!` markers, then wire UI affordances later.
   - Pros: gets the hardest correctness logic under test first and isolates the row axis before columns.
   - Cons: the user-facing affordance still remains for a follow-up round.

## Chosen Approach

Build option 2. Add core helpers for inserting and deleting rows, update stored cell positions, shift formula references that cross the edited row, and convert references to deleted rows into `#REF!`.

This gives the eventual UI a correct structural engine to call and keeps the first structural slice measurable with unit tests.

## Success Metrics

- Inserting a row above existing data shifts raw cell locations downward.
- A formula like `=A2` updates to `=A3` when a row is inserted above row 2.
- Deleting a referenced row changes the formula text to `#REF!` in the affected reference position.
- A formula referencing rows below a deleted row shifts upward to keep pointing at the same data.
