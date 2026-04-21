# Round 7 Design Doc

## Problem

The clipboard layer already shifts references with `$` absolute markers during paste, but the evaluator still only parses bare `A1`-style references. That means a pasted formula containing `$A$1`, `$A1`, or `A$1` would shift correctly in text form but fail to evaluate.

## Options Considered

1. Leave absolute references for later and focus on structural edits first.
   - Pros: moves toward insert/delete rows and columns.
   - Cons: leaves copy-paste semantics incomplete because pasted formulas with `$` markers cannot execute.
2. Extend the parser and reference model now so absolute references both evaluate and continue to shift correctly.
   - Pros: closes a real inconsistency in the formula language and de-risks later structural work.
   - Cons: slightly broadens the parser surface again.

## Chosen Approach

Build option 2. Teach the parser to recognize `$A$1`, `$A1`, and `A$1` in both direct references and range endpoints, while keeping evaluation semantics the same as relative references.

This keeps the evaluator aligned with the clipboard logic already on the branch and makes the full required reference grammar usable.

## Success Metrics

- `=$A$1+A$2+$B1` evaluates correctly.
- `=SUM($A$1:A2)` evaluates correctly across mixed absolute and relative endpoints.
- Existing relative-reference formulas continue to pass unchanged.
