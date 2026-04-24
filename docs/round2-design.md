# Round 2 Design: Static Spreadsheet Foundation

## Problem statement

The repository has no launchable artifact. The brief requires a static, file-openable spreadsheet with at least 26 columns, 100 rows, formula evaluation, visible selection, editing, clipboard, undo, and persistence.

## Options considered

1. Build a canvas grid first. This is likely faster for very large sheets, but it increases accessibility and editing complexity before we have a working product baseline.
2. Build a DOM table first. This is simpler to inspect, works under `file://`, and is sufficient for the required 2,600 visible cells.

## Chosen approach

Use a vanilla DOM table and a separate `SpreadsheetModel` that is testable with Node's built-in test runner. This keeps the first PR small enough to review while creating a real local artifact.

## Data and success metrics

- Grid size: 100 rows x 26 columns = 2,600 cells, matching the minimum brief requirement.
- Test coverage in this PR: arithmetic dependency recomputation and `SUM(A1:B2)` range evaluation.
- Manual acceptance target: opening `index.html` via `file://` should show the grid without console errors, allow typing values, and evaluate simple formulas.

## Follow-up gaps

- Formula-safe insert and delete row/column behavior is not complete in this foundation PR.
- Copy/paste does not yet shift relative formula references.
- Formula coverage needs more parser tests for comparison, booleans, circular references, and the remaining required functions.
