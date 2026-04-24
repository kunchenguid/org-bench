(function () {
  const { SpreadsheetModel, colName, parseAddress, formatAddress } = window.SpreadsheetCore;
  const storageNamespace = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || 'gridline-default';
  const storageKey = `${storageNamespace}:state`;
  const grid = document.getElementById('grid');
  const formulaInput = document.getElementById('formula-input');
  const activeCellLabel = document.getElementById('active-cell');
  let sheet = loadState();
  let active = sheet.selection || { row: 0, col: 0 };
  let anchor = { ...active };
  let range = { start: { ...active }, end: { ...active } };
  let editing = null;
  let clipboard = null;

  grid.style.setProperty('--cols', sheet.cols);
  render();
  selectCell(active.row, active.col);

  document.getElementById('insert-row').addEventListener('click', () => mutate(() => sheet.insertRow(active.row + 1)));
  document.getElementById('delete-row').addEventListener('click', () => mutate(() => sheet.deleteRow(active.row + 1)));
  document.getElementById('insert-col').addEventListener('click', () => mutate(() => sheet.insertCol(active.col + 1)));
  document.getElementById('delete-col').addEventListener('click', () => mutate(() => sheet.deleteCol(active.col + 1)));

  formulaInput.addEventListener('focus', () => formulaInput.select());
  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitFormulaBar();
      move(1, 0, false);
      grid.focus();
    }
    if (event.key === 'Escape') {
      formulaInput.value = sheet.getRaw(active.row, active.col);
      grid.focus();
    }
  });
  formulaInput.addEventListener('change', commitFormulaBar);

  grid.addEventListener('mousedown', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (event.shiftKey) {
      active = { row, col };
      range = { start: anchor, end: active };
    } else {
      selectCell(row, col);
    }
    paintSelection();
    const onMove = (moveEvent) => {
      const over = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY).closest('.cell');
      if (!over) return;
      active = { row: Number(over.dataset.row), col: Number(over.dataset.col) };
      range = { start: anchor, end: active };
      paintSelection();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      syncFormulaBar();
      persist();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  grid.addEventListener('dblclick', (event) => {
    const cell = event.target.closest('.cell');
    if (cell) beginEdit(sheet.getRaw(Number(cell.dataset.row), Number(cell.dataset.col)), true);
  });

  grid.addEventListener('keydown', (event) => {
    if (editing) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') { event.preventDefault(); mutate(() => event.shiftKey ? sheet.redo() : sheet.undo(), false); return; }
    if (meta && event.key.toLowerCase() === 'y') { event.preventDefault(); mutate(() => sheet.redo(), false); return; }
    if (meta && event.key.toLowerCase() === 'c') { event.preventDefault(); clipboard = sheet.copyCells(currentRange()); return; }
    if (meta && event.key.toLowerCase() === 'x') { event.preventDefault(); clipboard = sheet.copyCells(currentRange()); mutate(() => clearCurrentRange()); return; }
    if (meta && event.key.toLowerCase() === 'v') { event.preventDefault(); if (clipboard) mutate(() => sheet.pasteCells(formatAddress(active.row, active.col), clipboard)); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); mutate(() => clearCurrentRange()); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); beginEdit(sheet.getRaw(active.row, active.col), true); return; }
    if (event.key === 'Tab') { event.preventDefault(); move(0, event.shiftKey ? -1 : 1, false); return; }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
      move(delta[0], delta[1], event.shiftKey);
      return;
    }
    if (event.key.length === 1 && !meta) {
      event.preventDefault();
      beginEdit(event.key, false);
    }
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        const model = SpreadsheetModel.fromJSON(data.sheet);
        model.undoStack = [];
        model.redoStack = [];
        model.selection = data.selection || { row: 0, col: 0 };
        return model;
      }
    } catch (error) {}
    return new SpreadsheetModel({ rows: 100, cols: 26 });
  }

  function persist() {
    sheet.selection = active;
    localStorage.setItem(storageKey, JSON.stringify({ sheet: sheet.toJSON(), selection: active }));
  }

  function render() {
    grid.innerHTML = '';
    grid.style.setProperty('--cols', sheet.cols);
    grid.appendChild(header('corner', ''));
    for (let col = 0; col < sheet.cols; col++) grid.appendChild(header('col-header', colName(col)));
    for (let row = 0; row < sheet.rows; row++) {
      const rowHeader = header('row-header', String(row + 1));
      rowHeader.title = 'Buttons above insert/delete the selected row';
      grid.appendChild(rowHeader);
      for (let col = 0; col < sheet.cols; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.setAttribute('role', 'gridcell');
        grid.appendChild(cell);
      }
    }
    repaintCells();
  }

  function header(className, text) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = text;
    return node;
  }

  function repaintCells() {
    grid.querySelectorAll('.cell').forEach((cell) => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const display = sheet.getDisplay(row, col);
      const raw = sheet.getRaw(row, col);
      cell.textContent = display;
      cell.className = 'cell';
      if (display.startsWith('#')) cell.classList.add('error');
      else if (raw.trim() !== '' && !Number.isNaN(Number(display))) cell.classList.add('number');
    });
    paintSelection();
  }

  function selectCell(row, col) {
    active = { row: clamp(row, 0, sheet.rows - 1), col: clamp(col, 0, sheet.cols - 1) };
    anchor = { ...active };
    range = { start: { ...active }, end: { ...active } };
    syncFormulaBar();
    paintSelection();
    persist();
  }

  function paintSelection() {
    const r = currentRange();
    grid.querySelectorAll('.cell').forEach((cell) => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      cell.classList.toggle('in-range', row >= r.row1 && row <= r.row2 && col >= r.col1 && col <= r.col2);
      cell.classList.toggle('active', row === active.row && col === active.col);
    });
    syncFormulaBar();
  }

  function currentRange() {
    return {
      start: range.start,
      end: range.end,
      row1: Math.min(range.start.row, range.end.row),
      row2: Math.max(range.start.row, range.end.row),
      col1: Math.min(range.start.col, range.end.col),
      col2: Math.max(range.start.col, range.end.col),
    };
  }

  function clearCurrentRange() {
    const r = currentRange();
    sheet.record();
    for (let row = r.row1; row <= r.row2; row++) {
      for (let col = r.col1; col <= r.col2; col++) sheet.setCell(row, col, '');
    }
  }

  function syncFormulaBar() {
    activeCellLabel.textContent = formatAddress(active.row, active.col);
    formulaInput.value = sheet.getRaw(active.row, active.col);
  }

  function commitFormulaBar() {
    mutate(() => sheet.setCell(active.row, active.col, formulaInput.value));
  }

  function beginEdit(initial, preserve) {
    const cell = grid.querySelector(`.cell[data-row="${active.row}"][data-col="${active.col}"]`);
    if (!cell) return;
    editing = { original: sheet.getRaw(active.row, active.col), cell };
    cell.classList.add('editing');
    cell.textContent = '';
    const input = document.createElement('input');
    input.value = preserve ? initial : initial;
    cell.appendChild(input);
    input.focus();
    if (preserve) input.select();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); finishEdit(input.value, true); move(1, 0, false); }
      if (event.key === 'Tab') { event.preventDefault(); finishEdit(input.value, true); move(0, event.shiftKey ? -1 : 1, false); }
      if (event.key === 'Escape') { event.preventDefault(); finishEdit(editing.original, false); }
    });
    input.addEventListener('blur', () => { if (editing) finishEdit(input.value, true); });
  }

  function finishEdit(value, commit) {
    const target = editing;
    editing = null;
    if (commit) mutate(() => sheet.setCell(active.row, active.col, value));
    else {
      target.cell.classList.remove('editing');
      repaintCells();
      syncFormulaBar();
    }
  }

  function move(rowDelta, colDelta, extend) {
    active = { row: clamp(active.row + rowDelta, 0, sheet.rows - 1), col: clamp(active.col + colDelta, 0, sheet.cols - 1) };
    if (extend) range = { start: anchor, end: active };
    else { anchor = { ...active }; range = { start: { ...active }, end: { ...active } }; }
    paintSelection();
    persist();
  }

  function mutate(fn, rerender = true) {
    fn();
    if (rerender) render();
    else repaintCells();
    active.row = clamp(active.row, 0, sheet.rows - 1);
    active.col = clamp(active.col, 0, sheet.cols - 1);
    selectCell(active.row, active.col);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
