(function () {
  const { SpreadsheetModel, COLS, ROWS, addr, colName } = window.SpreadsheetCore;
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || new URLSearchParams(location.search).get('storageNamespace') || 'amazon-sheet';
  const sheet = new SpreadsheetModel({ storage: localStorage, storageKey: `${ns}:state` });
  const grid = document.getElementById('grid');
  const formula = document.getElementById('formula');
  const nameBox = document.getElementById('nameBox');
  let active = sheet.selected || { row: 0, col: 0 };
  let anchor = { row: active.row, col: active.col };
  let range = { r1: active.row, c1: active.col, r2: active.row, c2: active.col };
  let editing = null;
  let internalClipboard = null;

  function clamp(v, max) { return Math.max(0, Math.min(max, v)); }
  function norm() { return { r1: Math.min(range.r1, range.r2), c1: Math.min(range.c1, range.c2), r2: Math.max(range.r1, range.r2), c2: Math.max(range.c1, range.c2) }; }
  function cellEl(row, col) { return grid.querySelector(`[data-row="${row}"][data-col="${col}"]`); }

  function buildGrid() {
    grid.innerHTML = '<div class="corner"></div>';
    for (let c = 0; c < COLS; c += 1) grid.insertAdjacentHTML('beforeend', `<div class="head col-head" data-col-head="${c}" title="Column ${colName(c)}">${colName(c)}</div>`);
    for (let r = 0; r < ROWS; r += 1) {
      grid.insertAdjacentHTML('beforeend', `<div class="head row-head" data-row-head="${r}" title="Row ${r + 1}">${r + 1}</div>`);
      for (let c = 0; c < COLS; c += 1) grid.insertAdjacentHTML('beforeend', `<div class="cell" tabindex="-1" data-row="${r}" data-col="${c}"></div>`);
    }
    render();
  }

  function render() {
    const n = norm();
    nameBox.value = addr(active.row, active.col);
    formula.value = sheet.rawAt(active.row, active.col);
    sheet.selected = active;
    sheet.save();
    grid.querySelectorAll('.cell').forEach((el) => {
      const row = Number(el.dataset.row), col = Number(el.dataset.col);
      const display = sheet.getDisplay({ row, col });
      el.textContent = display;
      el.className = 'cell';
      if (row >= n.r1 && row <= n.r2 && col >= n.c1 && col <= n.c2) el.classList.add('in-range');
      if (row === active.row && col === active.col) el.classList.add('active');
      if (/^-?\d+(\.\d+)?$/.test(display)) el.classList.add('number');
      if (display[0] === '#') el.classList.add('error');
    });
    const el = cellEl(active.row, active.col);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function select(row, col, extend) {
    active = { row: clamp(row, ROWS - 1), col: clamp(col, COLS - 1) };
    if (!extend) anchor = { row: active.row, col: active.col };
    range = { r1: anchor.row, c1: anchor.col, r2: active.row, c2: active.col };
    render();
  }

  function commit(value, move) {
    if (editing) { editing.remove(); editing = null; }
    sheet.setCell(active, value);
    if (move === 'down') select(active.row + 1, active.col);
    else if (move === 'right') select(active.row, active.col + 1);
    else render();
  }

  function startEdit(seed, preserve) {
    if (editing) return;
    const el = cellEl(active.row, active.col);
    if (!el) return;
    el.classList.add('editing');
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = preserve ? sheet.rawAt(active.row, active.col) : seed;
    el.textContent = '';
    el.appendChild(input);
    editing = input;
    input.focus();
    input.select();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(input.value, 'down'); }
      if (event.key === 'Tab') { event.preventDefault(); commit(input.value, 'right'); }
      if (event.key === 'Escape') { event.preventDefault(); editing = null; render(); }
    });
    input.addEventListener('blur', () => { if (editing === input) commit(input.value); });
  }

  function parseClipboard(text) { return text.split(/\r?\n/).filter((line, i, a) => line || i < a.length - 1).map((line) => line.split('\t')); }
  function copyText() { const n = norm(); return sheet.copyRange(n.r1, n.c1, n.r2, n.c2).map((row) => row.join('\t')).join('\n'); }

  grid.addEventListener('mousedown', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    select(Number(cell.dataset.row), Number(cell.dataset.col), event.shiftKey);
    grid.focus();
  });
  grid.addEventListener('dblclick', () => startEdit('', true));
  grid.addEventListener('mouseover', (event) => {
    if (event.buttons !== 1) return;
    const cell = event.target.closest('.cell');
    if (cell) select(Number(cell.dataset.row), Number(cell.dataset.col), true);
  });

  document.addEventListener('keydown', (event) => {
    if (document.activeElement === formula) return;
    if (editing) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? sheet.redo() : sheet.undo(); render(); return; }
    if (meta && event.key.toLowerCase() === 'y') { event.preventDefault(); sheet.redo(); render(); return; }
    if (meta && event.key.toLowerCase() === 'c') { internalClipboard = { block: sheet.copyRange(norm().r1, norm().c1, norm().r2, norm().c2), row: norm().r1, col: norm().c1, cut: false }; navigator.clipboard && navigator.clipboard.writeText(copyText()).catch(() => {}); return; }
    if (meta && event.key.toLowerCase() === 'x') { internalClipboard = { block: sheet.copyRange(norm().r1, norm().c1, norm().r2, norm().c2), row: norm().r1, col: norm().c1, cut: true }; navigator.clipboard && navigator.clipboard.writeText(copyText()).catch(() => {}); return; }
    if (meta && event.key.toLowerCase() === 'v') return;
    if (event.key === 'ArrowDown') { event.preventDefault(); select(active.row + 1, active.col, event.shiftKey); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); select(active.row - 1, active.col, event.shiftKey); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); select(active.row, active.col + 1, event.shiftKey); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); select(active.row, active.col - 1, event.shiftKey); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); const n = norm(); sheet.clearRange(n.r1, n.c1, n.r2, n.c2); render(); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit('', true); return; }
    if (event.key === 'Tab') { event.preventDefault(); select(active.row, active.col + 1); return; }
    if (event.key.length === 1 && !meta && !event.altKey) { event.preventDefault(); startEdit(event.key, false); }
  });

  document.addEventListener('paste', (event) => {
    if (document.activeElement === formula) return;
    event.preventDefault();
    let block, source = null;
    if (internalClipboard) { block = internalClipboard.block; source = internalClipboard; }
    else block = parseClipboard(event.clipboardData.getData('text/plain'));
    if (!block || !block.length) return;
    if (internalClipboard && internalClipboard.cut) { sheet.clearRange(source.row, source.col, source.row + block.length - 1, source.col + block[0].length - 1); internalClipboard.cut = false; }
    sheet.pasteRange(active.row, active.col, block, source);
    range = { r1: active.row, c1: active.col, r2: active.row + block.length - 1, c2: active.col + block[0].length - 1 };
    render();
  });

  formula.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); commit(formula.value, 'down'); grid.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); formula.value = sheet.rawAt(active.row, active.col); grid.focus(); }
  });
  formula.addEventListener('change', () => commit(formula.value));

  document.getElementById('insertRow').onclick = () => { sheet.insertRow(active.row); render(); };
  document.getElementById('insertCol').onclick = () => { sheet.insertColumn(active.col); render(); };
  document.getElementById('deleteRow').onclick = () => { sheet.deleteRow(active.row); select(Math.min(active.row, ROWS - 2), active.col); };
  document.getElementById('deleteCol').onclick = () => { sheet.deleteColumn(active.col); select(active.row, Math.min(active.col, COLS - 2)); };

  buildGrid();
  grid.tabIndex = 0;
  grid.focus();
})();
