# Manual Smoke Checklist

Use this checklist against `index.html` opened directly with `file://`.

1. Open `index.html` and confirm the page renders without a blank screen.
2. Confirm the shell shows a title, a selected-cell box, a formula-bar placeholder, and a grid workspace placeholder.
3. Open browser devtools and confirm there are no uncaught boot-time errors.
4. In the console, confirm `SpreadsheetStore.createStore`, `SpreadsheetEvents.createEventBus`, and `SpreadsheetBootstrap.bootstrap` exist.
5. In the console, run `SpreadsheetBootstrap.registerModule({ init: ({ bus }) => bus.emit('module:loaded', { ok: true }) })` and reload. Confirm the app still boots.
6. In the console, run `SpreadsheetBootstrap.bootstrap({ root: document.getElementById('app') })` and confirm it remounts cleanly.

Integration contract for teammates:

- Shared state lives in `context.store` with `getState()`, `setState(partialState, source)`, and `subscribe(listener)`.
- Cross-module events flow through `context.bus` with `on(eventName, handler)` and `emit(eventName, payload)`.
- Feature modules should register through `SpreadsheetBootstrap.registerModule({ init(context) { ... } })` before `DOMContentLoaded`, or call `SpreadsheetBootstrap.bootstrap(...)` manually in isolated testing.
- The run-scoped storage namespace is surfaced at `context.store.getState().metadata.storageNamespace`.
