(function () {
  var ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_NAMESPACE__ || 'gridbook';
  var model = new SheetModel(26, 100, ns);
  try { model.load(); } catch (e) {}
  var grid = document.getElementById('grid');
  var formula = document.getElementById('formula');
  var cellName = document.getElementById('cell-name');
  var editing = null;
  var clipboard = null;
  var dragging = false;

  buildGrid();
  render();
  grid.focus();

  function buildGrid() {
    grid.innerHTML = '<div class="corner"></div>';
    for (var c = 0; c < model.cols; c++) grid.appendChild(head(SheetUtils.colName(c), 'col-head', c));
    for (var r = 0; r < model.rows; r++) {
      grid.appendChild(head(r + 1, 'row-head', r));
      for (c = 0; c < model.cols; c++) {
        var div = document.createElement('div');
        div.className = 'cell'; div.dataset.row = r; div.dataset.col = c;
        div.addEventListener('mousedown', onMouseDown);
        div.addEventListener('mouseenter', onMouseEnter);
        div.addEventListener('dblclick', function (e) { selectCell(+e.currentTarget.dataset.row, +e.currentTarget.dataset.col); startEdit(true); });
        grid.appendChild(div);
      }
    }
    document.addEventListener('mouseup', function () { dragging = false; });
  }
  function head(text, cls, index) {
    var h = document.createElement('div'); h.className = cls; h.textContent = text; h.dataset.index = index;
    h.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (cls === 'row-head') { if (confirm('Insert row above ' + text + '? Cancel deletes this row.')) model.insertRow(index); else model.deleteRow(index); }
      if (cls === 'col-head') { if (confirm('Insert column left of ' + text + '? Cancel deletes this column.')) model.insertCol(index); else model.deleteCol(index); }
      saveRender();
    });
    return h;
  }
  function keyOf(r, c) { return SheetUtils.addr(r, c); }
  function bounds() {
    return { r1: Math.min(model.selection.row, model.selection.row2), r2: Math.max(model.selection.row, model.selection.row2), c1: Math.min(model.selection.col, model.selection.col2), c2: Math.max(model.selection.col, model.selection.col2) };
  }
  function render() {
    var b = bounds();
    cellName.textContent = keyOf(model.selection.row, model.selection.col);
    formula.value = model.getRaw(cellName.textContent);
    Array.prototype.forEach.call(grid.querySelectorAll('.cell'), function (el) {
      var r = +el.dataset.row, c = +el.dataset.col, key = keyOf(r, c), val = model.getDisplay(key), raw = model.getRaw(key);
      el.textContent = val;
      el.className = 'cell';
      if (r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2) el.classList.add('range');
      if (r === model.selection.row && c === model.selection.col) el.classList.add('active');
      if (val.charAt(0) === '#') el.classList.add('error');
      if (raw !== '' && !isNaN(Number(raw)) && raw.charAt(0) !== '=') el.classList.add('number');
    });
  }
  function saveRender() { model.save(); render(); }
  function selectCell(r, c, extend) {
    r = Math.max(0, Math.min(model.rows - 1, r)); c = Math.max(0, Math.min(model.cols - 1, c));
    if (extend) { model.selection.row2 = r; model.selection.col2 = c; }
    else model.selection = { row: r, col: c, row2: r, col2: c };
    model.save(); render();
  }
  function onMouseDown(e) { selectCell(+this.dataset.row, +this.dataset.col, e.shiftKey); dragging = true; grid.focus(); e.preventDefault(); }
  function onMouseEnter() { if (dragging) selectCell(+this.dataset.row, +this.dataset.col, true); }
  function startEdit(preserve, seed) {
    if (editing) return;
    var key = keyOf(model.selection.row, model.selection.col);
    var cell = grid.querySelector('.cell[data-row="' + model.selection.row + '"][data-col="' + model.selection.col + '"]');
    var old = model.getRaw(key);
    editing = { key: key, old: old, input: document.createElement('input') };
    cell.classList.add('editing'); cell.textContent = ''; cell.appendChild(editing.input);
    editing.input.value = preserve ? old : (seed || '');
    editing.input.focus(); editing.input.select();
    editing.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { commitEdit(); move(1, 0); e.preventDefault(); }
      if (e.key === 'Tab') { commitEdit(); move(0, 1); e.preventDefault(); }
      if (e.key === 'Escape') { cancelEdit(); e.preventDefault(); }
    });
    editing.input.addEventListener('blur', commitEdit);
  }
  function commitEdit() { if (!editing) return; var ed = editing; editing = null; model.setCell(ed.key, ed.input.value); saveRender(); }
  function cancelEdit() { if (!editing) return; editing = null; render(); }
  function move(dr, dc, extend) { selectCell(model.selection.row2 + dr, model.selection.col2 + dc, extend); }
  formula.addEventListener('keydown', function (e) { if (e.key === 'Enter') { model.setCell(cellName.textContent, formula.value); saveRender(); grid.focus(); e.preventDefault(); } });
  formula.addEventListener('blur', function () { model.setCell(cellName.textContent, formula.value); saveRender(); });
  document.getElementById('insert-row').onclick = function () { model.insertRow(model.selection.row); saveRender(); };
  document.getElementById('insert-col').onclick = function () { model.insertCol(model.selection.col); saveRender(); };

  grid.addEventListener('keydown', function (e) {
    if (editing) return;
    var meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'z') { e.shiftKey ? model.redo() : model.undo(); saveRender(); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'y') { model.redo(); saveRender(); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'c') { clipboard = capture(false); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'x') { clipboard = capture(true); model.clearRange(keyOf(bounds().r1, bounds().c1), keyOf(bounds().r2, bounds().c2)); saveRender(); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === 'v') { if (clipboard) pasteClipboard(); e.preventDefault(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { model.clearRange(keyOf(bounds().r1, bounds().c1), keyOf(bounds().r2, bounds().c2)); saveRender(); e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { startEdit(true); e.preventDefault(); return; }
    if (e.key === 'Tab') { move(0, 1, e.shiftKey); e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { move(1, 0, e.shiftKey); e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { move(-1, 0, e.shiftKey); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { move(0, 1, e.shiftKey); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft') { move(0, -1, e.shiftKey); e.preventDefault(); return; }
    if (e.key.length === 1 && !meta) { startEdit(false, e.key); e.preventDefault(); }
  });
  function capture(cut) { var b = bounds(), rows = []; for (var r = b.r1; r <= b.r2; r++) { var row = []; for (var c = b.c1; c <= b.c2; c++) row.push(model.getRaw(keyOf(r, c))); rows.push(row); } return { rows: rows, origin: { row: b.r1, col: b.c1 }, cut: cut }; }
  function pasteClipboard() {
    model.pushHistory();
    clipboard.rows.forEach(function (row, r) { row.forEach(function (raw, c) { model.cells[keyOf(model.selection.row + r, model.selection.col + c)] = SheetUtils.adjustFormula(raw, model.selection.row - clipboard.origin.row, model.selection.col - clipboard.origin.col); }); });
    saveRender();
  }
})();
