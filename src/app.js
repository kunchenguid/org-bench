;(function () {
  const ROWS = 100;
  const COLS = 26;
  const engine = window.SpreadsheetEngine;
  const state = {
    cells: {},
    evaluated: {},
    selection: { row: 0, col: 0 },
    editingCell: false,
    draft: '',
  };

  const namespace = resolveStorageNamespace();
  const storageKey = engine.createStorageKey(namespace, engine.STORAGE_KEY);

  const formulaInput = document.querySelector('[data-formula-input]');
  const table = document.querySelector('[data-grid]');
  const status = document.querySelector('[data-selection-label]');

  buildGrid();
  restoreState();
  recompute();
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
        input.addEventListener('focus', function () {
          selectCell(row, col, false);
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
      moveSelection(-1, 0);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1);
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(true);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginEdit(false, event.key);
    }
  }

  function selectCell(row, col, focusCell) {
    state.selection = {
      row: clamp(row, 0, ROWS - 1),
      col: clamp(col, 0, COLS - 1),
    };
    state.editingCell = false;
    state.draft = currentRawValue();
    render();
    if (focusCell) {
      activeInput().focus();
    }
    persist();
  }

  function moveSelection(rowDelta, colDelta) {
    selectCell(state.selection.row + rowDelta, state.selection.col + colDelta, true);
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
    persist();
    selectCell(state.selection.row + rowDelta, state.selection.col + colDelta, true);
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
      input.parentElement.classList.toggle('is-active', isActive);
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
})();
