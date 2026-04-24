# Integration Contract

This scaffold owns the app shell only. Feature owners should plug into the slots and state API below without replacing unrelated surfaces.

## File boundaries

- `index.html` owns the one-page document structure, formula bar slot, grid root slot, and status slot.
- `styles.css` owns shared shell tokens and chrome layout. Feature styling should extend existing classes or add feature-local classes.
- `scripts/app-state.js` owns shared state primitives and event names.
- `scripts/app.js` wires the shell to the shared store and publishes `window.App.store`.

## DOM slots

- `[data-spreadsheet-slot="grid-root"]` is for the grid renderer.
- `[data-spreadsheet-slot="formula-bar"]` is for formula bar integration.
- `[data-spreadsheet-slot="status"]` is for status text and transient operation feedback.

## Store API

- `window.App.createStore(options)` creates an isolated store.
- `window.App.store` is the app-wide store instance.
- `store.snapshot()` returns a defensive copy of dimensions, raw cell values, and selection.
- `store.hydrate(snapshot, source)` replaces raw state from persistence or tests.
- `store.selectCell(cell)` selects one cell.
- `store.selectRange(anchor, focus)` selects a rectangular range.
- `store.getCellRaw(cellOrKey)` returns the raw user-entered text.
- `store.setCellRaw(cell, raw, source)` updates raw cell text and emits a cell event.
- `store.clearRange(range, source)` clears raw cell text in a rectangular range.
- `store.on(type, handler)` subscribes to `selectionchange`, `cellchange`, `rangeclear`, `hydrate`, and `statechange`.

## Ownership boundaries

- Formula owner: evaluate raw cell text and publish rendered values. Do not change shell layout.
- Grid owner: render cells, headers, active selection, and in-cell editing. Do not own formula parsing or persistence.
- Clipboard owner: implement copy, cut, paste, and reference shifting through store actions.
- Persistence owner: hydrate and save `store.snapshot()` using the run-scoped storage namespace.
- Row/column owner: implement dimension mutations and formula reference adjustments on top of store state.
- Styling owner: polish visuals within the established shell and grid classes.
