# Round 3 Design Doc

## Problem

The current evaluator handles arithmetic, references, and aggregate functions, but the benchmark also requires boolean literals, comparison operators, text concatenation, and seven more functions: `IF`, `AND`, `OR`, `NOT`, `ABS`, `ROUND`, and `CONCAT`.

## Options Considered

1. Pause formula work and switch to a different surface like range selection.
   - Pros: broadens coverage.
   - Cons: leaves the evaluator materially short of the benchmark's required formula language.
2. Finish the remaining required formula operators and functions now.
   - Pros: closes the mandatory evaluator surface while the parser is still fresh, and keeps all formula work in one review thread.
   - Cons: parser and coercion logic become more complex in this round.

## Chosen Approach

Build option 2. Extend the parser with comparison precedence and `&` concatenation, add support for `TRUE` and `FALSE`, and implement the seven missing required functions with spreadsheet-style truthiness and numeric coercion.

This keeps all formula work in one evolving module and covers every required function name in the brief after only three rounds.

## Success Metrics

- `=1<2`, `=2<>2`, and `=A1>=A2` display `TRUE` or `FALSE`.
- `="Total: "&SUM(A1:A2)` displays concatenated text.
- `=IF(A1>0,"yes","no")`, `=AND(TRUE, A1>0)`, and `=NOT(FALSE)` produce correct boolean/text outputs.
- `=ABS(-3)` and `=ROUND(3.6)` display the expected numeric results.
