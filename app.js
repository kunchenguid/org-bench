(function () {
  const ROWS = 100;
  const COLS = 26;
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__STORAGE_NAMESPACE__ || 'sheet:';
  const model = new Spreadsheet.Model(ROWS, COLS);
  const grid = document.getElementById('grid');
  const viewport = document.getElementById('viewport');
  const formula = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  let active = { row: 0, col: 0 };
  let anchor = { row: 0, col: 0 };
  let editing = null;
  let clipboard = null;
  const undo = [];
  const redo = [];

  function key(k) { return ns + k; }
  function cloneSelection() { return { active: { ...active }, anchor: { ...anchor } }; }
  function rect() {
    return { r1: Math.min(active.row, anchor.row), c1: Math.min(active.col, anchor.col), r2: Math.max(active.row, anchor.row), c2: Math.max(active.col, anchor.col) };
  }
  function selectedCells() {
    const out = [], r = rect();
    for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) out.push({ row, col });
    return out;
  }
  function pushHistory() {
    undo.push({ cells: model.snapshot(), selection: cloneSelection() });
    if (undo.length > 50) undo.shift();
    redo.length = 0;
  }
  function restore(state) {
    model.restore(state.cells);
    active = { ...state.selection.active };
    anchor = { ...state.selection.anchor };
    render();
    save();
  }
  function save() {
    localStorage.setItem(key('cells'), JSON.stringify(model.snapshot()));
    localStorage.setItem(key('selection'), JSON.stringify(cloneSelection()));
  }
  function load() {
    try { model.restore(JSON.parse(localStorage.getItem(key('cells')) || '[]')); } catch (_) {}
    try {
      const s = JSON.parse(localStorage.getItem(key('selection')) || 'null');
      if (s) { active = s.active || active; anchor = s.anchor || active; }
    } catch (_) {}
  }
  function render() {
    grid.style.gridTemplateColumns = '48px repeat(' + model.cols + ', var(--col-w))';
    grid.innerHTML = '';
    const corner = div('corner', ''); grid.appendChild(corner);
    for (let c = 0; c < model.cols; c++) {
      const h = div('head col-head', Spreadsheet.colToName(c));
      h.dataset.col = c;
      h.addEventListener('contextmenu', headerMenu);
      grid.appendChild(h);
    }
    const r = rect();
    for (let row = 0; row < model.rows; row++) {
      const rh = div('head row-head', String(row + 1));
      rh.dataset.row = row;
      rh.addEventListener('contextmenu', headerMenu);
      grid.appendChild(rh);
      for (let col = 0; col < model.cols; col++) {
        const cell = { row, col };
        const raw = model.getRaw(cell);
        const shown = model.getDisplayValue(cell);
        const el = div('cell', shown);
        el.dataset.row = row; el.dataset.col = col;
        if (row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2) el.classList.add('in-range');
        if (row === active.row && col === active.col) el.classList.add('active');
        if (shown && !Number.isNaN(Number(shown)) && raw[0] !== '=') el.classList.add('number');
        if (shown[0] === '#') el.classList.add('error');
        el.addEventListener('mousedown', cellDown);
        el.addEventListener('mouseenter', cellDrag);
        el.addEventListener('dblclick', () => startEdit(true));
        grid.appendChild(el);
      }
    }
    updateFormula();
  }
  function div(cls, text) { const e = document.createElement('div'); e.className = cls; e.textContent = text; return e; }
  function updateFormula() { nameBox.textContent = Spreadsheet.formatCellAddress(active); formula.value = model.getRaw(active); }
  function setActive(cell, extend) {
    active = { row: Math.max(0, Math.min(model.rows - 1, cell.row)), col: Math.max(0, Math.min(model.cols - 1, cell.col)) };
    if (!extend) anchor = { ...active };
    render();
    save();
  }
  let dragging = false;
  function cellDown(e) {
    const cell = { row: Number(e.currentTarget.dataset.row), col: Number(e.currentTarget.dataset.col) };
    dragging = true;
    active = cell;
    if (!e.shiftKey) anchor = cell;
    render();
  }
  function cellDrag(e) {
    if (!dragging) return;
    active = { row: Number(e.currentTarget.dataset.row), col: Number(e.currentTarget.dataset.col) };
    render();
  }
  document.addEventListener('mouseup', () => { if (dragging) { dragging = false; save(); } });
  function commitRaw(cell, raw) {
    pushHistory();
    model.setRaw(cell, raw);
    render(); save();
  }
  function startEdit(preserve, first) {
    if (editing) return;
    const el = grid.querySelector(`.cell[data-row="${active.row}"][data-col="${active.col}"]`);
    if (!el) return;
    editing = { cell: { ...active }, before: model.getRaw(active) };
    el.classList.add('editing');
    el.textContent = '';
    const input = document.createElement('input');
    input.className = 'editor';
    input.value = preserve ? editing.before : (first || '');
    el.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', editKey);
  }
  function finishEdit(commit, move) {
    const input = document.querySelector('.editor');
    const edit = editing;
    if (!edit) return;
    editing = null;
    if (commit && input.value !== edit.before) commitRaw(edit.cell, input.value);
    else render();
    if (move) setActive({ row: active.row + move.row, col: active.col + move.col });
  }
  function editKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true, { row: 1, col: 0 }); }
    if (e.key === 'Tab') { e.preventDefault(); finishEdit(true, { row: 0, col: 1 }); }
    if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
  }
  formula.addEventListener('focus', updateFormula);
  formula.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commitRaw(active, formula.value); setActive({ row: active.row + 1, col: active.col }); }
    if (e.key === 'Escape') updateFormula();
  });
  viewport.addEventListener('keydown', e => {
    if (editing || document.activeElement === formula) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(false); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(true); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelection(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(true); return; }
    const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, 1] };
    if (dirs[e.key]) { e.preventDefault(); setActive({ row: active.row + dirs[e.key][0], col: active.col + dirs[e.key][1] }, e.shiftKey); return; }
    if (e.key.length === 1 && !mod) { e.preventDefault(); startEdit(false, e.key); }
  });
  function clearSelection() {
    pushHistory();
    for (const cell of selectedCells()) model.setRaw(cell, '');
    render(); save();
  }
  function copy(cut) {
    const r = rect();
    const data = [];
    for (let row = r.r1; row <= r.r2; row++) {
      const line = [];
      for (let col = r.c1; col <= r.c2; col++) line.push(model.getRaw({ row, col }));
      data.push(line);
    }
    clipboard = { data, origin: { row: r.r1, col: r.c1 }, cut };
    navigator.clipboard && navigator.clipboard.writeText(data.map(row => row.join('\t')).join('\n')).catch(() => {});
    if (cut) clearSelection();
  }
  function paste() {
    if (!clipboard) return;
    pushHistory();
    clipboard.data.forEach((line, rr) => line.forEach((raw, cc) => {
      const target = { row: active.row + rr, col: active.col + cc };
      if (target.row < model.rows && target.col < model.cols) model.setRaw(target, Spreadsheet.adjustFormulaReferences(raw, clipboard.origin, active));
    }));
    clipboard = null;
    render(); save();
  }
  function doUndo() { if (!undo.length) return; redo.push({ cells: model.snapshot(), selection: cloneSelection() }); restore(undo.pop()); }
  function doRedo() { if (!redo.length) return; undo.push({ cells: model.snapshot(), selection: cloneSelection() }); restore(redo.pop()); }
  function headerMenu(e) {
    e.preventDefault();
    if (e.currentTarget.dataset.row !== undefined) setActive({ row: Number(e.currentTarget.dataset.row), col: active.col });
    if (e.currentTarget.dataset.col !== undefined) setActive({ row: active.row, col: Number(e.currentTarget.dataset.col) });
    alert('Use toolbar buttons to insert/delete the selected row or column.');
  }
  function structural(fn) { pushHistory(); fn(); active.row = Math.min(active.row, model.rows - 1); active.col = Math.min(active.col, model.cols - 1); anchor = { ...active }; render(); save(); }
  document.getElementById('undo').onclick = doUndo;
  document.getElementById('redo').onclick = doRedo;
  document.getElementById('insert-row').onclick = () => structural(() => model.insertRow(active.row));
  document.getElementById('delete-row').onclick = () => structural(() => model.deleteRow(active.row));
  document.getElementById('insert-col').onclick = () => structural(() => model.insertCol(active.col));
  document.getElementById('delete-col').onclick = () => structural(() => model.deleteCol(active.col));
  load(); render(); viewport.focus();
})();
