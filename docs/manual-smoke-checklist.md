# Manual Smoke Checklist

Use this checklist against the current `index.html` opened directly with `file://`.

1. Open `index.html` and confirm the merged shell renders with the current top bar, formula bar, and 26x100 grid.
2. Confirm there are no boot-time console errors after loading `src/history.js`, `src/persistence.js`, `structure.js`, `src/runtime.js`, and `app.js`.
3. Click a few cells and confirm the visible selection still moves exactly as before.
4. In devtools, confirm `SpreadsheetRuntime.createRuntime`, `SpreadsheetHistory.createHistory`, `SpreadsheetPersistence.createPersistence`, and `StructuralEdit.applyStructuralEdit` all exist.
5. In devtools, confirm `SpreadsheetApp.runtime` exists after boot and `SpreadsheetApp.runtime.getState()` returns `{ cells, selection }`.
6. Confirm the formula input mirrors the raw value for the currently selected address when `SpreadsheetApp.runtime.store` contains cell contents for that address.

Integration contract for teammates:

- `SpreadsheetRuntime.createRuntime({ history, persistence, structure })` composes session state, undo/redo state, persistence writes, and structural rewrites.
- `runtime.store` exposes `getState()`, `setState(nextState, metadata)`, and `subscribe(listener)` for shared session state.
- `runtime.bus` exposes `on(eventName, handler)` and `emit(eventName, payload)` for cross-module events.
- `runtime.commit(nextState, source)` records a user state transition, persists it, and emits `state:change`.
- `runtime.applyStructuralEdit(operation)` delegates cell rewrites to `StructuralEdit.applyStructuralEdit(...)` and commits the result through the same shared path.
