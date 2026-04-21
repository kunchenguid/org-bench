(function () {
  const core = window.SpreadsheetCore;
  const namespace = window.__BENCHMARK_STORAGE_NAMESPACE__ || 'spreadsheet';
  const storageKey = namespace + ':quiet-sheet:v1';
  const sheetEl = document.getElementById('sheet');
  const formulaBar = document.getElementById('formula-bar');

  const state = loadState();
  let computed = {};
  let cutSelection = null;
  let editSession = null;

  renderGrid();
  recalculate();
  renderSelection();
  bindEvents();

  function defaultState() {
    return {
      cells: {},
      selection: {
        anchor: { col: 0, row: 0 },
        focus: { col: 0, row: 0 },
      },
    };
  }

  function loadState() {
    const fallback = defaultState();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved) return fallback;
      return {
        cells: saved.cells || {},
        selection: saved.selection || fallback.selection,
      };
    } catch (error) {
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function renderGrid() {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);
    for (let col = 0; col < core.COLUMN_COUNT; col += 1) {
      const th = document.createElement('th');
      th.textContent = core.columnLabel(col);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < core.ROW_COUNT; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);
      for (let col = 0; col < core.COLUMN_COUNT; col += 1) {
        const cell = document.createElement('td');
        cell.dataset.cellId = core.cellIdFromPosition({ col, row });
        const display = document.createElement('div');
        display.className = 'cell-display';
        cell.appendChild(display);
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }

    sheetEl.appendChild(thead);
    sheetEl.appendChild(tbody);
  }

  function bindEvents() {
    sheetEl.addEventListener('click', onCellClick);
    sheetEl.addEventListener('mousedown', onCellMouseDown);
    sheetEl.addEventListener('dblclick', onCellDoubleClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    formulaBar.addEventListener('focus', syncFormulaBar);
    formulaBar.addEventListener('input', onFormulaInput);
    formulaBar.addEventListener('keydown', onFormulaKeyDown);
  }

  function onCellMouseDown(event) {
    const cell = event.target.closest('td[data-cell-id]');
    if (!cell) return;
    const anchor = core.parseCellId(cell.dataset.cellId);
    state.selection.anchor = anchor;
    state.selection.focus = anchor;
    renderSelection();

    function onMove(moveEvent) {
      const target = moveEvent.target.closest && moveEvent.target.closest('td[data-cell-id]');
      if (!target) return;
      state.selection.focus = core.parseCellId(target.dataset.cellId);
      renderSelection();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveState();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onCellClick(event) {
    const cell = event.target.closest('td[data-cell-id]');
    if (!cell) return;
    const position = core.parseCellId(cell.dataset.cellId);
    if (event.shiftKey) {
      state.selection.focus = position;
    } else {
      state.selection.anchor = position;
      state.selection.focus = position;
    }
    finishEdit(true);
    renderSelection();
    saveState();
  }

  function onCellDoubleClick(event) {
    const cell = event.target.closest('td[data-cell-id]');
    if (!cell) return;
    beginEdit(cell.dataset.cellId, false);
  }

  function onKeyDown(event) {
    if (editSession) return;
    if (event.target === formulaBar) return;

    const active = activeCellId();
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      beginEdit(active, true, event.key);
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      beginEdit(active, false);
      event.preventDefault();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      clearSelectedCells();
      event.preventDefault();
      return;
    }

    const direction = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    }[event.key];
    if (!direction) return;

    const next = core.clampCellPosition({
      row: state.selection.focus.row + direction.row,
      col: state.selection.focus.col + direction.col,
    });
    if (event.shiftKey) {
      state.selection.focus = next;
    } else {
      state.selection.anchor = next;
      state.selection.focus = next;
    }
    renderSelection();
    saveState();
    event.preventDefault();
  }

  function onFormulaInput() {
    const cellId = activeCellId();
    setCellRaw(cellId, formulaBar.value);
  }

  function onFormulaKeyDown(event) {
    if (event.key === 'Enter') {
      moveSelection(1, 0);
      formulaBar.blur();
      event.preventDefault();
    } else if (event.key === 'Tab') {
      moveSelection(0, 1);
      formulaBar.blur();
      event.preventDefault();
    }
  }

  function onCopy(event) {
    if (document.activeElement === formulaBar || editSession) return;
    event.clipboardData.setData('text/plain', core.copyRange(state.cells, getSelectionBounds()));
    cutSelection = null;
    event.preventDefault();
  }

  function onCut(event) {
    if (document.activeElement === formulaBar || editSession) return;
    const bounds = getSelectionBounds();
    event.clipboardData.setData('text/plain', core.copyRange(state.cells, bounds));
    cutSelection = bounds;
    event.preventDefault();
  }

  function onPaste(event) {
    if (document.activeElement === formulaBar || editSession) return;
    const text = event.clipboardData.getData('text/plain');
    state.cells = core.pasteRange(state.cells, state.selection.focus, text, cutSelection);
    cutSelection = null;
    recalculate();
    saveState();
    event.preventDefault();
  }

  function beginEdit(cellId, replace, seedText) {
    finishEdit(true);
    const cell = getCellElement(cellId);
    const input = document.createElement('input');
    input.className = 'cell-editor';
    const previous = getRaw(cellId);
    input.value = seedText !== undefined ? seedText : (replace ? '' : previous);
    cell.textContent = '';
    cell.appendChild(input);
    editSession = { cellId, previous };
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    formulaBar.value = input.value;
    input.addEventListener('input', function () {
      formulaBar.value = input.value;
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        finishEdit(false);
        moveSelection(1, 0);
        event.preventDefault();
      } else if (event.key === 'Tab') {
        finishEdit(false);
        moveSelection(0, 1);
        event.preventDefault();
      } else if (event.key === 'Escape') {
        finishEdit(true);
        event.preventDefault();
      }
    });
    input.addEventListener('blur', function () {
      if (editSession) finishEdit(false);
    });
  }

  function finishEdit(cancel) {
    if (!editSession) return;
    const session = editSession;
    const input = getCellElement(session.cellId).querySelector('.cell-editor');
    const nextValue = cancel ? session.previous : input.value;
    editSession = null;
    setCellRaw(session.cellId, nextValue);
  }

  function setCellRaw(cellId, raw) {
    const value = String(raw || '');
    cutSelection = null;
    if (value) {
      state.cells[cellId] = value;
    } else {
      delete state.cells[cellId];
    }
    recalculate();
    saveState();
  }

  function getRaw(cellId) {
    return state.cells[cellId] || '';
  }

  function recalculate() {
    computed = core.evaluateSpreadsheet(state.cells);
    const cells = sheetEl.querySelectorAll('td[data-cell-id]');
    cells.forEach(function (cell) {
      const cellId = cell.dataset.cellId;
      if (editSession && editSession.cellId === cellId) return;
      const display = cell.querySelector('.cell-display') || document.createElement('div');
      display.className = 'cell-display';
      const data = computed[cellId];
      display.textContent = data ? data.display : '';
      cell.classList.toggle('error', Boolean(data && data.value.kind === 'error'));
      cell.classList.toggle('num', Boolean(data && data.value.kind === 'number'));
      if (!display.parentNode) {
        cell.textContent = '';
        cell.appendChild(display);
      }
    });
    syncFormulaBar();
  }

  function syncFormulaBar() {
    if (document.activeElement === formulaBar) return;
    if (editSession) {
      const input = getCellElement(editSession.cellId).querySelector('.cell-editor');
      formulaBar.value = input ? input.value : getRaw(editSession.cellId);
      return;
    }
    formulaBar.value = getRaw(activeCellId());
  }

  function activeCellId() {
    return core.cellIdFromPosition(state.selection.focus);
  }

  function getSelectionBounds() {
    const a = state.selection.anchor;
    const b = state.selection.focus;
    return {
      minRow: Math.min(a.row, b.row),
      maxRow: Math.max(a.row, b.row),
      minCol: Math.min(a.col, b.col),
      maxCol: Math.max(a.col, b.col),
    };
  }

  function renderSelection() {
    const bounds = getSelectionBounds();
    sheetEl.querySelectorAll('td[data-cell-id]').forEach(function (cell) {
      const pos = core.parseCellId(cell.dataset.cellId);
      const inSelection = pos.row >= bounds.minRow && pos.row <= bounds.maxRow && pos.col >= bounds.minCol && pos.col <= bounds.maxCol;
      cell.classList.toggle('selected', inSelection);
      cell.classList.toggle('active', cell.dataset.cellId === activeCellId());
    });
    syncFormulaBar();
    getCellElement(activeCellId()).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function clearSelectedCells() {
    cutSelection = null;
    const bounds = getSelectionBounds();
    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
        delete state.cells[core.cellIdFromPosition({ row, col })];
      }
    }
    recalculate();
    saveState();
  }

  function moveSelection(rowDelta, colDelta) {
    const next = core.clampCellPosition({
      row: state.selection.focus.row + rowDelta,
      col: state.selection.focus.col + colDelta,
    });
    state.selection.anchor = next;
    state.selection.focus = next;
    renderSelection();
    saveState();
  }

  function getCellElement(cellId) {
    return sheetEl.querySelector('td[data-cell-id="' + cellId + '"]');
  }
})();
