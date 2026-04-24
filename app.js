(function () {
  'use strict';

  const COLS = 26;
  const ROWS = 100;
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || 'spreadsheet-default';
  const storageKey = `${ns}:state`;
  const Engine = window.SpreadsheetEngine;
  const sheet = new Engine.SpreadsheetEngine(COLS, ROWS);
  const grid = document.getElementById('grid');
  const formula = document.getElementById('formula-input');
  const cellName = document.getElementById('cell-name');
  const editor = document.getElementById('cell-editor');
  const menu = document.getElementById('context-menu');
  const cells = [];
  let active = { row: 0, col: 0 };
  let anchor = { row: 0, col: 0 };
  let selection = { r1: 0, c1: 0, r2: 0, c2: 0 };
  let editing = false;
  let editOriginal = '';
  let clipboard = null;
  const undo = [];
  const redo = [];

  function key(row, col) { return Engine.coordToA1(row, col); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function sameSelection(a, b) { return a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2; }
  function selectedBounds(a, b) { return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) }; }

  function snapshot() { return { cells: { ...sheet.cells }, active: { ...active }, selection: { ...selection } }; }
  function restore(state) {
    sheet.cells = { ...(state.cells || {}) };
    active = { ...(state.active || { row: 0, col: 0 }) };
    anchor = { row: selection.r1, col: selection.c1 };
    selection = { ...(state.selection || selectedBounds(active, active)) };
    renderAll();
    save();
  }
  function pushHistory(before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    undo.push({ before, after });
    if (undo.length > 50) undo.shift();
    redo.length = 0;
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(snapshot()));
  }

  function load() {
    try {
      const state = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (state) {
        sheet.cells = { ...(state.cells || {}) };
        active = state.active || active;
        selection = state.selection || selectedBounds(active, active);
        anchor = { row: selection.r1, col: selection.c1 };
      }
    } catch (_) {}
  }

  function buildGrid() {
    grid.innerHTML = '';
    const corner = document.createElement('div');
    corner.className = 'corner';
    grid.appendChild(corner);
    for (let c = 0; c < COLS; c++) {
      const h = document.createElement('div');
      h.className = 'col-header';
      h.textContent = Engine.indexToCol(c);
      h.dataset.col = c;
      h.addEventListener('contextmenu', headerMenu);
      grid.appendChild(h);
    }
    for (let r = 0; r < ROWS; r++) {
      const rh = document.createElement('div');
      rh.className = 'row-header';
      rh.textContent = r + 1;
      rh.dataset.row = r;
      rh.addEventListener('contextmenu', headerMenu);
      grid.appendChild(rh);
      cells[r] = [];
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.addEventListener('mousedown', cellMouseDown);
        cell.addEventListener('dblclick', () => startEdit(true));
        grid.appendChild(cell);
        cells[r][c] = cell;
      }
    }
  }

  function renderAll() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const display = sheet.getDisplay(key(r, c));
        const el = cells[r][c];
        el.textContent = display;
        el.classList.toggle('number', display !== '' && Number.isFinite(Number(display)));
        el.classList.toggle('error', display.startsWith && display.startsWith('#'));
        const inRange = r >= selection.r1 && r <= selection.r2 && c >= selection.c1 && c <= selection.c2;
        el.classList.toggle('in-range', inRange);
        el.classList.toggle('selected', r === active.row && c === active.col);
        el.classList.toggle('active-in-range', inRange && r === active.row && c === active.col);
      }
    }
    cellName.textContent = key(active.row, active.col);
    formula.value = sheet.getRaw(key(active.row, active.col));
  }

  function select(row, col, extend) {
    active = { row: clamp(row, 0, ROWS - 1), col: clamp(col, 0, COLS - 1) };
    if (!extend) anchor = { ...active };
    selection = selectedBounds(anchor, active);
    renderAll();
    save();
  }

  function commitValue(a1, raw) {
    const before = snapshot();
    sheet.setCell(a1, raw);
    const after = snapshot();
    pushHistory(before, after);
    renderAll();
    save();
  }

  function startEdit(preserve, firstChar) {
    editing = true;
    const el = cells[active.row][active.col];
    const rect = el.getBoundingClientRect();
    editOriginal = sheet.getRaw(key(active.row, active.col));
    editor.style.display = 'block';
    editor.style.left = `${rect.left}px`;
    editor.style.top = `${rect.top}px`;
    editor.style.width = `${rect.width}px`;
    editor.style.height = `${rect.height}px`;
    editor.value = preserve ? editOriginal : (firstChar || '');
    editor.focus();
    editor.select();
  }

  function finishEdit(commit, move) {
    if (!editing) return;
    editing = false;
    editor.style.display = 'none';
    if (commit) commitValue(key(active.row, active.col), editor.value);
    else formula.value = editOriginal;
    if (move) select(active.row + move.row, active.col + move.col, false);
    grid.focus();
  }

  function clearSelection() {
    const before = snapshot();
    for (let r = selection.r1; r <= selection.r2; r++) for (let c = selection.c1; c <= selection.c2; c++) sheet.setCell(key(r, c), '');
    const after = snapshot();
    pushHistory(before, after);
    renderAll();
    save();
  }

  function getSelectionData() {
    const data = [];
    for (let r = selection.r1; r <= selection.r2; r++) {
      const row = [];
      for (let c = selection.c1; c <= selection.c2; c++) row.push(sheet.getRaw(key(r, c)));
      data.push(row);
    }
    return data;
  }

  function pasteData(data) {
    const before = snapshot();
    const rows = data.length;
    const cols = data[0] ? data[0].length : 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tr = active.row + r;
        const tc = active.col + c;
        if (tr < ROWS && tc < COLS) {
          let raw = data[r][c];
          if (raw && raw[0] === '=' && clipboard) raw = Engine.adjustFormula(raw, key(clipboard.r1 + r, clipboard.c1 + c), key(tr, tc));
          sheet.setCell(key(tr, tc), raw || '');
        }
      }
    }
    if (clipboard && clipboard.cut) {
      for (let r = clipboard.r1; r <= clipboard.r2; r++) for (let c = clipboard.c1; c <= clipboard.c2; c++) sheet.setCell(key(r, c), '');
      clipboard = null;
    }
    const after = snapshot();
    pushHistory(before, after);
    renderAll();
    save();
  }

  function cellMouseDown(event) {
    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);
    select(row, col, event.shiftKey);
    let dragging = true;
    function move(e) {
      if (!dragging) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && target.classList.contains('cell')) select(Number(target.dataset.row), Number(target.dataset.col), true);
    }
    function up() { dragging = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    grid.focus();
  }

  function headerMenu(event) {
    event.preventDefault();
    const row = event.currentTarget.dataset.row;
    const col = event.currentTarget.dataset.col;
    const isRow = row !== undefined;
    menu.innerHTML = '';
    const items = isRow ? [
      ['Insert row above', () => insertRow(Number(row))],
      ['Delete row', () => deleteRow(Number(row))],
    ] : [
      ['Insert column left', () => insertCol(Number(col))],
      ['Delete column', () => deleteCol(Number(col))],
    ];
    items.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => { menu.hidden = true; action(); };
      menu.appendChild(button);
    });
    menu.hidden = false;
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
  }

  function transformCells(type, index) {
    const next = Object.create(null);
    Object.keys(sheet.cells).forEach((a1) => {
      const ref = Engine.parseRef(a1);
      if (!ref) return;
      let row = ref.row;
      let col = ref.col;
      if (type === 'insertRow' && row >= index) row++;
      if (type === 'deleteRow') { if (row === index) return; if (row > index) row--; }
      if (type === 'insertCol' && col >= index) col++;
      if (type === 'deleteCol') { if (col === index) return; if (col > index) col--; }
      if (row < ROWS && col < COLS) {
        const raw = sheet.cells[a1];
        next[key(row, col)] = raw[0] === '=' ? Engine.transformFormulaReferences(raw, type, index) : raw;
      }
    });
    sheet.cells = next;
  }

  function insertRow(row) { const before = snapshot(); transformCells('insertRow', row); const after = snapshot(); pushHistory(before, after); renderAll(); save(); }
  function deleteRow(row) { const before = snapshot(); transformCells('deleteRow', row); const after = snapshot(); pushHistory(before, after); renderAll(); save(); }
  function insertCol(col) { const before = snapshot(); transformCells('insertCol', col); const after = snapshot(); pushHistory(before, after); renderAll(); save(); }
  function deleteCol(col) { const before = snapshot(); transformCells('deleteCol', col); const after = snapshot(); pushHistory(before, after); renderAll(); save(); }

  grid.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey) {
      const k = event.key.toLowerCase();
      if (k === 'z') { event.preventDefault(); const item = event.shiftKey ? redo.pop() : undo.pop(); if (item) { (event.shiftKey ? undo : redo).push(item); restore(event.shiftKey ? item.after : item.before); } }
      if (k === 'y') { event.preventDefault(); const item = redo.pop(); if (item) { undo.push(item); restore(item.after); } }
      if (k === 'c' || k === 'x') { clipboard = { data: getSelectionData(), r1: selection.r1, c1: selection.c1, r2: selection.r2, c2: selection.c2, cut: k === 'x' }; navigator.clipboard && navigator.clipboard.writeText(clipboard.data.map((r) => r.join('\t')).join('\n')).catch(() => {}); event.preventDefault(); }
      if (k === 'v') { event.preventDefault(); if (clipboard) pasteData(clipboard.data); else if (navigator.clipboard) navigator.clipboard.readText().then((text) => pasteData(text.split(/\r?\n/).map((r) => r.split('\t')))); }
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearSelection(); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit(true); return; }
    if (event.key === 'Tab') { event.preventDefault(); select(active.row, active.col + 1, event.shiftKey); return; }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[event.key]) { event.preventDefault(); select(active.row + moves[event.key][0], active.col + moves[event.key][1], event.shiftKey); return; }
    if (event.key.length === 1 && !event.altKey) { event.preventDefault(); startEdit(false, event.key); }
  });

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finishEdit(true, { row: 1, col: 0 }); }
    if (event.key === 'Tab') { event.preventDefault(); finishEdit(true, { row: 0, col: event.shiftKey ? -1 : 1 }); }
    if (event.key === 'Escape') { event.preventDefault(); finishEdit(false); }
  });

  formula.addEventListener('change', () => commitValue(key(active.row, active.col), formula.value));
  formula.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); commitValue(key(active.row, active.col), formula.value); select(active.row + 1, active.col, false); grid.focus(); }
    if (event.key === 'Escape') { formula.value = sheet.getRaw(key(active.row, active.col)); grid.focus(); }
  });
  document.addEventListener('click', (event) => { if (!menu.contains(event.target)) menu.hidden = true; });

  load();
  buildGrid();
  renderAll();
  grid.focus();
})();
