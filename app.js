(function () {
  const { SpreadsheetModel, colToName, keyOf, parseCell } = window.SpreadsheetCore;
  const ROWS = 100;
  const COLS = 26;
  const storageNamespace = window.__BENCH_STORAGE_NAMESPACE__ || window.BENCH_STORAGE_NAMESPACE || 'facebook-spreadsheet';
  const storageKey = `${storageNamespace}:sheet:v1`;
  const grid = document.getElementById('grid');
  const editor = document.getElementById('editor');
  const formulaBar = document.getElementById('formulaBar');
  const nameBox = document.getElementById('nameBox');
  const selectionStatus = document.getElementById('selectionStatus');
  const insertRowBtn = document.getElementById('insertRowBtn');
  const insertColBtn = document.getElementById('insertColBtn');
  const deleteRangeBtn = document.getElementById('deleteRangeBtn');
  const persisted = load();
  const sheet = new SpreadsheetModel(persisted && persisted.sheet);
  let active = persisted && persisted.active ? persisted.active : { row: 0, col: 0 };
  let anchor = active;
  let rangeEnd = active;
  let editing = false;
  let editStart = '';
  let dragSelecting = false;

  buildGrid();
  render();
  grid.focus();

  function load() {
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) { return null; }
  }
  function save() {
    localStorage.setItem(storageKey, JSON.stringify({ sheet: sheet.toJSON(), active }));
  }
  function cellAt(row, col) { return grid.querySelector(`td[data-row="${row}"][data-col="${col}"]`); }
  function clamp(pos) { return { row: Math.max(0, Math.min(ROWS - 1, pos.row)), col: Math.max(0, Math.min(COLS - 1, pos.col)) }; }
  function currentRange() {
    return { r1: Math.min(anchor.row, rangeEnd.row), r2: Math.max(anchor.row, rangeEnd.row), c1: Math.min(anchor.col, rangeEnd.col), c2: Math.max(anchor.col, rangeEnd.col) };
  }
  function setActive(pos, extend) {
    active = clamp(pos);
    if (!extend) anchor = active;
    rangeEnd = active;
    renderSelection();
    formulaBar.value = sheet.getRaw(keyOf(active.row, active.col));
    nameBox.textContent = keyOf(active.row, active.col);
    updateSelectionStatus();
    cellAt(active.row, active.col).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    save();
  }
  function buildGrid() {
    const table = document.createElement('table');
    table.className = 'sheet-table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    hr.appendChild(corner);
    for (let c = 0; c < COLS; c++) {
      const th = document.createElement('th');
      th.textContent = colToName(c);
      th.dataset.col = c;
      th.title = 'Right-click to insert or delete column';
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let r = 0; r < ROWS; r++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = r + 1;
      th.dataset.row = r;
      th.title = 'Right-click to insert or delete row';
      tr.appendChild(th);
      for (let c = 0; c < COLS; c++) {
        const td = document.createElement('td');
        td.dataset.row = r;
        td.dataset.col = c;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    grid.appendChild(table);
  }
  function render() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const td = cellAt(r, c);
      const ref = keyOf(r, c);
      const raw = sheet.getRaw(ref);
      const display = sheet.getDisplay(ref);
      td.textContent = display;
      td.title = raw.startsWith('=') ? raw : display;
      td.classList.toggle('number', display !== '' && !Number.isNaN(Number(display)));
      td.classList.toggle('error', display.startsWith('#'));
    }
    renderSelection();
    formulaBar.value = sheet.getRaw(keyOf(active.row, active.col));
    nameBox.textContent = keyOf(active.row, active.col);
    updateSelectionStatus();
    save();
  }
  function renderSelection() {
    grid.querySelectorAll('td.active,td.selected-range,th.hot').forEach(el => el.classList.remove('active', 'selected-range', 'hot'));
    const r = currentRange();
    for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) cellAt(row, col).classList.add('selected-range');
    cellAt(active.row, active.col).classList.add('active');
    const colHeader = grid.querySelector(`thead th[data-col="${active.col}"]`);
    const rowHeader = grid.querySelector(`tbody th[data-row="${active.row}"]`);
    if (colHeader) colHeader.classList.add('hot');
    if (rowHeader) rowHeader.classList.add('hot');
    updateSelectionStatus();
  }
  function updateSelectionStatus() {
    const r = currentRange();
    const rows = r.r2 - r.r1 + 1;
    const cols = r.c2 - r.c1 + 1;
    const start = keyOf(r.r1, r.c1);
    const end = keyOf(r.r2, r.c2);
    selectionStatus.textContent = rows === 1 && cols === 1 ? `${keyOf(active.row, active.col)} selected` : `${start}:${end} selected (${rows} x ${cols})`;
  }
  function beginEdit(seed, preserve) {
    const td = cellAt(active.row, active.col);
    const rect = td.getBoundingClientRect();
    editStart = sheet.getRaw(keyOf(active.row, active.col));
    editor.hidden = false;
    editor.style.left = `${rect.left}px`;
    editor.style.top = `${rect.top}px`;
    editor.style.width = `${rect.width}px`;
    editor.style.height = `${rect.height}px`;
    editor.textContent = preserve ? editStart : seed;
    editing = true;
    editor.focus();
    placeCaretEnd(editor);
  }
  function commitEdit(move) {
    if (!editing) return;
    sheet.setCell(keyOf(active.row, active.col), editor.textContent);
    editing = false;
    editor.hidden = true;
    if (move) setActive({ row: active.row + move.row, col: active.col + move.col });
    render();
  }
  function cancelEdit() {
    if (!editing) return;
    editor.textContent = editStart;
    editing = false;
    editor.hidden = true;
    grid.focus();
  }
  function placeCaretEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function deleteSelection() {
    const r = currentRange();
    sheet.clearRange({ row: r.r1, col: r.c1 }, { row: r.r2, col: r.c2 });
    render();
  }
  function showHeaderMenu(x, y, kind, index) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'header-menu';
    const actions = kind === 'row'
      ? [['Insert row above', () => sheet.insertRow(index)], ['Insert row below', () => sheet.insertRow(index + 1)], ['Delete row', () => sheet.deleteRow(index)]]
      : [['Insert column left', () => sheet.insertCol(index)], ['Insert column right', () => sheet.insertCol(index + 1)], ['Delete column', () => sheet.deleteCol(index)]];
    actions.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => { action(); closeMenu(); render(); });
      menu.appendChild(button);
    });
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);
  }
  function closeMenu() { document.querySelectorAll('.header-menu').forEach(menu => menu.remove()); }

  grid.addEventListener('mousedown', event => {
    const td = event.target.closest('td');
    if (!td) return;
    dragSelecting = true;
    const pos = { row: Number(td.dataset.row), col: Number(td.dataset.col) };
    active = pos;
    if (!event.shiftKey) anchor = pos;
    rangeEnd = pos;
    renderSelection();
    formulaBar.value = sheet.getRaw(keyOf(active.row, active.col));
    nameBox.textContent = keyOf(active.row, active.col);
    updateSelectionStatus();
  });
  grid.addEventListener('mouseover', event => {
    if (!dragSelecting) return;
    const td = event.target.closest('td');
    if (!td) return;
    rangeEnd = { row: Number(td.dataset.row), col: Number(td.dataset.col) };
    active = rangeEnd;
    renderSelection();
  });
  document.addEventListener('mouseup', () => { if (dragSelecting) { dragSelecting = false; save(); } });
  grid.addEventListener('dblclick', event => { if (event.target.closest('td')) beginEdit('', true); });
  grid.addEventListener('contextmenu', event => {
    const rowHeader = event.target.closest('tbody th');
    const colHeader = event.target.closest('thead th[data-col]');
    if (!rowHeader && !colHeader) return;
    event.preventDefault();
    showHeaderMenu(event.clientX, event.clientY, rowHeader ? 'row' : 'col', Number((rowHeader || colHeader).dataset[rowHeader ? 'row' : 'col']));
  });
  document.addEventListener('click', event => { if (!event.target.closest('.header-menu')) closeMenu(); });
  insertRowBtn.addEventListener('click', () => { sheet.insertRow(active.row); render(); grid.focus(); });
  insertColBtn.addEventListener('click', () => { sheet.insertCol(active.col); render(); grid.focus(); });
  deleteRangeBtn.addEventListener('click', () => { deleteSelection(); grid.focus(); });

  grid.addEventListener('keydown', event => {
    if (editing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? sheet.redo() : sheet.undo(); render(); return; }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); sheet.redo(); render(); return; }
    if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); const r = currentRange(); navigator.clipboard && navigator.clipboard.writeText(sheet.copyText({ row: r.r1, col: r.c1 }, { row: r.r2, col: r.c2 })); return; }
    if (mod && event.key.toLowerCase() === 'x') { event.preventDefault(); const r = currentRange(); navigator.clipboard && navigator.clipboard.writeText(sheet.copyText({ row: r.r1, col: r.c1 }, { row: r.r2, col: r.c2 }, true)); return; }
    if (mod && event.key.toLowerCase() === 'v') return;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[event.key]) { event.preventDefault(); const [dr, dc] = moves[event.key]; setActive({ row: active.row + dr, col: active.col + dc }, event.shiftKey); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); beginEdit('', true); return; }
    if (event.key === 'Tab') { event.preventDefault(); setActive({ row: active.row, col: active.col + (event.shiftKey ? -1 : 1) }); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); return; }
    if (!mod && event.key.length === 1) { event.preventDefault(); beginEdit(event.key, false); }
  });
  grid.addEventListener('paste', event => {
    event.preventDefault();
    sheet.pasteAt(active, event.clipboardData.getData('text/plain'));
    render();
  });

  editor.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commitEdit({ row: 1, col: 0 }); }
    if (event.key === 'Tab') { event.preventDefault(); commitEdit({ row: 0, col: event.shiftKey ? -1 : 1 }); }
    if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
  });
  editor.addEventListener('blur', () => { if (editing) commitEdit(); });

  formulaBar.addEventListener('focus', () => { formulaBar.value = sheet.getRaw(keyOf(active.row, active.col)); });
  formulaBar.addEventListener('input', () => { sheet.setCell(keyOf(active.row, active.col), formulaBar.value); render(); formulaBar.focus(); });
  formulaBar.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); setActive({ row: active.row + 1, col: active.col }); grid.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); formulaBar.value = sheet.getRaw(keyOf(active.row, active.col)); grid.focus(); }
  });
})();
