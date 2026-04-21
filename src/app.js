;(function () {
  const ROWS = 100;
  const COLS = 26;
  const engine = window.SpreadsheetEngine;
  const historyApi = window.SpreadsheetHistory;
  const model = window.SpreadsheetModel;
  const state = {
    cells: {},
    evaluated: {},
    selection: { row: 0, col: 0 },
    anchor: { row: 0, col: 0 },
    range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    editingCell: false,
    draft: '',
    history: historyApi.createHistory(),
    clipboard: null,
    mouseExtending: false,
  };

  const namespace = resolveStorageNamespace();
  const storageKey = engine.createStorageKey(namespace, engine.STORAGE_KEY);

  const formulaInput = document.querySelector('[data-formula-input]');
  const table = document.querySelector('[data-grid]');
  const status = document.querySelector('[data-selection-label]');

  buildGrid();
  restoreState();
  recompute();
  pushHistory();
  render();

  formulaInput.addEventListener('input', function () {
    state.draft = formulaInput.value;
    state.editingCell = true;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft(1, 0);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelDraft();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitDraft(0, event.shiftKey ? -1 : 1);
    }
  });

  document.addEventListener('keydown', handleKeydown);

  function buildGrid() {
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th'));
    for (let col = 0; col < COLS; col += 1) {
      const header = document.createElement('th');
      header.textContent = engine.indexToColumnLabel(col);
      header.className = 'col-header';
      headerRow.appendChild(header);
    }
    table.appendChild(headerRow);

    for (let row = 0; row < ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.textContent = String(row + 1);
      rowHeader.className = 'row-header';
      const insertButton = document.createElement('button');
      insertButton.type = 'button';
      insertButton.className = 'row-action';
      insertButton.textContent = '+';
      insertButton.title = 'Insert row above';
      insertButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        insertRowAbove(row);
      });
      rowHeader.appendChild(insertButton);
      tr.appendChild(rowHeader);

      for (let col = 0; col < COLS; col += 1) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.row = String(row);
        input.dataset.col = String(col);
        input.className = 'cell-input';
        input.spellcheck = false;
        input.tabIndex = -1;
        input.addEventListener('mousedown', function (event) {
          state.mouseExtending = !!event.shiftKey;
          selectCell(row, col, false, event.shiftKey);
        });
        input.addEventListener('focus', function () {
          selectCell(row, col, false, state.mouseExtending);
          state.mouseExtending = false;
        });
        input.addEventListener('dblclick', function () {
          beginEdit(false);
        });
        input.addEventListener('input', function () {
          state.editingCell = true;
          state.draft = input.value;
          syncFormulaBar();
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitDraft(1, 0);
          } else if (event.key === 'Tab') {
            event.preventDefault();
            commitDraft(0, event.shiftKey ? -1 : 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelDraft();
          }
        });
        td.appendChild(input);
        tr.appendChild(td);
      }

      table.appendChild(tr);
    }
  }

  function handleKeydown(event) {
    const target = event.target;
    const isGridInput = target.classList && target.classList.contains('cell-input');
    const isFormulaInput = target === formulaInput;
    if (isFormulaInput) {
      return;
    }

    if (state.editingCell && isGridInput) {
      return;
    }

    if (isGridInput && target !== activeInput()) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1, event.shiftKey);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySelection(false);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      copySelection(true);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteSelection();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(true);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelectedRange();
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginEdit(false, event.key);
    }
  }

  function selectCell(row, col, focusCell, extendRange) {
    state.selection = {
      row: clamp(row, 0, ROWS - 1),
      col: clamp(col, 0, COLS - 1),
    };
    if (extendRange) {
      state.range = normalizeRange({
        startRow: state.anchor.row,
        startCol: state.anchor.col,
        endRow: state.selection.row,
        endCol: state.selection.col,
      });
    } else {
      state.anchor = { row: state.selection.row, col: state.selection.col };
      state.range = normalizeRange({
        startRow: state.selection.row,
        startCol: state.selection.col,
        endRow: state.selection.row,
        endCol: state.selection.col,
      });
    }
    state.editingCell = false;
    state.draft = currentRawValue();
    render();
    if (focusCell) {
      activeInput().focus();
    }
    persist();
  }

  function moveSelection(rowDelta, colDelta, extendRange) {
    selectCell(state.selection.row + rowDelta, state.selection.col + colDelta, true, extendRange);
  }

  function beginEdit(useExistingValue, replacement) {
    state.editingCell = true;
    state.draft = replacement !== undefined ? replacement : (useExistingValue ? currentRawValue() : '');
    render();
    const input = activeInput();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function commitDraft(rowDelta, colDelta) {
    const cellId = activeCellId();
    const value = state.draft;
    if (value) {
      state.cells[cellId] = value;
    } else {
      delete state.cells[cellId];
    }
    recompute();
    state.editingCell = false;
    state.selection = {
      row: clamp(state.selection.row + rowDelta, 0, ROWS - 1),
      col: clamp(state.selection.col + colDelta, 0, COLS - 1),
    };
    pushHistory();
    persist();
    render();
    activeInput().focus();
  }

  function cancelDraft() {
    state.editingCell = false;
    state.draft = currentRawValue();
    render();
    activeInput().focus();
  }

  function recompute() {
    state.evaluated = engine.evaluateCellMap(state.cells);
  }

  function render() {
    status.textContent = activeCellId();
    syncFormulaBar();

    const selectedId = activeCellId();
    const inputs = table.querySelectorAll('.cell-input');
    for (const input of inputs) {
      const cellId = engine.toCellId(Number(input.dataset.row), Number(input.dataset.col));
      const evaluated = state.evaluated[cellId];
      const isActive = cellId === selectedId;
      const isSelected = isInRange(Number(input.dataset.row), Number(input.dataset.col));
      input.parentElement.classList.toggle('is-active', isActive);
      input.parentElement.classList.toggle('is-selected', isSelected && !isActive);
      input.value = isActive && state.editingCell ? state.draft : (evaluated ? evaluated.display : '');
      input.readOnly = !isActive || !state.editingCell;
      input.classList.toggle('text-value', evaluated && evaluated.type === 'string');
      input.classList.toggle('error-value', evaluated && evaluated.type === 'error');
    }
  }

  function syncFormulaBar() {
    formulaInput.value = state.editingCell ? state.draft : currentRawValue();
  }

  function activeCellId() {
    return engine.toCellId(state.selection.row, state.selection.col);
  }

  function activeInput() {
    return table.querySelector('[data-row="' + state.selection.row + '"][data-col="' + state.selection.col + '"]');
  }

  function currentRawValue() {
    return state.cells[activeCellId()] || '';
  }

  function restoreState() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      state.cells = parsed.cells || {};
      if (parsed.selection) {
        state.selection = {
          row: clamp(parsed.selection.row || 0, 0, ROWS - 1),
          col: clamp(parsed.selection.col || 0, 0, COLS - 1),
        };
        state.anchor = { row: state.selection.row, col: state.selection.col };
        state.range = normalizeRange({
          startRow: state.selection.row,
          startCol: state.selection.col,
          endRow: state.selection.row,
          endCol: state.selection.col,
        });
      }
      state.draft = currentRawValue();
    } catch (_) {
      state.cells = {};
    }
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify({
      cells: state.cells,
      selection: state.selection,
    }));
  }

  function pushHistory() {
    historyApi.recordHistory(state.history, snapshotState());
  }

  function snapshotState() {
    return {
      cells: state.cells,
      selection: state.selection,
    };
  }

  function undo() {
    const snapshot = historyApi.undoHistory(state.history);
    if (!snapshot) {
      return;
    }

    applySnapshot(snapshot);
  }

  function redo() {
    const snapshot = historyApi.redoHistory(state.history);
    if (!snapshot) {
      return;
    }

    applySnapshot(snapshot);
  }

  function clearSelectedRange() {
    const sheet = model.createSheet(state.cells);
    const cellIds = getSelectedCellIds();
    if (!cellIds.some(function (cellId) { return Boolean(state.cells[cellId]); })) {
      return;
    }

    model.clearRange(sheet, state.range);
    state.cells = sheet.cells;
    state.editingCell = false;
    state.draft = '';
    recompute();
    pushHistory();
    persist();
    render();
    activeInput().focus();
  }

  function applySnapshot(snapshot) {
    state.cells = snapshot.cells;
    state.selection = snapshot.selection;
    state.anchor = { row: state.selection.row, col: state.selection.col };
    state.range = normalizeRange({
      startRow: state.selection.row,
      startCol: state.selection.col,
      endRow: state.selection.row,
      endCol: state.selection.col,
    });
    state.editingCell = false;
    state.draft = currentRawValue();
    recompute();
    persist();
    render();
    activeInput().focus();
  }

  function resolveStorageNamespace() {
    return window.__STORAGE_NAMESPACE__ ||
      window.__BENCHMARK_STORAGE_NAMESPACE__ ||
      window.BENCHMARK_STORAGE_NAMESPACE ||
      document.documentElement.dataset.storageNamespace ||
      location.pathname;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeRange(range) {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endRow: Math.max(range.startRow, range.endRow),
      endCol: Math.max(range.startCol, range.endCol),
    };
  }

  function isInRange(row, col) {
    return row >= state.range.startRow && row <= state.range.endRow && col >= state.range.startCol && col <= state.range.endCol;
  }

  function getSelectedCellIds() {
    const ids = [];
    for (let row = state.range.startRow; row <= state.range.endRow; row += 1) {
      for (let col = state.range.startCol; col <= state.range.endCol; col += 1) {
        ids.push(engine.toCellId(row, col));
      }
    }
    return ids;
  }

  function copySelection(cut) {
    const sheet = model.createSheet(state.cells);
    state.clipboard = {
      clip: model.copyRange(sheet, state.range, true),
      cut: cut,
    };
  }

  function pasteSelection() {
    if (!state.clipboard) {
      return;
    }

    const sheet = model.createSheet(state.cells);
    const clip = state.clipboard.clip;
    const targetRange = rangeMatchesClip(clip) ? state.range : {
      startRow: state.selection.row,
      startCol: state.selection.col,
      endRow: state.selection.row,
      endCol: state.selection.col,
    };
    if (state.clipboard.cut && (targetRange.startRow !== clip.sourceRow || targetRange.startCol !== clip.sourceCol)) {
      model.moveRange(sheet, {
        startRow: clip.sourceRow,
        startCol: clip.sourceCol,
        endRow: clip.sourceRow + clip.height - 1,
        endCol: clip.sourceCol + clip.width - 1,
      }, targetRange);
      state.clipboard = null;
    } else {
      model.pasteRange(sheet, targetRange, clip);
    }
    state.cells = sheet.cells;
    recompute();
    pushHistory();
    persist();
    render();
    activeInput().focus();
  }

  function rangeMatchesClip(clip) {
    return state.range.endRow - state.range.startRow + 1 === clip.height && state.range.endCol - state.range.startCol + 1 === clip.width;
  }

  function insertRowAbove(rowIndex) {
    const sheet = model.createSheet(state.cells);
    model.insertRow(sheet, rowIndex);
    state.cells = sheet.cells;
    if (state.selection.row >= rowIndex) {
      state.selection.row += 1;
      state.anchor = { row: state.selection.row, col: state.selection.col };
      state.range = normalizeRange({
        startRow: state.selection.row,
        startCol: state.selection.col,
        endRow: state.selection.row,
        endCol: state.selection.col,
      });
    }
    recompute();
    pushHistory();
    persist();
    render();
  }
})();
