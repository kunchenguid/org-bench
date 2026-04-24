(function () {
  'use strict';

  const ROWS = 100;
  const COLS = 26;
  const util = window.SheetUtil;
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.BENCHMARK_STORAGE_NAMESPACE || window.__STORAGE_NAMESPACE__ || 'gridbook';
  const storageKey = `${ns}:gridbook:v1`;
  const table = document.getElementById('sheet');
  const wrap = document.getElementById('sheetWrap');
  const formula = document.getElementById('formulaBar');
  const cellName = document.getElementById('cellName');
  const menu = document.getElementById('menu');

  let saved = load();
  let core = new window.SpreadsheetCore(saved.rows || ROWS, saved.cols || COLS, saved.cells || {});
  let active = saved.active || { row: 1, col: 1 };
  let anchor = Object.assign({}, active);
  let range = saved.range || { start: Object.assign({}, active), end: Object.assign({}, active) };
  let editing = null;
  let drag = false;
  let clipboard = null;
  let undo = [];
  let redo = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {}; }
    catch (_) { return {}; }
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify({ cells: core.cells, rows: core.rows, cols: core.cols, active, range }));
  }

  function snapshot() { return JSON.stringify({ cells: core.cells, rows: core.rows, cols: core.cols }); }
  function restore(state) {
    const parsed = JSON.parse(state);
    core = new window.SpreadsheetCore(parsed.rows, parsed.cols, parsed.cells);
    clampSelection();
    render();
    save();
  }
  function record(before) {
    const after = snapshot();
    if (before !== after) {
      undo.push({ before, after });
      if (undo.length > 50) undo.shift();
      redo = [];
    }
  }

  function clampSelection() {
    active.row = Math.max(1, Math.min(core.rows, active.row));
    active.col = Math.max(1, Math.min(core.cols, active.col));
    anchor.row = Math.max(1, Math.min(core.rows, anchor.row));
    anchor.col = Math.max(1, Math.min(core.cols, anchor.col));
    range = normalizeRange(anchor, active);
  }

  function normalizeRange(a, b) {
    return {
      start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
      end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
    };
  }

  function isInRange(row, col) {
    return row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col;
  }

  function select(row, col, extend) {
    active = { row: Math.max(1, Math.min(core.rows, row)), col: Math.max(1, Math.min(core.cols, col)) };
    if (!extend) anchor = Object.assign({}, active);
    range = normalizeRange(anchor, active);
    renderSelection();
    updateFormula();
    save();
  }

  function cellKey(row, col) { return util.pointToKey(row, col); }
  function activeKey() { return cellKey(active.row, active.col); }

  function render() {
    const frag = document.createDocumentFragment();
    table.textContent = '';
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);
    for (let col = 1; col <= core.cols; col++) {
      const th = document.createElement('th');
      th.className = 'col-head';
      th.textContent = util.indexToCol(col);
      th.dataset.col = col;
      th.addEventListener('contextmenu', showHeaderMenu);
      headRow.appendChild(th);
    }
    frag.appendChild(headRow);
    for (let row = 1; row <= core.rows; row++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'row-head';
      th.textContent = row;
      th.dataset.row = row;
      th.addEventListener('contextmenu', showHeaderMenu);
      tr.appendChild(th);
      for (let col = 1; col <= core.cols; col++) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.dataset.row = row;
        td.dataset.col = col;
        td.addEventListener('mousedown', onCellMouseDown);
        td.addEventListener('mouseenter', onCellMouseEnter);
        td.addEventListener('dblclick', () => startEdit(true));
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    table.appendChild(frag);
    renderCells();
    renderSelection();
    updateFormula();
  }

  function renderCells() {
    document.querySelectorAll('.cell').forEach((td) => {
      const key = cellKey(Number(td.dataset.row), Number(td.dataset.col));
      const display = core.getDisplay(key);
      td.textContent = display === '0' && !core.getRaw(key) ? '' : display;
      td.classList.toggle('error', /^#/.test(display));
      td.classList.toggle('bool', display === 'TRUE' || display === 'FALSE');
      td.classList.toggle('number', display !== '' && Number.isFinite(Number(display)) && !/^0\d/.test(display));
    });
  }

  function renderSelection() {
    document.querySelectorAll('.active,.range,.editing').forEach((el) => el.classList.remove('active', 'range', 'editing'));
    document.querySelectorAll('.row-head.active,.col-head.active').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.cell').forEach((td) => {
      const row = Number(td.dataset.row);
      const col = Number(td.dataset.col);
      td.classList.toggle('range', isInRange(row, col));
      td.classList.toggle('active', row === active.row && col === active.col && !editing);
    });
    const rowHead = document.querySelector(`.row-head[data-row="${active.row}"]`);
    const colHead = document.querySelector(`.col-head[data-col="${active.col}"]`);
    if (rowHead) rowHead.classList.add('active');
    if (colHead) colHead.classList.add('active');
    cellName.textContent = activeKey();
  }

  function updateFormula() { formula.value = core.getRaw(activeKey()); }

  function onCellMouseDown(event) {
    if (editing) commitEdit(false);
    const td = event.currentTarget;
    select(Number(td.dataset.row), Number(td.dataset.col), event.shiftKey);
    drag = true;
    wrap.focus();
    event.preventDefault();
  }
  function onCellMouseEnter(event) {
    if (!drag) return;
    const td = event.currentTarget;
    select(Number(td.dataset.row), Number(td.dataset.col), true);
  }
  window.addEventListener('mouseup', () => { drag = false; });

  function startEdit(keep, seed) {
    if (editing) return;
    const td = document.querySelector(`.cell[data-row="${active.row}"][data-col="${active.col}"]`);
    editing = { before: core.getRaw(activeKey()), td };
    td.classList.add('editing');
    td.textContent = '';
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = seed !== undefined ? seed : (keep ? editing.before : '');
    input.addEventListener('keydown', onEditKeyDown);
    input.addEventListener('input', () => { formula.value = input.value; });
    td.appendChild(input);
    input.focus();
    input.select();
  }

  function commitEdit(cancel, move) {
    if (!editing) return;
    const input = editing.td.querySelector('input');
    const before = snapshot();
    if (!cancel) core.setCell(activeKey(), input.value);
    editing = null;
    renderCells();
    renderSelection();
    updateFormula();
    record(before);
    save();
    if (move) select(active.row + move.row, active.col + move.col, false);
    wrap.focus();
  }

  function onEditKeyDown(event) {
    if (event.key === 'Enter') { event.preventDefault(); commitEdit(false, { row: 1, col: 0 }); }
    else if (event.key === 'Tab') { event.preventDefault(); commitEdit(false, { row: 0, col: event.shiftKey ? -1 : 1 }); }
    else if (event.key === 'Escape') { event.preventDefault(); commitEdit(true); }
  }

  function moveSelection(dr, dc, extend) { select(active.row + dr, active.col + dc, extend); }

  function setRange(raws, topRow, topCol, adjust) {
    const before = snapshot();
    raws.forEach((rowValues, r) => rowValues.forEach((raw, c) => {
      const row = topRow + r;
      const col = topCol + c;
      if (row <= core.rows && col <= core.cols) {
        const value = adjust && raw.startsWith('=') ? core.adjustFormulaForMove(raw, cellKey(raws.sourceRow + r, raws.sourceCol + c), cellKey(row, col)) : raw;
        core.setCell(cellKey(row, col), value);
      }
    }));
    renderCells();
    record(before);
    save();
  }

  function selectedRawBlock() {
    const rows = [];
    for (let row = range.start.row; row <= range.end.row; row++) {
      const vals = [];
      for (let col = range.start.col; col <= range.end.col; col++) vals.push(core.getRaw(cellKey(row, col)));
      rows.push(vals);
    }
    rows.sourceRow = range.start.row;
    rows.sourceCol = range.start.col;
    return rows;
  }

  function copy(cut) {
    const rows = selectedRawBlock();
    clipboard = { rows, cut, source: JSON.stringify(range) };
    const text = rows.map((r) => r.join('\t')).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    if (cut) clearRange(true);
  }

  function pasteFromClipboardText(text) {
    const rows = text.split(/\r?\n/).filter((line, i, a) => line || i < a.length - 1).map((line) => line.split('\t'));
    rows.sourceRow = active.row;
    rows.sourceCol = active.col;
    setRange(rows, active.row, active.col, false);
  }

  function paste() {
    if (clipboard) {
      setRange(clipboard.rows, active.row, active.col, !clipboard.cut);
      clipboard = null;
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(pasteFromClipboardText).catch(() => {});
    }
  }

  function clearRange(skipRecord) {
    const before = snapshot();
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) core.setCell(cellKey(row, col), '');
    }
    renderCells();
    updateFormula();
    if (!skipRecord) record(before);
    save();
  }

  function undoRedo(source, target, useAfter) {
    const item = source.pop();
    if (!item) return;
    target.push(item);
    restore(useAfter ? item.after : item.before);
  }

  function showHeaderMenu(event) {
    event.preventDefault();
    const row = Number(event.currentTarget.dataset.row || 0);
    const col = Number(event.currentTarget.dataset.col || 0);
    const actions = row ? [
      ['Insert row above', () => mutate(() => core.insertRow(row))],
      ['Insert row below', () => mutate(() => core.insertRow(row + 1))],
      ['Delete row', () => mutate(() => core.deleteRow(row))],
    ] : [
      ['Insert column left', () => mutate(() => core.insertCol(col))],
      ['Insert column right', () => mutate(() => core.insertCol(col + 1))],
      ['Delete column', () => mutate(() => core.deleteCol(col))],
    ];
    menu.textContent = '';
    actions.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => { menu.hidden = true; action(); });
      menu.appendChild(button);
    });
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.hidden = false;
  }

  function mutate(fn) {
    const before = snapshot();
    fn();
    clampSelection();
    render();
    record(before);
    save();
  }

  document.addEventListener('click', (event) => { if (!menu.contains(event.target)) menu.hidden = true; });

  formula.addEventListener('focus', () => { if (editing) commitEdit(false); });
  formula.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const before = snapshot();
      core.setCell(activeKey(), formula.value);
      renderCells();
      record(before);
      save();
      select(active.row + 1, active.col, false);
      event.preventDefault();
      wrap.focus();
    } else if (event.key === 'Escape') {
      updateFormula();
      wrap.focus();
    }
  });

  wrap.addEventListener('keydown', (event) => {
    if (editing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); undoRedo(event.shiftKey ? redo : undo, event.shiftKey ? undo : redo, event.shiftKey); return; }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); undoRedo(redo, undo, true); return; }
    if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); copy(false); return; }
    if (mod && event.key.toLowerCase() === 'x') { event.preventDefault(); copy(true); return; }
    if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); paste(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearRange(false); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit(true); return; }
    if (event.key === 'Tab') { event.preventDefault(); moveSelection(0, event.shiftKey ? -1 : 1, false); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveSelection(-1, 0, event.shiftKey); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveSelection(1, 0, event.shiftKey); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelection(0, -1, event.shiftKey); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); moveSelection(0, 1, event.shiftKey); return; }
    if (event.key.length === 1 && !mod && !event.altKey) { event.preventDefault(); startEdit(false, event.key); }
  });

  document.addEventListener('paste', (event) => {
    if (document.activeElement !== wrap) return;
    const text = event.clipboardData && event.clipboardData.getData('text/plain');
    if (text) { event.preventDefault(); pasteFromClipboardText(text); }
  });

  render();
  wrap.focus();
})();
