# Round 1 Design Doc

## Problem

The repository is empty, but the benchmark requires a browser-openable spreadsheet with no build step. Round 1 should create a stable foundation that users can immediately interact with and that later rounds can extend without reworking the state model.

## Options Considered

1. Build formula parsing first.
   - Pros: starts on one of the hardest requirements.
   - Cons: no visible spreadsheet yet, harder to manually verify end-to-end, and blocks on state and interaction scaffolding anyway.
2. Build the grid, selection, editing, formula bar, and persistence first.
   - Pros: covers the first user path, creates the UI shell, and gives later formula work a stable place to plug in.
   - Cons: formulas and range operations remain for later rounds.

## Chosen Approach

Build option 2. The initial implementation will render the required 26 by 100 grid (2,600 addressable cells), support single-cell selection, keyboard navigation with clamping, in-cell editing plus formula-bar editing, and namespaced localStorage persistence of raw cell contents and active selection.

The state logic will live in a small testable core module so later rounds can add formulas, ranges, clipboard, and history without rewriting the basic model.

## Success Metrics

- Page opens directly from `file://` with no console errors.
- User can click a cell, type content, commit with `Enter`, and land on the cell below.
- Arrow keys move the active selection within the 26 by 100 bounds.
- Formula bar always shows the raw content of the active cell and can commit edits.
- Reload restores raw cell contents and active selection using a namespaced storage key.
