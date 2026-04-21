(function () {
  const namespace = [
    window.__BENCHMARK_STORAGE_NAMESPACE__,
    window.BENCHMARK_STORAGE_NAMESPACE,
    document.documentElement.getAttribute('data-storage-namespace'),
    'facebook-spreadsheet:',
  ].find(Boolean);

  const storage = createSafeStorage(window.localStorage);
  const model = window.SpreadsheetCore.createSpreadsheet({
    rows: 100,
    cols: 26,
    storage: storage,
    storageKeyPrefix: namespace,
  });

  const formulaBar = document.getElementById('formula-bar');
  const grid = document.getElementById('sheet-grid');
  const state = {
    editingCell: null,
    draftValue: '',
    startedByTyping: false,
  };

  buildGrid();
  render();

  model.subscribe(render);
  grid.addEventListener('click', onGridClick);
  grid.addEventListener('dblclick', onGridDoubleClick);
  grid.addEventListener('keydown', onGridEditorKeydown);
  document.addEventListener('keydown', onDocumentKeydown);
  formulaBar.addEventListener('focus', syncFormulaBar);
  formulaBar.addEventListener('input', onFormulaInput);
  formulaBar.addEventListener('keydown', onFormulaKeydown);

  function buildGrid() {
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);
    for (let col = 1; col <= 26; col += 1) {
      const th = document.createElement('th');
      th.textContent = window.SpreadsheetCore.numberToLetters(col);
      headerRow.appendChild(th);
    }
    grid.appendChild(headerRow);

    for (let row = 1; row <= 100; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row);
      tr.appendChild(rowHeader);

      for (let col = 1; col <= 26; col += 1) {
        const td = document.createElement('td');
        const cell = document.createElement('div');
        const cellId = window.SpreadsheetCore.positionToCellId(row, col);
        cell.className = 'cell';
        cell.dataset.cellId = cellId;
        cell.tabIndex = -1;
        td.appendChild(cell);
        tr.appendChild(td);
      }

      grid.appendChild(tr);
    }
  }

  function render() {
    const selected = model.getSelectedCell();
    const cells = grid.querySelectorAll('.cell');
    cells.forEach(function (cell) {
      const cellId = cell.dataset.cellId;
      const display = model.getCellDisplay(cellId);
      const raw = model.getCellRaw(cellId);
      const isActive = cellId === selected;
      const isEditing = cellId === state.editingCell;
      cell.className = 'cell';
      if (isActive) {
        cell.classList.add('active');
      }
      if (/^#/.test(display)) {
        cell.classList.add('error');
      }
      if (!isNaN(Number(display)) && display !== '') {
        cell.classList.add('numeric');
      }
      cell.textContent = display;
      cell.title = raw || display;

      if (isEditing) {
        const editor = document.createElement('input');
        editor.className = 'cell-editor';
        editor.value = state.draftValue;
        editor.dataset.cellId = cellId;
        cell.textContent = '';
        cell.appendChild(editor);
        queueMicrotask(function () {
          editor.focus();
          if (state.startedByTyping) {
            editor.setSelectionRange(editor.value.length, editor.value.length);
          } else {
            editor.select();
          }
        });
      }
    });

    if (document.activeElement !== formulaBar && !state.editingCell) {
      syncFormulaBar();
    }
  }

  function syncFormulaBar() {
    if (!state.editingCell) {
      formulaBar.value = model.getFormulaBarText();
    }
  }

  function onGridClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    state.editingCell = null;
    state.startedByTyping = false;
    model.selectCell(cell.dataset.cellId);
  }

  function onGridDoubleClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    model.selectCell(cell.dataset.cellId);
    startEditing(cell.dataset.cellId, model.getCellRaw(cell.dataset.cellId), false);
  }

  function onDocumentKeydown(event) {
    if (state.editingCell) {
      return;
    }
    if (document.activeElement === formulaBar) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key;
    if (key === 'ArrowUp') {
      event.preventDefault();
      model.moveSelection(-1, 0);
      return;
    }
    if (key === 'ArrowDown') {
      event.preventDefault();
      model.moveSelection(1, 0);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      model.moveSelection(0, -1);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      model.moveSelection(0, 1);
      return;
    }
    if (key === 'Enter' || key === 'F2') {
      event.preventDefault();
      const cellId = model.getSelectedCell();
      startEditing(cellId, model.getCellRaw(cellId), false);
      return;
    }
    if (key === 'Backspace' || key === 'Delete') {
      event.preventDefault();
      model.setCellRaw(model.getSelectedCell(), '');
      return;
    }
    if (key.length === 1) {
      event.preventDefault();
      startEditing(model.getSelectedCell(), key, true);
    }
  }

  function onGridEditorKeydown(event) {
    if (!event.target.classList.contains('cell-editor')) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing(event.target.value, 1, 0);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEditing(event.target.value, 0, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }

  function onFormulaInput() {
    if (document.activeElement !== formulaBar) {
      return;
    }
    state.editingCell = model.getSelectedCell();
    state.draftValue = formulaBar.value;
  }

  function onFormulaKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing(formulaBar.value, 1, 0);
      formulaBar.blur();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEditing(formulaBar.value, 0, event.shiftKey ? -1 : 1);
      formulaBar.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
      formulaBar.value = model.getFormulaBarText();
      formulaBar.blur();
    }
  }

  function startEditing(cellId, value, startedByTyping) {
    state.editingCell = cellId;
    state.draftValue = value;
    state.startedByTyping = startedByTyping;
    render();
  }

  function commitEditing(value, rowDelta, colDelta) {
    const cellId = state.editingCell || model.getSelectedCell();
    model.setCellRaw(cellId, value);
    state.editingCell = null;
    state.draftValue = '';
    state.startedByTyping = false;
    if (rowDelta || colDelta) {
      model.moveSelection(rowDelta, colDelta);
    } else {
      render();
    }
  }

  function cancelEditing() {
    state.editingCell = null;
    state.draftValue = '';
    state.startedByTyping = false;
    render();
  }

  function createSafeStorage(backingStorage) {
    try {
      const probeKey = namespace + 'probe';
      backingStorage.setItem(probeKey, '1');
      backingStorage.removeItem(probeKey);
      return backingStorage;
    } catch (error) {
      return null;
    }
  }
})();
