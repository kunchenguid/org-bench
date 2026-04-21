(function () {
  const core = window.SpreadsheetCore;
  const engine = loadEngine();
  const table = document.getElementById('spreadsheet');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.querySelector('.name-box');

  const state = {
    editing: null,
  };

  renderGrid();
  syncFormulaBar();
  bindEvents();
  scrollSelectionIntoView();

  function getStorageNamespace() {
    const candidates = [
      window.BENCHMARK_STORAGE_NAMESPACE,
      window.__BENCHMARK_STORAGE_NAMESPACE__,
      window.STORAGE_NAMESPACE,
      document.body && document.body.dataset && document.body.dataset.storageNamespace,
    ];
    const namespace = candidates.find(Boolean);
    return `${namespace || 'gridline'}:spreadsheet`;
  }

  function loadEngine() {
    try {
      const raw = localStorage.getItem(getStorageNamespace());
      if (raw) {
        return core.SpreadsheetEngine.fromSnapshot(JSON.parse(raw));
      }
    } catch (error) {
      console.warn('Failed to restore spreadsheet state', error);
    }
    return new core.SpreadsheetEngine();
  }

  function persist() {
    try {
      localStorage.setItem(getStorageNamespace(), JSON.stringify(engine.serialize()));
    } catch (error) {
      console.warn('Failed to persist spreadsheet state', error);
    }
  }

  function renderGrid() {
    const fragment = document.createDocumentFragment();
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);
    for (let col = 0; col < core.MAX_COLS; col += 1) {
      const th = document.createElement('th');
      th.textContent = core.indexToColumnLabel(col);
      headerRow.appendChild(th);
    }
    fragment.appendChild(headerRow);

    const selection = engine.getSelection();
    for (let row = 0; row < core.MAX_ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);
      for (let col = 0; col < core.MAX_COLS; col += 1) {
        const cellId = core.coordsToCellId(row, col);
        const td = document.createElement('td');
        td.dataset.cellId = cellId;
        if (selection.row === row && selection.col === col) {
          td.classList.add('active');
        }
        const display = engine.getDisplayValue(cellId);
        if (display.startsWith('#')) {
          td.classList.add('error');
        }
        const content = document.createElement('div');
        content.className = 'cell-display';
        content.textContent = display;
        td.appendChild(content);
        tr.appendChild(td);
      }
      fragment.appendChild(tr);
    }

    table.replaceChildren(fragment);
    if (state.editing) {
      startEditing(state.editing.cellId, state.editing.value, true);
    }
  }

  function bindEvents() {
    table.addEventListener('click', (event) => {
      const cell = event.target.closest('td[data-cell-id]');
      if (!cell) {
        return;
      }
      commitEdit();
      selectCell(cell.dataset.cellId);
    });

    table.addEventListener('dblclick', (event) => {
      const cell = event.target.closest('td[data-cell-id]');
      if (!cell) {
        return;
      }
      selectCell(cell.dataset.cellId);
      startEditing(cell.dataset.cellId, engine.getCellInput(cell.dataset.cellId));
    });

    formulaInput.addEventListener('input', () => {
      if (!state.editing) {
        state.editing = { cellId: getSelectedCellId(), value: formulaInput.value, source: 'formula' };
      } else {
        state.editing.value = formulaInput.value;
      }
      mirrorEditorValue();
    });

    formulaInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit('down');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('beforeunload', persist);
  }

  function handleKeydown(event) {
    const isMeta = event.metaKey || event.ctrlKey || event.altKey;
    if (isMeta) {
      return;
    }
    if (document.activeElement === formulaInput && state.editing) {
      return;
    }
    if (state.editing && document.activeElement && document.activeElement.classList.contains('cell-editor')) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit('down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit('right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
      return;
    }
    const selection = engine.getSelection();
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(getSelectedCellId(), engine.getCellInput(getSelectedCellId()));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(selection.row - 1, selection.col);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(selection.row + 1, selection.col);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(selection.row, selection.col - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(selection.row, selection.col + 1);
      return;
    }
    if (event.key.length === 1 || event.key === 'Backspace') {
      event.preventDefault();
      const initialValue = event.key === 'Backspace' ? '' : event.key;
      startEditing(getSelectedCellId(), initialValue);
    }
  }

  function selectCell(cellId) {
    const coords = core.cellIdToCoords(cellId);
    engine.setSelection(coords);
    state.editing = null;
    renderGrid();
    syncFormulaBar();
    persist();
    scrollSelectionIntoView();
  }

  function moveSelection(row, col) {
    engine.setSelection({
      row: Math.max(0, Math.min(core.MAX_ROWS - 1, row)),
      col: Math.max(0, Math.min(core.MAX_COLS - 1, col)),
    });
    state.editing = null;
    renderGrid();
    syncFormulaBar();
    persist();
    scrollSelectionIntoView();
  }

  function startEditing(cellId, value, preserveFocus) {
    state.editing = {
      cellId,
      value,
      originalValue: engine.getCellInput(cellId),
      source: 'cell',
    };
    const cell = table.querySelector(`[data-cell-id="${cellId}"]`);
    if (!cell) {
      return;
    }
    cell.classList.add('editing');
    cell.replaceChildren();
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.type = 'text';
    input.spellcheck = false;
    input.value = value;
    input.addEventListener('input', () => {
      state.editing.value = input.value;
      formulaInput.value = input.value;
    });
    cell.appendChild(input);
    formulaInput.value = value;
    if (!preserveFocus) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function mirrorEditorValue() {
    if (!state.editing) {
      return;
    }
    const input = table.querySelector('.cell-editor');
    if (input) {
      input.value = state.editing.value;
    }
  }

  function commitEdit(direction) {
    if (!state.editing) {
      return;
    }
    engine.setCell(state.editing.cellId, state.editing.value);
    state.editing = null;
    renderGrid();
    syncFormulaBar();
    persist();

    if (direction === 'down') {
      const selection = engine.getSelection();
      moveSelection(selection.row + 1, selection.col);
    } else if (direction === 'right') {
      const selection = engine.getSelection();
      moveSelection(selection.row, selection.col + 1);
    }
  }

  function cancelEdit() {
    state.editing = null;
    renderGrid();
    syncFormulaBar();
  }

  function syncFormulaBar() {
    const cellId = getSelectedCellId();
    nameBox.textContent = cellId;
    formulaInput.value = state.editing ? state.editing.value : engine.getCellInput(cellId);
  }

  function getSelectedCellId() {
    const selection = engine.getSelection();
    return core.coordsToCellId(selection.row, selection.col);
  }

  function scrollSelectionIntoView() {
    const activeCell = table.querySelector('td.active');
    if (activeCell) {
      activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
})();
