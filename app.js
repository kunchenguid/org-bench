(function () {
  const core = window.SpreadsheetCore;
  const COLS = 26;
  const ROWS = 100;
  const storageNamespace = resolveStorageNamespace();
  const storageKey = storageNamespace + ':sheet-state';
  const persisted = loadState();
  const sheet = core.createSheet(persisted.cells);
  const model = new window.SpreadsheetGridModel({ rows: ROWS, columns: COLS });
  const gridWrap = document.querySelector('.grid-wrap');
  const formulaInput = document.querySelector('#formula-input');
  const activeAddress = document.querySelector('.active-address');
  const state = { editingSurface: null };

  if (persisted.active) {
    const selection = core.splitAddress(persisted.active);
    if (selection) model.setSelection(selection.row, selection.col);
  }

  renderGrid();
  syncFormulaBar();
  focusActiveCell();

  gridWrap.addEventListener('click', function (event) {
    const cell = event.target.closest('[data-address]');
    if (cell) selectCell(cell.dataset.address);
  });
  gridWrap.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-address]');
    if (cell) startEdit(cell.dataset.address, false, '');
  });
  gridWrap.addEventListener('keydown', handleGridKeydown);

  formulaInput.addEventListener('input', function () {
    if (!model.isEditing()) model.startEditing(core.getCellRaw(sheet, model.getSelectedAddress()));
    state.editingSurface = 'formula';
    model.updateDraft(formulaInput.value);
  });
  formulaInput.addEventListener('focus', function () {
    if (!model.isEditing()) model.startEditing(core.getCellRaw(sheet, model.getSelectedAddress()));
    state.editingSurface = 'formula';
    syncFormulaBar();
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing('enter');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEditing('tab');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  });
  formulaInput.addEventListener('blur', function () {
    if (state.editingSurface === 'formula' && model.isEditing()) commitEditing('stay');
  });

  function renderGrid() {
    const table = document.createElement('table');
    table.className = 'sheet';
    table.innerHTML = renderHeader() + renderBody();
    gridWrap.replaceChildren(table);
    updateVisibleCells();
  }
  function renderHeader() {
    let html = '<thead><tr><th class="corner row-header"></th>';
    for (let col = 1; col <= COLS; col += 1) html += '<th>' + core.indexToColumn(col) + '</th>';
    return html + '</tr></thead>';
  }
  function renderBody() {
    let html = '<tbody>';
    for (let row = 1; row <= ROWS; row += 1) {
      html += '<tr><th class="row-header">' + row + '</th>';
      for (let col = 1; col <= COLS; col += 1) {
        const address = core.makeAddress(col, row);
        html += '<td><div class="cell" tabindex="0" data-address="' + address + '"></div></td>';
      }
      html += '</tr>';
    }
    return html + '</tbody>';
  }
  function handleGridKeydown(event) {
    if (state.editingSurface && state.editingSurface !== 'formula') return;
    if (event.target.classList.contains('cell-input')) return;
    const movement = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
    if (movement) {
      event.preventDefault();
      moveSelection(movement);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEdit(model.getSelectedAddress(), false, '');
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      core.setCell(sheet, model.getSelectedAddress(), '');
      persistState();
      updateVisibleCells();
      syncFormulaBar();
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      startEdit(model.getSelectedAddress(), true, event.key);
    }
  }
  function startEdit(address, replace, value) {
    selectCell(address);
    const cell = getCellElement(address);
    state.editingSurface = 'cell';
    if (replace) model.startTyping(value);
    else model.startEditing(core.getCellRaw(sheet, address));
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = model.getDraft();
    cell.replaceChildren(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    formulaInput.value = input.value;
    input.addEventListener('input', function () {
      model.updateDraft(input.value);
      formulaInput.value = input.value;
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEditing('enter');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEditing('tab');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
    input.addEventListener('blur', function () {
      if (state.editingSurface === 'cell' && model.isEditing()) commitEditing('stay');
    });
  }
  function commitEditing(mode) {
    const commit = model.commitEdit(mode);
    if (!commit) return;
    core.setCell(sheet, commit.address, commit.raw);
    state.editingSurface = null;
    persistState();
    updateVisibleCells();
    syncFormulaBar();
    focusActiveCell();
  }
  function cancelEditing() {
    if (!model.isEditing()) return;
    model.cancelEdit();
    state.editingSurface = null;
    updateVisibleCells();
    syncFormulaBar();
    focusActiveCell();
  }
  function selectCell(address) {
    const selection = core.splitAddress(address);
    if (!selection) return;
    model.setSelection(selection.row, selection.col);
    updateVisibleCells();
    syncFormulaBar();
    persistState();
  }
  function moveSelection(direction) {
    model.moveSelection(direction);
    updateVisibleCells();
    syncFormulaBar();
    persistState();
    focusActiveCell();
  }
  function updateVisibleCells() {
    const cells = gridWrap.querySelectorAll('[data-address]');
    for (let i = 0; i < cells.length; i += 1) {
      const address = cells[i].dataset.address;
      cells[i].classList.toggle('active', address === model.getSelectedAddress());
      if (state.editingSurface === 'cell' && model.getEditTarget() === address) continue;
      cells[i].textContent = core.getCellDisplay(sheet, address);
    }
  }
  function syncFormulaBar() {
    activeAddress.textContent = model.getSelectedAddress();
    formulaInput.value = model.isEditing() ? model.getDraft() : core.getCellRaw(sheet, model.getSelectedAddress());
  }
  function focusActiveCell() {
    const cell = getCellElement(model.getSelectedAddress());
    if (cell) cell.focus();
  }
  function getCellElement(address) {
    return gridWrap.querySelector('[data-address="' + address + '"]');
  }
  function persistState() {
    localStorage.setItem(storageKey, JSON.stringify({ cells: sheet.cells, active: model.getSelectedAddress() }));
  }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (error) { return {}; }
  }
  function resolveStorageNamespace() {
    return window.__RUN_STORAGE_NAMESPACE__ || window.RUN_STORAGE_NAMESPACE || window.__BENCHMARK_STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'sheet';
  }
})();
