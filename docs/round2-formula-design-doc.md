# Round 2 Design Doc

## Problem

The current shell stores and restores raw cell text, but every cell still renders that raw text. The benchmark requires formulas to evaluate and recompute when precedent cells change, so the next slice should make entered formulas useful without taking on the full spreadsheet surface area at once.

## Options Considered

1. Add the full formula surface now, including comparisons, booleans, and every required function.
   - Pros: closes more of the benchmark in one pass.
   - Cons: higher risk, larger parser surface, and slower feedback if the first evaluator shape is wrong.
2. Add a minimal evaluator that covers the most common paths first: numbers, text, arithmetic, cell references, rectangular ranges, and core aggregate functions.
   - Pros: unlocks visible spreadsheet computation, keeps the parser small enough to validate with unit tests, and establishes the dependency traversal needed for later features.
   - Cons: some formula requirements still remain for later rounds.

## Chosen Approach

Build option 2. The evaluator will cover arithmetic (`+ - * /` and parentheses), single-cell references, range references inside functions, and the first five aggregate functions: `SUM`, `AVERAGE`, `MIN`, `MAX`, and `COUNT`.

This slice is enough to make formulas useful across the full 26 by 100 grid while keeping the new parser surface constrained to a few expression forms. The state layer will expose one display-value API so the UI does not need formula-specific branching.

## Success Metrics

- A raw value like `42` displays as `42`, while `hello` displays as `hello`.
- A formula like `=1+2*3` displays `7`.
- A formula like `=A1+A2` recomputes when either precedent changes.
- A range function like `=SUM(A1:A3)` aggregates across three cells.
- Circular references produce a clear error marker instead of recursion or crashes.
