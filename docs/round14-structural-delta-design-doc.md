# Round 14 Design Doc

## Problem

The replacement branch is now aligned with current `run/google/main`, but it still lacks structural row and column insert-delete behavior in the current app model. Review feedback is explicit that this should land as a narrow delta on top of the current main test surface, not as another alternate app architecture.

## Options Considered

1. Start with visible controls only.
   - Pros: immediately visible in the browser.
   - Cons: would bypass the testable structural correctness layer reviewers asked for.
2. Add structural row and column helpers to the current app model first, cover them in `tests/app.test.js`, then wire the existing grid UI to those helpers.
   - Pros: matches the current trunk surface, keeps the delta narrow, and provides a safe base for the visible affordances.
   - Cons: browser-visible controls come after the helper layer.

## Chosen Approach

Build option 2. Add row and column insertion/deletion helpers to the current `app.js` model, update formula references and emit `#REF!` where required, then expose the operations in the header UI using the same helpers.

## Success Metrics

- `tests/app.test.js` covers row and column insertion/deletion against the current trunk app model.
- Formulas shift to keep pointing at the same data when rows or columns move.
- References to deleted rows or columns become `#REF!`.
- The current browser UI exposes visible row and column controls that trigger those operations.
