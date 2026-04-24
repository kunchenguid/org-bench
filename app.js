(function () {
  'use strict';
  const E = window.SpreadsheetEngine;
  const grid = document.getElementById('grid');
  const wrap = document.getElementById('sheetWrap');
  const formulaBar = document.getElementById('formulaBar');
  const nameBox = document.getElementById('nameBox');
  const storagePrefix = window.SPREADSHEET_STORAGE_NAMESPACE || window.BENCHMARK_STORAGE_NAMESPACE || new URLSearchParams(location.search).get('storageNamespace') || 'microsoft-sheet';
  const key = storagePrefix + ':state';
  let rows = 100, cols = 26, cells = {}, active = { row: 1, col: 1 }, anchor = { row: 1, col: 1 }, editing = null, clipboard = null;
  let undo = [], redo = [];

  load();
  render();
  select(active.row, active.col);

  function addr(row, col) { return E.indexToCol(col) + row; }
  function bounds() {
    return { r1: Math.min(anchor.row, active.row), r2: Math.max(anchor.row, active.row), c1: Math.min(anchor.col, active.col), c2: Math.max(anchor.col, active.col) };
  }
  function snapshot() { return JSON.stringify({ rows, cols, cells, active, anchor }); }
  function restore(s) { const state = JSON.parse(s); rows = state.rows; cols = state.cols; cells = state.cells || {}; active = state.active || active; anchor = state.anchor || active; render(); select(active.row, active.col, true); save(); }
  function record() { undo.push(snapshot()); if (undo.length > 50) undo.shift(); redo = []; }
  function save() { localStorage.setItem(key, snapshot()); }
  function load() { try { const s = localStorage.getItem(key); if (s) { const state = JSON.parse(s); rows = state.rows || rows; cols = state.cols || cols; cells = state.cells || {}; active = state.active || active; anchor = state.anchor || active; } } catch (_) {} }

  function render() {
    const head = ['<thead><tr><th class="corner"></th>'];
    for (let c = 1; c <= cols; c++) head.push('<th data-col="' + c + '">' + E.indexToCol(c) + '</th>');
    head.push('</tr></thead><tbody>');
    for (let r = 1; r <= rows; r++) {
      head.push('<tr><th data-row="' + r + '">' + r + '</th>');
      for (let c = 1; c <= cols; c++) head.push('<td data-row="' + r + '" data-col="' + c + '"></td>');
      head.push('</tr>');
    }
    head.push('</tbody>');
    grid.innerHTML = head.join('');
    paintAll();
  }

  function paintAll() {
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) paintCell(r, c);
    paintSelection();
  }

  function paintCell(r, c) {
    const td = cellEl(r, c); if (!td) return;
    const raw = cells[addr(r, c)] || '';
    const value = E.evaluateCell(cells, addr(r, c));
    const shown = E.formatValue(value);
    td.textContent = shown;
    td.className = '';
    if (isNaN(Number(shown)) || shown === '') td.classList.add('text');
    if (shown[0] === '#') td.classList.add('error');
    td.title = raw && raw[0] === '=' ? raw + ' -> ' + shown : raw;
  }

  function paintSelection() {
    grid.querySelectorAll('.active,.in-range').forEach((el) => el.classList.remove('active', 'in-range'));
    const b = bounds();
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) cellEl(r, c)?.classList.add('in-range');
    cellEl(active.row, active.col)?.classList.add('active');
    nameBox.textContent = addr(active.row, active.col);
    formulaBar.value = cells[addr(active.row, active.col)] || '';
  }

  function cellEl(r, c) { return grid.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]'); }
  function select(r, c, keepAnchor) { active = { row: Math.max(1, Math.min(rows, r)), col: Math.max(1, Math.min(cols, c)) }; if (!keepAnchor) anchor = { ...active }; paintSelection(); cellEl(active.row, active.col)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); save(); }
  function commitRaw(address, raw) { if (raw === '') delete cells[address]; else cells[address] = raw; }
  function changeCell(r, c, raw) { record(); commitRaw(addr(r, c), raw); paintAll(); save(); }

  grid.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td'); if (!td) return;
    select(Number(td.dataset.row), Number(td.dataset.col), e.shiftKey);
    wrap.focus();
  });
  grid.addEventListener('mouseover', (e) => {
    if (e.buttons !== 1) return;
    const td = e.target.closest('td'); if (!td) return;
    active = { row: Number(td.dataset.row), col: Number(td.dataset.col) };
    paintSelection();
  });
  grid.addEventListener('dblclick', () => startEdit(false));

  wrap.addEventListener('keydown', (e) => {
    if (editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(false); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(true); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearRange(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(false); return; }
    if (e.key === 'Tab') { e.preventDefault(); select(active.row, active.col + (e.shiftKey ? -1 : 1)); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { e.preventDefault(); const d = arrows[e.key]; select(active.row + d[0], active.col + d[1], e.shiftKey); return; }
    if (e.key.length === 1 && !mod) { e.preventDefault(); startEdit(true, e.key); }
  });

  formulaBar.addEventListener('focus', () => formulaBar.select());
  formulaBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); changeCell(active.row, active.col, formulaBar.value); select(active.row + 1, active.col); wrap.focus(); }
    if (e.key === 'Escape') { formulaBar.value = cells[addr(active.row, active.col)] || ''; wrap.focus(); }
  });

  function startEdit(replace, firstChar) {
    const td = cellEl(active.row, active.col); if (!td) return;
    const old = cells[addr(active.row, active.col)] || '';
    td.classList.add('editing'); td.textContent = '';
    const input = document.createElement('input'); input.className = 'cell-editor'; input.value = replace ? (firstChar || '') : old; td.appendChild(input); editing = { input, old };
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); select(active.row + 1, active.col); }
      else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true); select(active.row, active.col + (e.shiftKey ? -1 : 1)); }
      else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
    });
    input.addEventListener('blur', () => { if (editing) finishEdit(true); });
  }
  function finishEdit(saveIt) { const value = editing.input.value; const old = editing.old; editing = null; if (saveIt && value !== old) changeCell(active.row, active.col, value); else paintAll(); }

  function clearRange() { record(); const b = bounds(); for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) delete cells[addr(r, c)]; paintAll(); save(); }
  function copy(cut) { const b = bounds(); const data = []; for (let r = b.r1; r <= b.r2; r++) { const row = []; for (let c = b.c1; c <= b.c2; c++) row.push(cells[addr(r, c)] || ''); data.push(row); } clipboard = { data, cut, source: b }; navigator.clipboard?.writeText(data.map((r) => r.join('\t')).join('\n')).catch(() => {}); if (cut) clearRange(); }
  function paste() { if (!clipboard) return; record(); clipboard.data.forEach((row, ri) => row.forEach((raw, ci) => { const out = raw[0] === '=' && !clipboard.cut ? E.adjustFormula(raw, active.row + ri - clipboard.source.r1, active.col + ci - clipboard.source.c1) : raw; commitRaw(addr(active.row + ri, active.col + ci), out); })); paintAll(); save(); }
  function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); }
  function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); }

  function mutateStructure(change) {
    record();
    const next = {};
    Object.keys(cells).forEach((a) => {
      const p = E.parseRef(a); let r = p.row, c = p.col;
      if (change.type === 'insertRow' && r >= change.index) r += change.count;
      if (change.type === 'insertCol' && c >= change.index) c += change.count;
      if (change.type === 'deleteRow') { if (r >= change.index && r < change.index + change.count) return; if (r >= change.index + change.count) r -= change.count; }
      if (change.type === 'deleteCol') { if (c >= change.index && c < change.index + change.count) return; if (c >= change.index + change.count) c -= change.count; }
      const raw = cells[a]; next[addr(r, c)] = raw && raw[0] === '=' ? E.transformFormula(raw, change) : raw;
    });
    cells = next;
    if (change.type === 'insertRow') rows += change.count;
    if (change.type === 'insertCol') cols += change.count;
    if (change.type === 'deleteRow') rows = Math.max(1, rows - change.count);
    if (change.type === 'deleteCol') cols = Math.max(1, cols - change.count);
    active.row = Math.min(active.row, rows); active.col = Math.min(active.col, cols); anchor = { ...active };
    render(); save();
  }

  document.getElementById('insertRow').onclick = () => mutateStructure({ type: 'insertRow', index: active.row, count: 1 });
  document.getElementById('deleteRow').onclick = () => mutateStructure({ type: 'deleteRow', index: active.row, count: 1 });
  document.getElementById('insertCol').onclick = () => mutateStructure({ type: 'insertCol', index: active.col, count: 1 });
  document.getElementById('deleteCol').onclick = () => mutateStructure({ type: 'deleteCol', index: active.col, count: 1 });
  document.getElementById('undoBtn').onclick = doUndo;
  document.getElementById('redoBtn').onclick = doRedo;
})();
