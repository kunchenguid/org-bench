(function () {
  const { SpreadsheetModel, colName, cellId, DEFAULT_ROWS, DEFAULT_COLS } = window.SpreadsheetCore;
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || 'gridline-default';
  const key = ns + ':state';
  const grid = document.getElementById('grid'), formula = document.getElementById('formula-input'), label = document.getElementById('active-cell');
  let sheet = load(), active = sheet.selection || { row: 0, col: 0 }, anchor = { ...active }, range = { start: { ...active }, end: { ...active } }, editing = null, clip = null;
  document.getElementById('insert-row').onclick = () => mutate(() => sheet.insertRow(active.row));
  document.getElementById('delete-row').onclick = () => mutate(() => sheet.deleteRow(active.row));
  document.getElementById('insert-col').onclick = () => mutate(() => sheet.insertCol(active.col));
  document.getElementById('delete-col').onclick = () => mutate(() => sheet.deleteCol(active.col));
  formula.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mutate(() => sheet.setCell(active.row, active.col, formula.value)); move(1, 0, false); grid.focus(); } if (e.key === 'Escape') { formula.value = sheet.getRaw(active.row, active.col); grid.focus(); } });
  formula.addEventListener('change', () => mutate(() => sheet.setCell(active.row, active.col, formula.value)));
  grid.addEventListener('mousedown', e => { const c = e.target.closest('.cell'); if (!c) return; select(Number(c.dataset.row), Number(c.dataset.col), e.shiftKey); grid.focus(); });
  grid.addEventListener('dblclick', () => beginEdit(false));
  grid.addEventListener('keydown', e => {
    if (editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? sheet.redo() : sheet.undo(); active = sheet.selection || active; render(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); sheet.redo(); render(); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); clip = sheet.copyCells(bounds()); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); clip = sheet.copyCells(bounds()); mutate(clearRange); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); if (clip) mutate(() => sheet.pasteCells(active.row, active.col, clip)); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); mutate(clearRange); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit(false); return; }
    if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false); return; }
    const m = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1] }[e.key];
    if (m) { e.preventDefault(); move(m[0], m[1], e.shiftKey); return; }
    if (e.key.length === 1 && !mod) { e.preventDefault(); beginEdit(true, e.key); }
  });
  document.addEventListener('paste', e => { if (document.activeElement !== grid) return; e.preventDefault(); const rows = e.clipboardData.getData('text/plain').split(/\r?\n/).filter(Boolean).map(r => r.split('\t')); mutate(() => sheet.pasteCells(active.row, active.col, { rows, source: { ...active } })); });
  function load() { try { const data = JSON.parse(localStorage.getItem(key) || 'null'); if (data) return SpreadsheetModel.fromJSON(data); } catch (_) {} return new SpreadsheetModel(DEFAULT_ROWS, DEFAULT_COLS); }
  function persist() { sheet.selection = active; localStorage.setItem(key, JSON.stringify(sheet.toJSON())); }
  function select(row, col, extend) { active = { row: clamp(row, 0, sheet.rows - 1), col: clamp(col, 0, sheet.cols - 1) }; if (extend) range.end = { ...active }; else { anchor = { ...active }; range = { start: { ...active }, end: { ...active } }; } paint(); persist(); }
  function move(r, c, extend) { select(active.row + r, active.col + c, extend); }
  function mutate(fn) { sheet.record(); fn(); render(); persist(); }
  function bounds() { return { start: { row: Math.min(range.start.row, range.end.row), col: Math.min(range.start.col, range.end.col) }, end: { row: Math.max(range.start.row, range.end.row), col: Math.max(range.start.col, range.end.col) } }; }
  function clearRange() { const b = bounds(); for (let r = b.start.row; r <= b.end.row; r++) for (let c = b.start.col; c <= b.end.col; c++) sheet.setCell(r, c, ''); }
  function beginEdit(replace, seed) { const node = grid.querySelector(`.cell[data-row="${active.row}"][data-col="${active.col}"]`); if (!node) return; const input = document.createElement('input'); editing = input; input.value = replace ? seed : sheet.getRaw(active.row, active.col); node.textContent = ''; node.appendChild(input); input.focus(); input.select(); input.onkeydown = e => { if (e.key === 'Enter') finish(true, 1, 0, e); if (e.key === 'Tab') finish(true, 0, e.shiftKey ? -1 : 1, e); if (e.key === 'Escape') finish(false, 0, 0, e); }; input.onblur = () => editing && finish(true, 0, 0); }
  function finish(commit, r, c, e) { if (e) e.preventDefault(); const value = editing.value; editing = null; if (commit) mutate(() => sheet.setCell(active.row, active.col, value)); else render(); if (r || c) move(r, c, false); grid.focus(); }
  function render() { grid.style.setProperty('--cols', sheet.cols); grid.replaceChildren(); const corner = div('corner', ''); grid.append(corner); for (let c = 0; c < sheet.cols; c++) grid.append(div('col-head', colName(c))); for (let r = 0; r < sheet.rows; r++) { grid.append(div('row-head', String(r + 1))); for (let c = 0; c < sheet.cols; c++) grid.append(cell(r, c)); } paint(); }
  function cell(row, col) { const n = div('cell', sheet.getDisplay(row, col)); n.classList.toggle('number', /^-?\d+(\.\d+)?$/.test(n.textContent)); n.classList.toggle('error', n.textContent.startsWith('#')); n.dataset.row = row; n.dataset.col = col; n.setAttribute('role', 'gridcell'); n.title = sheet.getRaw(row, col); return n; }
  function paint() { label.textContent = cellId(active.row, active.col); formula.value = sheet.getRaw(active.row, active.col); const b = bounds(); grid.querySelectorAll('.cell').forEach(n => { const r = Number(n.dataset.row), c = Number(n.dataset.col); n.classList.toggle('active', r === active.row && c === active.col); n.classList.toggle('in-range', r >= b.start.row && r <= b.end.row && c >= b.start.col && c <= b.end.col); }); }
  function div(cls, text) { const n = document.createElement('div'); n.className = cls; n.textContent = text; return n; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  render(); grid.focus();
})();
