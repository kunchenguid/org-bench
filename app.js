(function () {
  const appState = window.SpreadsheetAppState;
  const core = window.SpreadsheetCore;
  const namespace = appState.resolveStorageNamespace(window);
  const storageKey = namespace + ':quiet-sheet:v1';
  const sheetEl = document.getElementById('sheet');
  const formulaBar = document.getElementById('formula-bar');
  const structureButtons = document.querySelectorAll('[data-structure-action]');

  const state = loadState();
  let computed = {};
  let clipboardState = null;
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
    formulaBar.addEventListener('focus', onFormulaFocus);
    formulaBar.addEventListener('input', onFormulaInput);
    formulaBar.addEventListener('keydown', onFormulaKeyDown);
    formulaBar.addEventListener('blur', onFormulaBlur);
    structureButtons.forEach(function (button) {
      button.addEventListener('click', onStructureActionClick);
    });
  }

  function onStructureActionClick(event) {
    const active = state.selection.focus;
    const operation = {
      'insert-row-above': { axis: 'row', kind: 'insert', index: active.row },
      'insert-row-below': { axis: 'row', kind: 'insert', index: active.row + 1 },
      'delete-row': { axis: 'row', kind: 'delete', index: active.row },
      'insert-col-left': { axis: 'col', kind: 'insert', index: active.col },
      'insert-col-right': { axis: 'col', kind: 'insert', index: active.col + 1 },
      'delete-col': { axis: 'col', kind: 'delete', index: active.col },
    }[event.currentTarget.dataset.structureAction];

    if (!operation) return;
    applyStructureChange(operation);
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
    if (event.target === formulaBar) return;
    if (editSession) return;

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

  function onFormulaFocus() {
    if (!editSession) {
      beginFormulaEdit();
    }
    syncFormulaBar();
  }

  function onFormulaInput() {
    if (!editSession) {
      beginFormulaEdit();
    }
    editSession = appState.updateEditSession(editSession, formulaBar.value);
    syncInlineEditor();
  }

  function onFormulaKeyDown(event) {
    if (event.key === 'Enter') {
      finishEdit(false);
      moveSelection(1, 0);
      formulaBar.blur();
      event.preventDefault();
    } else if (event.key === 'Tab') {
      finishEdit(false);
      moveSelection(0, 1);
      formulaBar.blur();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      finishEdit(true);
      formulaBar.blur();
      event.preventDefault();
    }
  }

  function onFormulaBlur() {
    if (editSession && !isInlineEditorFocused()) {
      finishEdit(false);
    }
  }

  function onCopy(event) {
    if (document.activeElement === formulaBar || editSession) return;
    const bounds = getSelectionBounds();
    const text = core.copyRange(state.cells, bounds);
    event.clipboardData.setData('text/plain', text);
    clipboardState = appState.createClipboardState(text, bounds, false);
    event.preventDefault();
  }

  function onCut(event) {
    if (document.activeElement === formulaBar || editSession) return;
    const bounds = getSelectionBounds();
    const text = core.copyRange(state.cells, bounds);
    event.clipboardData.setData('text/plain', text);
    clipboardState = appState.createClipboardState(text, bounds, true);
    event.preventDefault();
  }

  function onPaste(event) {
    if (document.activeElement === formulaBar || editSession) return;
    const text = event.clipboardData.getData('text/plain');
    const source = appState.matchClipboardState(clipboardState, text);
    state.cells = core.pasteRange(
      state.cells,
      state.selection.focus,
      text,
      source ? source.bounds : null,
      Boolean(source && source.cut)
    );
    clipboardState = appState.advanceClipboardState(source);
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
    editSession = appState.beginEditSession(cellId, previous, replace, seedText);
    input.value = editSession.draft;
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    formulaBar.value = editSession.draft;
    input.addEventListener('input', function () {
      editSession = appState.updateEditSession(editSession, input.value);
      formulaBar.value = editSession.draft;
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
      if (editSession && document.activeElement !== formulaBar) finishEdit(false);
    });
  }

  function beginFormulaEdit() {
    const cellId = activeCellId();
    if (!editSession) {
      editSession = appState.beginEditSession(cellId, getRaw(cellId), false);
    }
  }

  function finishEdit(cancel) {
    if (!editSession) return;
    const session = editSession;
    editSession = null;
    setCellRaw(session.cellId, appState.commitEditSession(session, cancel));
  }

  function setCellRaw(cellId, raw) {
    const value = String(raw || '');
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
    if (editSession) {
      formulaBar.value = editSession.draft;
      return;
    }
    formulaBar.value = getRaw(activeCellId());
  }

  function syncInlineEditor() {
    if (!editSession) return;
    const input = getCellElement(editSession.cellId).querySelector('.cell-editor');
    if (input && input.value !== editSession.draft) {
      input.value = editSession.draft;
    }
  }

  function isInlineEditorFocused() {
    return Boolean(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('cell-editor'));
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

  function applyStructureChange(operation) {
    finishEdit(false);
    state.cells = applyCellStructureChange(operation);
    state.selection = appState.getSelectionAfterStructureChange(state.selection, operation);
    recalculate();
    renderSelection();
    saveState();
  }

  function applyCellStructureChange(operation) {
    if (operation.axis === 'row') {
      return operation.kind === 'insert'
        ? core.insertRow(state.cells, operation.index)
        : core.deleteRow(state.cells, operation.index);
    }

    return operation.kind === 'insert'
      ? core.insertColumn(state.cells, operation.index)
      : core.deleteColumn(state.cells, operation.index);
  }
})();
