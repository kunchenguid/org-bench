(function () {
  'use strict';

  const Core = window.SpreadsheetCore;
  const baseRows = 100;
  const baseCols = 26;
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__STORAGE_NAMESPACE__ || 'quicksheet:';
  const storageKey = `${ns}:state`;
  const state = loadState() || { rows: baseRows, cols: baseCols, cells: {}, selected: { row: 1, col: 1 }, range: null };
  state.range = state.range || { startRow: state.selected.row, startCol: state.selected.col, endRow: state.selected.row, endCol: state.selected.col };
  const undo = [];
  const redo = [];
  let editing = null;
  let dragAnchor = null;
  let localClipboard = null;

  const wrap = document.getElementById('sheet-wrap');
  const formula = document.getElementById('formula');
  const nameBox = document.getElementById('name-box');

  function key(row, col) { return `${row},${col}`; }
  function raw(row, col) { return state.cells[key(row, col)] || ''; }
  function setRaw(row, col, value) { value ? state.cells[key(row, col)] = value : delete state.cells[key(row, col)]; }
  function selectedName() { return `${Core.indexToCol(state.selected.col)}${state.selected.row}`; }
  function normalizedRange() {
    const r = state.range || { startRow: state.selected.row, startCol: state.selected.col, endRow: state.selected.row, endCol: state.selected.col };
    return { top: Math.min(r.startRow, r.endRow), bottom: Math.max(r.startRow, r.endRow), left: Math.min(r.startCol, r.endCol), right: Math.max(r.startCol, r.endCol) };
  }
  function sheetAPI() { return { getRaw: raw }; }
  function display(row, col) {
    try { return Core.displayValue(Core.evaluateFormula(raw(row, col), sheetAPI(), { row, col }, new Set([key(row, col)]))); }
    catch (error) { return error.message || '#ERR!'; }
  }
  function pushHistory() {
    undo.push(JSON.stringify(state));
    if (undo.length > 50) undo.shift();
    redo.length = 0;
  }
  function restore(snapshot) {
    const next = JSON.parse(snapshot);
    state.rows = next.rows; state.cols = next.cols; state.cells = next.cells || {}; state.selected = next.selected || { row: 1, col: 1 }; state.range = next.range || null;
    clampSelection(); saveState(); render();
  }
  function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); }
  function loadState() { try { return JSON.parse(localStorage.getItem(storageKey)); } catch (_) { return null; } }

  function render() {
    const range = normalizedRange();
    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    hr.appendChild(document.createElement('th'));
    for (let c = 1; c <= state.cols; c += 1) {
      const th = document.createElement('th'); th.textContent = Core.indexToCol(c); th.dataset.col = c;
      if (c === state.selected.col) th.classList.add('header-active');
      hr.appendChild(th);
    }
    const tbody = table.createTBody();
    for (let r = 1; r <= state.rows; r += 1) {
      const tr = tbody.insertRow();
      const th = document.createElement('th'); th.textContent = r; th.dataset.row = r;
      if (r === state.selected.row) th.classList.add('header-active');
      tr.appendChild(th);
      for (let c = 1; c <= state.cols; c += 1) {
        const td = tr.insertCell(); td.dataset.row = r; td.dataset.col = c;
        let evaluated;
        try { evaluated = Core.evaluateFormula(raw(r, c), sheetAPI(), { row: r, col: c }, new Set([key(r, c)])); }
        catch (error) { evaluated = error.message || '#ERR!'; }
        const value = Core.displayValue(evaluated); td.textContent = value;
        if (typeof evaluated === 'number') td.classList.add('number');
        if (String(value).startsWith('#')) td.classList.add('error');
        if (r >= range.top && r <= range.bottom && c >= range.left && c <= range.right) td.classList.add('in-range');
        if (r === state.selected.row && c === state.selected.col) td.classList.add('active');
      }
    }
    wrap.replaceChildren(table);
    nameBox.textContent = selectedName();
    formula.value = raw(state.selected.row, state.selected.col);
  }

  function select(row, col, extend) {
    state.selected.row = Math.max(1, Math.min(state.rows, row));
    state.selected.col = Math.max(1, Math.min(state.cols, col));
    if (extend && state.range) { state.range.endRow = state.selected.row; state.range.endCol = state.selected.col; }
    else state.range = { startRow: state.selected.row, startCol: state.selected.col, endRow: state.selected.row, endCol: state.selected.col };
    saveState(); render();
  }
  function clampSelection() { select(state.selected.row, state.selected.col, false); }
  function commit(row, col, value) { pushHistory(); setRaw(row, col, value); saveState(); render(); }
  function editCell(initial, preserve) {
    const cell = wrap.querySelector(`td[data-row="${state.selected.row}"][data-col="${state.selected.col}"]`);
    if (!cell) return;
    const original = raw(state.selected.row, state.selected.col);
    const input = document.createElement('input');
    input.className = 'cell-editor'; input.value = preserve ? original : initial; cell.replaceChildren(input); input.focus(); input.select();
    if (preserve) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
    editing = { input, row: state.selected.row, col: state.selected.col, original };
  }
  function finishEdit(save, move) {
    if (!editing) return;
    const e = editing; editing = null;
    if (save && e.input.value !== e.original) commit(e.row, e.col, e.input.value); else render();
    if (move) select(e.row + move.row, e.col + move.col, false);
  }
  function clearRange() {
    pushHistory();
    const r = normalizedRange();
    for (let row = r.top; row <= r.bottom; row += 1) for (let col = r.left; col <= r.right; col += 1) setRaw(row, col, '');
    saveState(); render();
  }
  function structural(type, index) {
    pushHistory();
    const count = 1;
    const op = { type, index, count };
    const next = {};
    Object.keys(state.cells).forEach((k) => {
      const parts = k.split(',').map(Number); let row = parts[0], col = parts[1], value = state.cells[k];
      if (type === 'insertRow' && row >= index) row += count;
      if (type === 'insertColumn' && col >= index) col += count;
      if (type === 'deleteRow') { if (row === index) return; if (row > index) row -= count; }
      if (type === 'deleteColumn') { if (col === index) return; if (col > index) col -= count; }
      if (value[0] === '=') value = Core.adjustFormulaForStructure(value, op);
      if (row >= 1 && col >= 1) next[key(row, col)] = value;
    });
    state.cells = next;
    if (type === 'insertRow') state.rows += count;
    if (type === 'insertColumn') state.cols += count;
    if (type === 'deleteRow') state.rows = Math.max(1, state.rows - count);
    if (type === 'deleteColumn') state.cols = Math.max(1, state.cols - count);
    clampSelection(); saveState(); render();
  }
  function copyText(cut) {
    const r = normalizedRange(); const lines = [];
    const values = [];
    for (let row = r.top; row <= r.bottom; row += 1) {
      const cols = [];
      const valueRow = [];
      for (let col = r.left; col <= r.right; col += 1) { cols.push(raw(row, col)); valueRow.push(raw(row, col)); }
      values.push(valueRow);
      lines.push(cols.join('\t'));
    }
    const text = lines.join('\n');
    localClipboard = { text, top: r.top, left: r.left, values };
    navigator.clipboard.writeText(text);
    if (cut) clearRange();
  }
  async function pasteText() {
    const text = await navigator.clipboard.readText();
    const fromLocal = localClipboard && localClipboard.text === text;
    const rows = fromLocal ? localClipboard.values : text.split(/\r?\n/).map((line) => line.split('\t'));
    pushHistory();
    rows.forEach((line, ro) => line.forEach((value, co) => {
      const rowOffset = fromLocal ? state.selected.row + ro - (localClipboard.top + ro) : 0;
      const colOffset = fromLocal ? state.selected.col + co - (localClipboard.left + co) : 0;
      setRaw(state.selected.row + ro, state.selected.col + co, Core.adjustFormulaForPaste(value, rowOffset, colOffset));
    }));
    saveState(); render();
  }

  wrap.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td'); if (!td) return;
    dragAnchor = { row: Number(td.dataset.row), col: Number(td.dataset.col) };
    select(dragAnchor.row, dragAnchor.col, e.shiftKey);
  });
  wrap.addEventListener('mouseover', (e) => {
    if (!dragAnchor || e.buttons !== 1) return;
    const td = e.target.closest('td'); if (!td) return;
    state.range = { startRow: dragAnchor.row, startCol: dragAnchor.col, endRow: Number(td.dataset.row), endCol: Number(td.dataset.col) };
    state.selected = { row: Number(td.dataset.row), col: Number(td.dataset.col) }; render();
  });
  document.addEventListener('mouseup', () => { dragAnchor = null; saveState(); });
  wrap.addEventListener('dblclick', (e) => { if (e.target.closest('td')) editCell('', true); });
  wrap.addEventListener('contextmenu', (e) => {
    const rowHead = e.target.closest('tbody th'); const colHead = e.target.closest('thead th[data-col]');
    if (!rowHead && !colHead) return;
    e.preventDefault();
    const choice = prompt(rowHead ? 'Row action: insert above, insert below, delete' : 'Column action: insert left, insert right, delete', 'insert above');
    if (!choice) return;
    if (rowHead) { const row = Number(rowHead.dataset.row); if (/below/i.test(choice)) structural('insertRow', row + 1); else if (/delete/i.test(choice)) structural('deleteRow', row); else structural('insertRow', row); }
    if (colHead) { const col = Number(colHead.dataset.col); if (/right/i.test(choice)) structural('insertColumn', col + 1); else if (/delete/i.test(choice)) structural('deleteColumn', col); else structural('insertColumn', col); }
  });
  formula.addEventListener('change', () => commit(state.selected.row, state.selected.col, formula.value));
  formula.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); formula.blur(); select(state.selected.row + 1, state.selected.col, false); } });
  document.querySelector('.tools').addEventListener('click', (e) => {
    const action = e.target.dataset.action; if (!action) return;
    if (action === 'undo' && undo.length) { redo.push(JSON.stringify(state)); restore(undo.pop()); }
    if (action === 'redo' && redo.length) { undo.push(JSON.stringify(state)); restore(redo.pop()); }
    if (action === 'insert-row-above') structural('insertRow', state.selected.row);
    if (action === 'insert-row-below') structural('insertRow', state.selected.row + 1);
    if (action === 'delete-row') structural('deleteRow', state.selected.row);
    if (action === 'insert-col-left') structural('insertColumn', state.selected.col);
    if (action === 'insert-col-right') structural('insertColumn', state.selected.col + 1);
    if (action === 'delete-col') structural('deleteColumn', state.selected.col);
  });
  document.addEventListener('keydown', async (e) => {
    if (editing) {
      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true, { row: 1, col: 0 }); }
      if (e.key === 'Tab') { e.preventDefault(); finishEdit(true, { row: 0, col: 1 }); }
      if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey && redo.length) { undo.push(JSON.stringify(state)); restore(redo.pop()); } else if (undo.length) { redo.push(JSON.stringify(state)); restore(undo.pop()); } return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); if (redo.length) { undo.push(JSON.stringify(state)); restore(redo.pop()); } return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copyText(false); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copyText(true); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); await pasteText(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearRange(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); editCell('', true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); select(state.selected.row + 1, state.selected.col, e.shiftKey); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); select(state.selected.row - 1, state.selected.col, e.shiftKey); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); select(state.selected.row, state.selected.col + 1, e.shiftKey); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); select(state.selected.row, state.selected.col - 1, e.shiftKey); return; }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); editCell(e.key, false); }
  });

  render();
})();
