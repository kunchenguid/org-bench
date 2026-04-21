(function () {
  const core = window.SpreadsheetCore;
  const COLS = 26;
  const ROWS = 100;
  const storageKey = resolveStorageNamespace() + ':sheet-state';
  const persisted = loadState();
  const sheet = core.createSheet(persisted.cells);
  const formulaInput = document.querySelector('[data-formula-bar]');
  const nameBox = document.querySelector('[data-name-box]');
  const gridBody = document.querySelector('[data-grid-body]');
  const state = { active: persisted.active || 'A1', editing: null };

  buildGrid();
  renderCells();
  syncChrome();
  focusActiveCell();

  gridBody.addEventListener('click', function (event) {
    const cell = event.target.closest('[data-address]');
    if (cell) selectCell(cell.dataset.address, true);
  });

  gridBody.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-address]');
    if (cell) startEdit(cell.dataset.address, false, '');
  });

  gridBody.addEventListener('keydown', function (event) {
    if (event.target.classList.contains('cell-input')) {
      return;
    }
    handleGridKeydown(event);
  });

  formulaInput.addEventListener('input', function () {
    if (state.editing !== 'formula') {
      state.editing = 'formula';
    }
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitValue(state.active, formulaInput.value, 'down');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      state.editing = null;
      syncChrome();
      focusActiveCell();
    }
  });

  formulaInput.addEventListener('blur', function () {
    if (state.editing === 'formula') {
      commitValue(state.active, formulaInput.value, null);
    }
  });

  function buildGrid() {
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    for (let col = 1; col <= COLS; col += 1) {
      const header = document.createElement('th');
      header.className = 'column-header';
      header.textContent = core.indexToColumn(col);
      headerRow.appendChild(header);
    }
    gridBody.appendChild(headerRow);

    for (let row = 1; row <= ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row);
      tr.appendChild(rowHeader);

      for (let col = 1; col <= COLS; col += 1) {
        const address = core.makeAddress(col, row);
        const td = document.createElement('td');
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.tabIndex = 0;
        cell.dataset.address = address;
        td.appendChild(cell);
        tr.appendChild(td);
      }

      gridBody.appendChild(tr);
    }
  }

  function handleGridKeydown(event) {
    if (state.editing && state.editing !== 'formula') {
      return;
    }

    const movement = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    }[event.key];

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

  function startEdit(address, replace, seedValue) {
    selectCell(address, false);
    const cell = getCellElement(address);
    if (!cell) {
      return;
    }

    state.editing = address;
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = replace ? seedValue : core.getCellRaw(sheet, address);
    cell.replaceChildren(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    formulaInput.value = input.value;

    input.addEventListener('input', function () {
      formulaInput.value = input.value;
    });

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
        renderCells();
        syncChrome();
        focusActiveCell();
      }
    });

    input.addEventListener('blur', function () {
      if (state.editing === address) {
        commitValue(address, input.value, null);
      }
    });
  }

  function commitValue(address, value, move) {
    core.setCell(sheet, address, value);
    state.editing = null;
    persistState();
    renderCells();
    if (move === 'down') moveSelection(0, 1);
    if (move === 'right') moveSelection(1, 0);
    syncChrome();
    focusActiveCell();
  }

  function selectCell(address, persist) {
    state.active = address;
    renderCells();
    syncChrome();
    if (persist) {
      persistState();
    }
  }

  function moveSelection(dx, dy) {
    const current = core.splitAddress(state.active);
    selectCell(core.makeAddress(clamp(current.col + dx, 1, COLS), clamp(current.row + dy, 1, ROWS)), true);
    focusActiveCell();
  }

  function renderCells() {
    const cells = gridBody.querySelectorAll('[data-address]');
    cells.forEach(function (cell) {
      const address = cell.dataset.address;
      cell.classList.toggle('active', address === state.active);
      if (state.editing === address) {
        return;
      }

      const display = core.getCellDisplay(sheet, address);
      cell.textContent = display;
      cell.classList.toggle('numeric', display !== '' && !Number.isNaN(Number(display)));
      cell.classList.toggle('error', display.charAt(0) === '#');
    });
  }

  function syncChrome() {
    nameBox.textContent = state.active;
    if (state.editing !== 'formula') {
      formulaInput.value = core.getCellRaw(sheet, state.active);
    }
  }

  function focusActiveCell() {
    const cell = getCellElement(state.active);
    if (cell) {
      cell.focus();
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function getCellElement(address) {
    return gridBody.querySelector('[data-address="' + address + '"]');
  }

  function persistState() {
    window.localStorage.setItem(storageKey, JSON.stringify({ cells: sheet.cells, active: state.active }));
  }

  function loadState() {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    } catch (_error) {
      return {};
    }
  }

  function resolveStorageNamespace() {
    return window.__RUN_STORAGE_NAMESPACE__ || window.RUN_STORAGE_NAMESPACE || window.__BENCHMARK_STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'sheet';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
