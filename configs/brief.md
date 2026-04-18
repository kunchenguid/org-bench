# Leader Brief: Spreadsheet

You are building a polished in-browser spreadsheet. The finished artifact must feel like a real tool someone would want to use to work out a quick calculation, not a demo that approximates one. There is exactly one page: the grid. A user who opens the site drops into a ready-to-type spreadsheet within a second or two. No splash screen, no tutorial modal, no landing page in front of the grid. Anything a first-time user needs to learn should be communicated by the interface itself - a visible formula bar, a clearly selected cell, keyboard shortcuts discoverable by trying them.

## Scope

Minimum scope is to build a grid-based spreadsheet with formula evaluation:

- **Grid.** At minimum 26 columns (A through Z) and 100 rows. Column headers show letters, row headers show numbers. Exactly one cell is the active selection at any time; the selection is visibly highlighted.
- **Editing.** Clicking a cell selects it. Typing replaces its contents. Double-clicking or pressing F2/Enter enters edit mode preserving current contents. Enter commits and moves the selection down. Tab commits and moves right. Escape cancels the edit and restores previous contents.
- **Navigation.** Arrow keys move the selection one cell in that direction. Don't navigate out of bounds silently; either clamp at the edges or wrap, but pick one and be consistent.
- **Formula bar.** A visible formula bar shows the raw contents of the selected cell (the formula, not the evaluated value). Editing in the formula bar is equivalent to editing in the cell.
- **Values.** Cells may contain numbers, text, or formulas. Formulas start with `=`. Anything not starting with `=` is treated as a number if it parses as one, otherwise as literal text.
- **Formulas.** Support at minimum:
  - Arithmetic: `+ - * /`, parentheses, unary minus, correct operator precedence.
  - Comparison: `=`, `<>`, `<`, `<=`, `>`, `>=`, producing boolean `TRUE`/`FALSE` values usable outside `IF`.
  - String concatenation: `&` operator (e.g. `="Total: "&SUM(A1:A5)`).
  - Boolean literals: `TRUE`, `FALSE`.
  - Cell references: `A1`, `B10`, uppercase letter column + numeric row. Each component of a reference is independently relative (`A1`) or absolute (`$A$1`, `$A1`, `A$1`). When a formula is copy-pasted to a new location, relative components shift by the offset between source and destination; absolute components do not. Range endpoints follow the same rule.
  - Range references inside functions: `A1:A10`, `B2:D5`.
  - Functions (at least these twelve): `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `IF(cond, then, else)`, `AND`, `OR`, `NOT`, `ABS`, `ROUND`, `CONCAT`. You may add more if useful.
  - References to empty cells evaluate to 0 in numeric contexts and to empty string in text contexts.
  - Circular references are detected and rendered as `#CIRC!` (or an equivalent clear error marker) rather than crashing or infinite-looping.
  - Errors (unknown function, bad syntax, divide by zero, reference to a deleted cell) render as `#ERR!`, `#DIV/0!`, `#REF!`, etc. in the cell; the raw formula is still recoverable from the formula bar.
- **Recalculation.** When a cell whose formula depends on another cell changes, dependents recompute. Order of evaluation must be stable (topological order, or iterate to fixed point with a sane cap).
- **Range selection and clipboard.** Users can select a rectangular range: click-drag between two cells, `Shift+click` to extend, or `Shift+arrow` from the active cell. The range is visibly highlighted, with the active cell inside it distinguishable. `Delete` or `Backspace` clears every cell in the range. Standard clipboard shortcuts work on the selection: `Cmd/Ctrl+C` copy, `Cmd/Ctrl+X` cut, `Cmd/Ctrl+V` paste. Pasting into a single cell uses that cell as the top-left of the source block; pasting into a matching-size range writes cell-by-cell. Cut-then-paste moves contents and clears the source.
- **Undo/redo.** `Cmd/Ctrl+Z` undoes the last user action; `Cmd/Ctrl+Shift+Z` (and `Cmd/Ctrl+Y`) redoes. Retain at least the last 50 actions. An action is a single user-initiated change (cell commit, paste, cut, range delete, insert or delete row/column) - not a per-keystroke entry. History lives for the session; it does not need to survive reload.
- **Insert and delete rows and columns.** Row and column headers expose insert-above/insert-below and delete (via right-click context menu, a header affordance, or a keyboard shortcut - your call, just make it discoverable). Formulas that reference affected cells update so the reference keeps pointing at the same data when possible; references to a cell that has been deleted render `#REF!`. Inserting or deleting must not corrupt unrelated formulas.

You can decide to add more features as needed. Follow your company culture for how to made scope tradeoffs.

## Infrastructure constraints

Use plain vanilla HTML, CSS, and JavaScript only. No TypeScript, no bundlers, no React/Vue/etc., no npm or package manager, no build step. There is no backend and no network dependency. The app must be directly usable by opening the entry HTML file from a local `file://...` URL in a browser - no dev server, no `npm install`, no compile step. If you need to split code across files, use classic `<script>` tags or self-contained inline scripts that work under `file://` (native ES module imports are blocked under `file://` in most browsers - design around that, for example by concatenating sources into a single script or by using `<script>` tags without `type="module"`).

Treat deployment as trivially static: the final artifact is just the files in a directory. The harness will copy that directory into a published run location and will also open the entry HTML directly from the local filesystem. All asset references must be relative (no absolute `/...` paths), work from a nested subpath when served over HTTP, and work from `file://` when opened locally. No build output directory - the source files are the deliverable.

Persistence is required. Reloading the page must restore every cell's raw contents (formulas preserved, not just their evaluated values) and the selected cell position. Use `localStorage` or IndexedDB. The harness will inject a run-scoped storage namespace string; every persisted key must be prefixed with that namespace so different benchmark runs do not collide in the same browser profile.

## Rendering is open

A spreadsheet is a productivity tool; build it like one. DOM (a CSS grid, HTML table, absolutely-positioned divs), `<canvas>` (2D or WebGL), SVG, or any mix are all fine. Pick whatever lets you ship a crisp grid with responsive editing and clear selection.

## Aesthetic latitude is yours

No mandated visual language. Modern flat, classic grey grid, notebook paper, dark-mode terminal, colorful "Numbers-for-Mac" feel, minimalist brutalism - all fair. But whatever direction you pick, carry it through every surface: column headers, active cell treatment, formula bar, error markers, typography.

The bar is that it feels like a finished tool. Readable grid at a glance. Active cell unmistakable. Formula bar legible. Numbers and text aligned consistently within a column convention. Errors obvious but not alarming. No typographic drift (don't ship three fonts).

## Acceptance bar

A user must be able to open the site and land on a ready grid without runtime errors, click a cell, type a number, hit Enter and land on the cell below, navigate with arrows, enter a formula like `=A1+A2` or `=SUM(A1:A5)`, see it evaluate to a number, modify a precedent cell and watch dependents update, select a rectangular range and clear it with `Delete`, copy a cell containing a relative formula and paste it into a new location where the references shift correctly, undo the paste with `Cmd/Ctrl+Z`, insert a row above a block of data and watch dependent formulas keep pointing at the right cells, reload mid-session, and resume with all cell contents and the selection intact.

The evaluator will interact with the built site like a real user. It will inspect the grid, click and drag to select ranges, type values and formulas, copy-paste formulas to verify reference adjustment, insert and delete rows and columns, undo and redo, reload mid-session, and verify state restores. This benchmark ships no hidden test hooks, mandated selectors, or implementation contract; build for clarity and responsiveness in the rendered interface itself.

The result product must pass the bar of something your company would launch in real world, following your company's cultural values.
