(function () {
  'use strict';

  const { SpreadsheetModel, addr, indexToCol, parseAddr } = window.SpreadsheetCore;
  const rows = 100;
  const cols = 26;
  const namespace = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || 'google-sheet';
  const storageKey = namespace + ':state';
  const sheet = new SpreadsheetModel(rows, cols);
  const grid = document.getElementById('grid');
  const formulaBar = document.getElementById('formula-bar');
  const nameBox = document.getElementById('name-box');
  const undo = [];
  const redo = [];
  let active = { row: 0, col: 0 };
  let anchor = { row: 0, col: 0 };
  let editing = null;

  load();
  renderGrid();
  refresh();

  function renderGrid() {
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th'));
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.textContent = indexToCol(c);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    grid.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = String(r + 1);
      tr.appendChild(th);
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        td.dataset.row = r;
        td.dataset.col = c;
        td.addEventListener('mousedown', (event) => selectCell(r, c, event.shiftKey));
        td.addEventListener('dblclick', () => startEdit(false));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    grid.appendChild(tbody);
  }

  function refresh() {
    for (const td of grid.querySelectorAll('td')) {
      const r = Number(td.dataset.row);
      const c = Number(td.dataset.col);
      const ref = addr(r, c);
      const display = sheet.getDisplay(ref);
      td.textContent = display;
      td.className = '';
      if (display.startsWith('#')) td.classList.add('error');
      if (!isNumericDisplay(display)) td.classList.add('text');
      if (inRange(r, c)) td.classList.add('range');
      if (r === active.row && c === active.col) td.classList.add('active');
    }
    const ref = addr(active.row, active.col);
    nameBox.textContent = ref;
    if (document.activeElement !== formulaBar) formulaBar.value = sheet.getRaw(ref);
    save();
  }

  function selectCell(row, col, extend) {
    active = { row, col };
    if (!extend) anchor = { row, col };
    refresh();
  }

  function startEdit(replace, initial) {
    if (editing) return;
    const td = cellEl(active.row, active.col);
    const input = document.createElement('input');
    const original = sheet.getRaw(addr(active.row, active.col));
    input.value = replace ? initial || '' : original;
    td.textContent = '';
    td.appendChild(input);
    input.focus();
    input.select();
    editing = { input, original };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commitEdit(1, 0);
      else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(0, 1);
      } else if (event.key === 'Escape') cancelEdit();
    });
    input.addEventListener('blur', () => editing && commitEdit(0, 0));
  }

  function commitEdit(dr, dc) {
    const value = editing.input.value;
    const ref = addr(active.row, active.col);
    editing = null;
    changeCells([{ ref, before: sheet.getRaw(ref), after: value }]);
    move(dr, dc, false);
  }

  function cancelEdit() {
    editing = null;
    refresh();
  }

  function changeCells(changes) {
    const actual = changes.filter((c) => c.before !== c.after);
    if (!actual.length) {
      refresh();
      return;
    }
    for (const c of actual) sheet.setCell(c.ref, c.after);
    undo.push(actual);
    while (undo.length > 50) undo.shift();
    redo.length = 0;
    refresh();
  }

  function applyHistory(stackFrom, stackTo) {
    const changes = stackFrom.pop();
    if (!changes) return;
    for (const c of changes) sheet.setCell(c.ref, stackFrom === undo ? c.before : c.after);
    stackTo.push(changes);
    refresh();
  }

  function move(dr, dc, extend) {
    active = { row: clamp(active.row + dr, 0, rows - 1), col: clamp(active.col + dc, 0, cols - 1) };
    if (!extend) anchor = { ...active };
    refresh();
    cellEl(active.row, active.col).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  document.addEventListener('keydown', (event) => {
    if (editing || document.activeElement === formulaBar) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      applyHistory(event.shiftKey ? redo : undo, event.shiftKey ? undo : redo);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      applyHistory(redo, undo);
    } else if (event.key === 'ArrowDown') move(1, 0, event.shiftKey);
    else if (event.key === 'ArrowUp') move(-1, 0, event.shiftKey);
    else if (event.key === 'ArrowRight') move(0, 1, event.shiftKey);
    else if (event.key === 'ArrowLeft') move(0, -1, event.shiftKey);
    else if (event.key === 'Enter' || event.key === 'F2') startEdit(false);
    else if (event.key === 'Delete' || event.key === 'Backspace') clearRange();
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) startEdit(true, event.key);
  });

  formulaBar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const ref = addr(active.row, active.col);
      changeCells([{ ref, before: sheet.getRaw(ref), after: formulaBar.value }]);
      move(1, 0, false);
    } else if (event.key === 'Escape') {
      formulaBar.value = sheet.getRaw(addr(active.row, active.col));
      formulaBar.blur();
    }
  });

  document.addEventListener('copy', (event) => {
    event.preventDefault();
    event.clipboardData.setData('text/plain', selectedRefs().map((row) => row.map((ref) => sheet.getRaw(ref)).join('\t')).join('\n'));
  });

  document.addEventListener('cut', (event) => {
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: event.clipboardData }));
    clearRange();
  });

  document.addEventListener('paste', (event) => {
    if (document.activeElement === formulaBar || editing) return;
    event.preventDefault();
    const rowsText = event.clipboardData.getData('text/plain').split(/\r?\n/).filter((line) => line.length);
    const changes = [];
    rowsText.forEach((line, r) => line.split('\t').forEach((value, c) => {
      const rr = active.row + r;
      const cc = active.col + c;
      if (rr < rows && cc < cols) {
        const ref = addr(rr, cc);
        changes.push({ ref, before: sheet.getRaw(ref), after: value });
      }
    }));
    changeCells(changes);
  });

  function clearRange() {
    changeCells(selectedRefs().flat().map((ref) => ({ ref, before: sheet.getRaw(ref), after: '' })));
  }

  function selectedRefs() {
    const r1 = Math.min(anchor.row, active.row);
    const r2 = Math.max(anchor.row, active.row);
    const c1 = Math.min(anchor.col, active.col);
    const c2 = Math.max(anchor.col, active.col);
    const out = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) row.push(addr(r, c));
      out.push(row);
    }
    return out;
  }

  function inRange(r, c) {
    return r >= Math.min(anchor.row, active.row) && r <= Math.max(anchor.row, active.row) && c >= Math.min(anchor.col, active.col) && c <= Math.max(anchor.col, active.col);
  }

  function cellEl(row, col) {
    return grid.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
  }

  function isNumericDisplay(value) {
    return value !== '' && !Number.isNaN(Number(value));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify({ cells: sheet.toJSON(), active }));
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
      sheet.load(data.cells || []);
      if (data.active) {
        active = data.active;
        anchor = data.active;
      }
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }

  document.getElementById('insert-row').addEventListener('click', () => alert('Row insert UI stub: formula-safe shifting is planned in the next PR.'));
  document.getElementById('delete-row').addEventListener('click', () => alert('Row delete UI stub: formula-safe shifting is planned in the next PR.'));
  document.getElementById('insert-col').addEventListener('click', () => alert('Column insert UI stub: formula-safe shifting is planned in the next PR.'));
  document.getElementById('delete-col').addEventListener('click', () => alert('Column delete UI stub: formula-safe shifting is planned in the next PR.'));
})();
