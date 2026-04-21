# Round 5 Design Doc

## Problem

The sheet now supports rectangular selection and bulk clearing, but standard clipboard flows are still missing. The brief explicitly requires copy, cut, and paste for ranges, plus formula reference shifting for relative references while preserving absolute components.

## Options Considered

1. Wire browser clipboard handlers directly in the UI first.
   - Pros: visible end-to-end behavior quickly.
   - Cons: harder to validate the formula-adjustment rules and rectangular paste semantics in isolation.
2. Add a testable core clipboard layer first, then connect browser shortcuts to it.
   - Pros: lets us verify TSV serialization, paste targeting, cut clearing, and relative-reference adjustment with unit tests before touching browser APIs.
   - Cons: adds another pure-data API to the core module.

## Chosen Approach

Build option 2. Add pure helpers that serialize the current selection to TSV, paste a TSV block into a destination rectangle, and shift formula references by row and column offsets while respecting `$` absolute markers.

This gives the UI a simple bridge to browser clipboard events while covering the brief's formula-copy semantics in tests.

## Success Metrics

- Copying a 2 by 2 selection produces two tab-separated rows.
- Pasting that TSV into a new top-left cell writes every destination cell.
- A copied formula like `=A1+$B$1+A$1+$A1` pasted one row down and one column right becomes `=B2+$B$1+B$1+$A2`.
- Cutting a selected block returns its TSV payload and clears the source cells.
