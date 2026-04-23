(function () {
  const { SpreadsheetModel, adjustFormulaReferences, indexToCol, coordToAddr } = window.SpreadsheetCore;
  const ROWS = 100;
  const COLS = 26;
  const grid = document.getElementById('grid');
  const formulaBar = document.getElementById('formulaBar');
  const nameBox = document.getElementById('nameBox');
  const menu = document.getElementById('contextMenu');
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__STORAGE_NAMESPACE__ || 'facebook-sheet:';
  const model = new SpreadsheetModel(ROWS, COLS);
  let active = loadJSON('selection', { row: 0, col: 0 });
  let anchor = { ...active };
  let range = { r1: active.row, c1: active.col, r2: active.row, c2: active.col };
  let editing = null;
  let dragging = false;
  let cutRange = null;
  let copiedRange = null;
  const undo = [];
  const redo = [];

  model.restore(localStorage.getItem(ns + 'cells'));
  active.row = clamp(active.row, 0, ROWS - 1);
  active.col = clamp(active.col, 0, COLS - 1);
  anchor = { ...active };
  range = normalizedRange(anchor, active);
  buildGrid();
  render();

  function buildGrid() {
    const corner = el('div', 'corner', '');
    grid.appendChild(corner);
    for (let c = 0; c < COLS; c++) {
      const h = el('div', 'col-header', indexToCol(c));
      h.dataset.col = c;
      h.addEventListener('contextmenu', headerMenu);
      grid.appendChild(h);
    }
    for (let r = 0; r < ROWS; r++) {
      const rh = el('div', 'row-header', String(r + 1));
      rh.dataset.row = r;
      rh.addEventListener('contextmenu', headerMenu);
      grid.appendChild(rh);
      for (let c = 0; c < COLS; c++) {
        const cell = el('div', 'cell', '');
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.setAttribute('role', 'gridcell');
        cell.addEventListener('mousedown', onCellMouseDown);
        cell.addEventListener('mouseenter', onCellMouseEnter);
        cell.addEventListener('dblclick', () => startEdit(false));
        grid.appendChild(cell);
      }
    }
    document.addEventListener('mouseup', () => dragging = false);
    document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.hidden = true; });
  }

  function render() {
    nameBox.textContent = coordToAddr(active.row, active.col);
    formulaBar.value = model.rawAt(active.row, active.col);
    for (const node of grid.children) {
      if (node.classList.contains('cell')) renderCell(node);
      if (node.classList.contains('col-header')) node.classList.toggle('active', Number(node.dataset.col) === active.col);
      if (node.classList.contains('row-header')) node.classList.toggle('active', Number(node.dataset.row) === active.row);
    }
    save();
  }

  function renderCell(node) {
    const r = Number(node.dataset.row), c = Number(node.dataset.col);
    if (editing && editing.row === r && editing.col === c) return;
    const text = model.displayAt(r, c);
    node.textContent = text;
    node.className = 'cell';
    if (inRange(r, c)) node.classList.add('in-range');
    if (r === active.row && c === active.col) node.classList.add('active');
    if (/^-?\d+(\.\d+)?$/.test(text)) node.classList.add('number');
    if (/^#/.test(text)) node.classList.add('error');
  }

  function onCellMouseDown(e) {
    if (editing) commitEdit(true);
    const row = Number(e.currentTarget.dataset.row), col = Number(e.currentTarget.dataset.col);
    if (e.shiftKey) active = { row, col };
    else anchor = active = { row, col };
    range = normalizedRange(anchor, active);
    dragging = true;
    render();
    grid.focus();
  }

  function onCellMouseEnter(e) {
    if (!dragging) return;
    active = { row: Number(e.currentTarget.dataset.row), col: Number(e.currentTarget.dataset.col) };
    range = normalizedRange(anchor, active);
    render();
  }

  grid.addEventListener('keydown', e => {
    if (editing) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(false); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(true); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') return;
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(false); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearRange(); return; }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, 1] };
    if (moves[e.key]) { e.preventDefault(); move(moves[e.key][0], moves[e.key][1], e.shiftKey); return; }
    if (!e.metaKey && !e.ctrlKey && e.key.length === 1) { e.preventDefault(); startEdit(true, e.key); }
  });

  grid.addEventListener('paste', e => {
    e.preventDefault();
    paste(e.clipboardData.getData('text/plain'));
  });

  formulaBar.addEventListener('focus', () => editing = null);
  formulaBar.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); pushHistory(); model.setAt(active.row, active.col, formulaBar.value); move(1, 0, false); }
    if (e.key === 'Escape') { formulaBar.value = model.rawAt(active.row, active.col); grid.focus(); }
  });
  formulaBar.addEventListener('change', () => { pushHistory(); model.setAt(active.row, active.col, formulaBar.value); render(); });

  function startEdit(replace, firstChar) {
    const cell = cellNode(active.row, active.col);
    const input = document.createElement('input');
    input.className = 'editor';
    input.value = replace ? (firstChar || '') : model.rawAt(active.row, active.col);
    cell.textContent = '';
    cell.className = 'cell editing active';
    cell.appendChild(input);
    editing = { row: active.row, col: active.col, old: model.rawAt(active.row, active.col), input };
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(true); move(1, 0, false); }
      else if (e.key === 'Tab') { e.preventDefault(); commitEdit(true); move(0, 1, false); }
      else if (e.key === 'Escape') { e.preventDefault(); commitEdit(false); }
    });
    input.addEventListener('blur', () => editing && commitEdit(true));
  }

  function commitEdit(saveIt) {
    const e = editing;
    if (!e) return;
    editing = null;
    if (saveIt && e.input.value !== e.old) { pushHistory(); model.setAt(e.row, e.col, e.input.value); }
    render();
    grid.focus();
  }

  function move(dr, dc, extend) {
    active = { row: clamp(active.row + dr, 0, ROWS - 1), col: clamp(active.col + dc, 0, COLS - 1) };
    if (!extend) anchor = { ...active };
    range = normalizedRange(anchor, active);
    render();
    cellNode(active.row, active.col).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function clearRange() {
    pushHistory();
    eachRange((r, c) => model.setAt(r, c, ''));
    render();
  }

  function copy(cut) {
    const text = serializeRange();
    navigator.clipboard.writeText(text).catch(() => {});
    copiedRange = { ...range };
    cutRange = cut ? { ...range } : null;
  }

  function paste(text) {
    if (!text) return;
    pushHistory();
    const rows = text.replace(/\r/g, '').split('\n').filter((row, i, arr) => row !== '' || i < arr.length - 1).map(row => row.split('\t'));
    if (cutRange) {
      for (let r = cutRange.r1; r <= cutRange.r2; r++) for (let c = cutRange.c1; c <= cutRange.c2; c++) model.setAt(r, c, '');
    }
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const destR = active.row + r, destC = active.col + c;
        if (destR >= ROWS || destC >= COLS) continue;
        let raw = rows[r][c];
        if (raw[0] === '=' && cutRange == null && copiedRange) raw = adjustFormulaReferences(raw, destR - copiedRange.r1 - r, destC - copiedRange.c1 - c);
        model.setAt(destR, destC, raw);
      }
    }
    cutRange = null;
    copiedRange = null;
    render();
  }

  function serializeRange() {
    const lines = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = [];
      for (let c = range.c1; c <= range.c2; c++) row.push(model.rawAt(r, c));
      lines.push(row.join('\t'));
    }
    return lines.join('\n');
  }

  function headerMenu(e) {
    e.preventDefault();
    const row = e.currentTarget.dataset.row;
    const col = e.currentTarget.dataset.col;
    menu.innerHTML = '';
    if (row != null) addMenu(`Insert row above ${Number(row) + 1}`, () => mutate(() => model.insertRow(Number(row))));
    if (row != null) addMenu(`Delete row ${Number(row) + 1}`, () => mutate(() => model.deleteRow(Number(row))));
    if (col != null) addMenu(`Insert column before ${indexToCol(Number(col))}`, () => mutate(() => model.insertCol(Number(col))));
    if (col != null) addMenu(`Delete column ${indexToCol(Number(col))}`, () => mutate(() => model.deleteCol(Number(col))));
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.hidden = false;
  }

  function addMenu(label, action) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { menu.hidden = true; action(); };
    menu.appendChild(b);
  }

  function mutate(fn) { pushHistory(); fn(); render(); }
  function pushHistory() { undo.push(model.snapshot()); if (undo.length > 50) undo.shift(); redo.length = 0; }
  function doUndo() { if (!undo.length) return; redo.push(model.snapshot()); model.restore(undo.pop()); render(); }
  function doRedo() { if (!redo.length) return; undo.push(model.snapshot()); model.restore(redo.pop()); render(); }
  function eachRange(fn) { for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) fn(r, c); }
  function inRange(r, c) { return r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2; }
  function normalizedRange(a, b) { return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) }; }
  function cellNode(r, c) { return grid.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, Number(v) || 0)); }
  function save() { localStorage.setItem(ns + 'cells', model.snapshot()); localStorage.setItem(ns + 'selection', JSON.stringify(active)); }
  function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(ns + key)) || fallback; } catch (e) { return fallback; } }
  function el(tag, className, text) { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
})();
