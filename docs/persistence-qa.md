# Persistence QA Notes

This scope is limited to storage and restore behavior for the spreadsheet app.

## Integration contract

- Persist the workbook by calling `createWorkbookPersistence(...)` from `src/persistence.js`.
- Save raw cell contents in `state.cells`, keyed by address like `A1`.
- Save selection state in `state.selection.active` and optional rectangular selection in `state.selection.range` with `{ start, end }`.
- Pass the injected run namespace explicitly when available. The helper also accepts common global or dataset injection patterns.
- All persisted data lives under one namespaced key: `<namespace>:spreadsheet:session`.

## Manual verification flow

1. Open the spreadsheet and type raw values and formulas into a few cells.
2. Change the active cell and create a rectangular selection.
3. Reload the page.
4. Confirm the raw cell contents are restored, including formulas.
5. Confirm the previously active cell is selected again.
6. Confirm the rectangular selection is restored when the app supports visible range restore.
7. Inspect browser storage and verify the key is namespaced for the current run.

## Suggested browser console checks

Use these while integrating if needed:

```js
Object.keys(localStorage).filter((key) => key.includes('spreadsheet:session'))
JSON.parse(localStorage.getItem('<namespace>:spreadsheet:session'))
```
