(function () {
  const core = window.SpreadsheetCore;
  const COLS = 26;
  const ROWS = 100;
  const storageNamespace = resolveStorageNamespace();
  const storageKey = storageNamespace + ':sheet-state';
  const persisted = loadState();
  const sheet = core.createSheet(persisted.cells);
  const gridWrap = document.querySelector('.grid-wrap');
  const formulaInput = document.querySelector('#formula-input');
  const state = { active: persisted.active || 'A1', editing: null };

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
    if (state.editing !== 'formula') state.editing = 'formula';
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitValue(state.active, formulaInput.value, 'down');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      state.editing = null;
      syncFormulaBar();
      focusActiveCell();
    }
  });
  formulaInput.addEventListener('blur', function () {
    if (state.editing === 'formula') commitValue(state.active, formulaInput.value, null);
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
    if (state.editing && state.editing !== 'formula') return;
    if (event.target.classList.contains('cell-input')) return;
    const movement = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (movement) {
      event.preventDefault();
      moveSelection(movement[0], movement[1]);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEdit(state.active, false, '');
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      commitValue(state.active, '', null);
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      startEdit(state.active, true, event.key);
    }
  }
  function startEdit(address, replace, value) {
    selectCell(address);
    const cell = getCellElement(address);
    state.editing = address;
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = replace ? value : core.getCellRaw(sheet, address);
    cell.replaceChildren(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    formulaInput.value = input.value;
    input.addEventListener('input', function () { formulaInput.value = input.value; });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitValue(address, input.value, 'down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitValue(address, input.value, 'right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        state.editing = null;
        updateVisibleCells();
        syncFormulaBar();
        focusActiveCell();
      }
    });
    input.addEventListener('blur', function () {
      if (state.editing === address) commitValue(address, input.value, null);
    });
  }
  function commitValue(address, value, move) {
    core.setCell(sheet, address, value);
    state.editing = null;
    persistState();
    updateVisibleCells();
    if (move === 'down') moveSelection(0, 1);
    if (move === 'right') moveSelection(1, 0);
    syncFormulaBar();
    focusActiveCell();
  }
  function selectCell(address) {
    state.active = address;
    updateVisibleCells();
    syncFormulaBar();
    persistState();
  }
  function moveSelection(dx, dy) {
    const current = core.splitAddress(state.active);
    selectCell(core.makeAddress(clamp(current.col + dx, 1, COLS), clamp(current.row + dy, 1, ROWS)));
    focusActiveCell();
  }
  function updateVisibleCells() {
    const cells = gridWrap.querySelectorAll('[data-address]');
    for (let i = 0; i < cells.length; i += 1) {
      const address = cells[i].dataset.address;
      cells[i].classList.toggle('active', address === state.active);
      if (state.editing === address) continue;
      cells[i].textContent = core.getCellDisplay(sheet, address);
    }
  }
  function syncFormulaBar() {
    if (state.editing !== 'formula') formulaInput.value = core.getCellRaw(sheet, state.active);
  }
  function focusActiveCell() {
    const cell = getCellElement(state.active);
    if (cell) cell.focus();
  }
  function getCellElement(address) {
    return gridWrap.querySelector('[data-address="' + address + '"]');
  }
  function persistState() {
    localStorage.setItem(storageKey, JSON.stringify({ cells: sheet.cells, active: state.active }));
  }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (error) { return {}; }
  }
  function resolveStorageNamespace() {
    return window.__RUN_STORAGE_NAMESPACE__ || window.RUN_STORAGE_NAMESPACE || window.__BENCHMARK_STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'sheet';
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
})();
