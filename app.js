(function () {
  const { createSheet, adjustFormulaReferences, adjustFormulaForStructure, indexToCol, addr, parseAddr } = window.SpreadsheetCore;
  const ROWS = 100;
  const COLS = 26;
  const storageNs = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || window.__BENCH_STORAGE_NAMESPACE__ || `sheet:${location.pathname}:`;
  const key = name => storageNs + name;
  const sheet = createSheet(ROWS, COLS);
  const grid = document.getElementById('grid');
  const wrap = document.getElementById('gridWrap');
  const formula = document.getElementById('formula');
  const namebox = document.querySelector('.namebox');
  const menu = document.getElementById('menu');
  let active = { row: 0, col: 0 };
  let anchor = { row: 0, col: 0 };
  let range = { r1: 0, c1: 0, r2: 0, c2: 0 };
  let editing = null;
  let history = [];
  let redo = [];
  let cutRange = null;
  let copyRange = null;

  function snapshot() { return { cells: sheet.entries(), active: { ...active } }; }
  function restore(snap) { sheet.replaceAll(snap.cells); active = { ...snap.active }; anchor = { ...active }; setRange(active.row, active.col, active.row, active.col); renderAll(); save(); }
  function record(before) { history.push(before); if (history.length > 50) history.shift(); redo = []; }
  function save() { localStorage.setItem(key('state'), JSON.stringify(snapshot())); }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(key('state')) || 'null');
      if (saved) { sheet.replaceAll(saved.cells || []); active = saved.active || active; anchor = { ...active }; }
    } catch (_) {}
    setRange(active.row, active.col, active.row, active.col);
  }

  function buildGrid() {
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    hr.appendChild(corner);
    for (let c = 0; c < COLS; c++) {
      const th = document.createElement('th');
      th.className = 'col-head';
      th.textContent = indexToCol(c);
      th.dataset.col = c;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = document.createElement('tbody');
    for (let r = 0; r < ROWS; r++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'row-head';
      th.textContent = r + 1;
      th.dataset.row = r;
      tr.appendChild(th);
      for (let c = 0; c < COLS; c++) {
        const td = document.createElement('td');
        td.dataset.row = r;
        td.dataset.col = c;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    grid.append(thead, tbody);
  }

  function cellEl(r, c) { return grid.querySelector(`td[data-row="${r}"][data-col="${c}"]`); }
  function clamp(v, max) { return Math.max(0, Math.min(max - 1, v)); }
  function setRange(r1, c1, r2, c2) { range = { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) }; }
  function selectedAddr() { return addr(active.row, active.col); }

  function renderAll() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) renderCell(r, c);
    namebox.textContent = selectedAddr();
    formula.value = sheet.getRaw(selectedAddr());
  }

  function renderCell(r, c) {
    const el = cellEl(r, c);
    const ref = addr(r, c);
    const raw = sheet.getRaw(ref);
    const display = raw ? sheet.getDisplay(ref) : '';
    if (!editing || editing.row !== r || editing.col !== c) el.textContent = display;
    el.className = '';
    if (r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2) el.classList.add('in-range');
    if (r === active.row && c === active.col) el.classList.add('active');
    if (raw && raw[0] !== '=' && Number.isNaN(Number(raw))) el.classList.add('text');
    if (display[0] === '#') el.classList.add('error');
  }

  function selectCell(r, c, extend) {
    active = { row: clamp(r, ROWS), col: clamp(c, COLS) };
    if (!extend) anchor = { ...active };
    setRange(anchor.row, anchor.col, active.row, active.col);
    renderAll();
    cellEl(active.row, active.col).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    save();
  }

  function commitValue(ref, value, before) {
    if (sheet.getRaw(ref) === value) return;
    record(before || snapshot());
    sheet.setCell(ref, value);
    renderAll();
    save();
  }

  function beginEdit(seed, preserve) {
    if (editing) return;
    const el = cellEl(active.row, active.col);
    const ref = selectedAddr();
    const before = snapshot();
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = preserve ? sheet.getRaw(ref) : seed;
    el.classList.add('editing');
    el.textContent = '';
    el.appendChild(input);
    editing = { row: active.row, col: active.col, input, before, original: sheet.getRaw(ref) };
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function endEdit(commit, move) {
    if (!editing) return;
    const { row, col, input, before } = editing;
    const value = input.value;
    editing = null;
    cellEl(row, col).classList.remove('editing');
    if (commit) commitValue(addr(row, col), value, before); else renderAll();
    if (move) selectCell(active.row + move.row, active.col + move.col, false);
  }

  function forSelected(fn) {
    for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) fn(r, c);
  }

  function clearSelection() {
    const before = snapshot();
    let changed = false;
    forSelected((r, c) => { const ref = addr(r, c); if (sheet.getRaw(ref)) { sheet.setCell(ref, ''); changed = true; } });
    if (changed) { record(before); renderAll(); save(); }
  }

  function serializeSelection() {
    const rows = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const vals = [];
      for (let c = range.c1; c <= range.c2; c++) vals.push(sheet.getRaw(addr(r, c)));
      rows.push(vals.join('\t'));
    }
    return rows.join('\n');
  }

  function pasteText(text) {
    const before = snapshot();
    const rows = text.replace(/\r/g, '').split('\n').map(line => line.split('\t'));
    rows.forEach((vals, rr) => vals.forEach((value, cc) => {
      const r = active.row + rr;
      const c = active.col + cc;
      if (r >= ROWS || c >= COLS) return;
      const sourceRange = cutRange || copyRange || range;
      if (value[0] === '=') value = adjustFormulaReferences(value, r - sourceRange.r1, c - sourceRange.c1);
      sheet.setCell(addr(r, c), value);
    }));
    if (cutRange) { for (let r = cutRange.r1; r <= cutRange.r2; r++) for (let c = cutRange.c1; c <= cutRange.c2; c++) sheet.setCell(addr(r, c), ''); cutRange = null; }
    record(before);
    setRange(active.row, active.col, active.row + rows.length - 1, active.col + Math.max(...rows.map(r => r.length)) - 1);
    renderAll();
    save();
  }

  function shiftCells(type, index, delta) {
    const before = snapshot();
    const next = [];
    for (const [ref, value] of sheet.entries()) {
      const pos = parseAddr(ref);
      let r = pos.row, c = pos.col;
      if (type === 'row') {
        if (delta > 0 && r >= index) r++;
        if (delta < 0 && r === index) continue;
        if (delta < 0 && r > index) r--;
      } else {
        if (delta > 0 && c >= index) c++;
        if (delta < 0 && c === index) continue;
        if (delta < 0 && c > index) c--;
      }
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) next.push([addr(r, c), value[0] === '=' ? adjustFormulaForStructure(value, type, index, delta) : value]);
    }
    sheet.replaceAll(next);
    record(before);
    renderAll();
    save();
  }

  grid.addEventListener('mousedown', event => {
    const td = event.target.closest('td');
    if (!td) return;
    endEdit(true);
    selectCell(Number(td.dataset.row), Number(td.dataset.col), event.shiftKey);
    const onMove = e => {
      const over = e.target.closest && e.target.closest('td');
      if (over) selectCell(Number(over.dataset.row), Number(over.dataset.col), true);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  grid.addEventListener('dblclick', event => { if (event.target.closest('td')) beginEdit('', true); });

  document.addEventListener('keydown', event => {
    if (document.activeElement === formula) return;
    if (editing) {
      if (event.key === 'Enter') { event.preventDefault(); endEdit(true, { row: 1, col: 0 }); }
      if (event.key === 'Tab') { event.preventDefault(); endEdit(true, { row: 0, col: 1 }); }
      if (event.key === 'Escape') { event.preventDefault(); endEdit(false); }
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); const snap = history.pop(); if (snap) { redo.push(snapshot()); restore(snap); } return; }
    if ((mod && event.key.toLowerCase() === 'y') || (mod && event.shiftKey && event.key.toLowerCase() === 'z')) { event.preventDefault(); const snap = redo.pop(); if (snap) { history.push(snapshot()); restore(snap); } return; }
    if (mod && event.key.toLowerCase() === 'c') { navigator.clipboard.writeText(serializeSelection()); copyRange = { ...range }; cutRange = null; return; }
    if (mod && event.key.toLowerCase() === 'x') { navigator.clipboard.writeText(serializeSelection()); copyRange = { ...range }; cutRange = { ...range }; return; }
    if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); navigator.clipboard.readText().then(pasteText); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearSelection(); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); beginEdit('', true); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[event.key]) { event.preventDefault(); const [dr, dc] = arrows[event.key]; selectCell(active.row + dr, active.col + dc, event.shiftKey); return; }
    if (!mod && event.key.length === 1) { event.preventDefault(); beginEdit(event.key, false); }
  });

  formula.addEventListener('focus', () => endEdit(true));
  formula.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commitValue(selectedAddr(), formula.value); selectCell(active.row + 1, active.col, false); wrap.focus(); }
    if (event.key === 'Escape') { formula.value = sheet.getRaw(selectedAddr()); wrap.focus(); }
  });
  formula.addEventListener('blur', () => commitValue(selectedAddr(), formula.value));

  grid.addEventListener('contextmenu', event => {
    const rowHead = event.target.closest('.row-head');
    const colHead = event.target.closest('.col-head');
    if (!rowHead && !colHead) return;
    event.preventDefault();
    const isRow = !!rowHead;
    const index = Number((rowHead || colHead).dataset[isRow ? 'row' : 'col']);
    menu.innerHTML = '';
    const labels = isRow ? [['Insert row above', 1], ['Delete row', -1]] : [['Insert column left', 1], ['Delete column', -1]];
    labels.forEach(([label, delta]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => { menu.hidden = true; shiftCells(isRow ? 'row' : 'col', index, delta); };
      menu.appendChild(button);
    });
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.hidden = false;
  });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.hidden = true; });

  buildGrid();
  load();
  renderAll();
  wrap.focus();
})();
