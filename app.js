(function () {
  'use strict';

  const ROWS = 100;
  const COLS = 26;
  const core = window.SpreadsheetCore;
  const workbook = core.createWorkbook();
  const elements = {};
  const state = {
    active: { row: 1, col: 1 },
    editing: null,
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    elements.grid = document.querySelector('[data-grid]');
    elements.formula = document.querySelector('[data-formula-input]');
    elements.name = document.querySelector('[data-name-box]');
    elements.status = document.querySelector('[data-status]');

    loadState();
    renderGrid();
    renderSelection();
    bindEvents();
    setStatus('Ready');
  }

  function bindEvents() {
    elements.grid.addEventListener('click', onGridClick);
    elements.grid.addEventListener('dblclick', onGridDoubleClick);
    elements.formula.addEventListener('input', onFormulaInput);
    elements.formula.addEventListener('keydown', onFormulaKeyDown);
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('beforeunload', persistState);
  }

  function renderGrid() {
    const fragment = document.createDocumentFragment();
    const table = document.createElement('table');
    table.className = 'sheet';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createCornerCell());
    for (let col = 1; col <= COLS; col += 1) {
      const cell = document.createElement('th');
      cell.textContent = core.formatAddress(1, col).replace('1', '');
      cell.dataset.colHeader = String(col);
      headerRow.appendChild(cell);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    for (let row = 1; row <= ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.textContent = String(row);
      rowHeader.dataset.rowHeader = String(row);
      tr.appendChild(rowHeader);

      for (let col = 1; col <= COLS; col += 1) {
        const td = document.createElement('td');
        td.tabIndex = -1;
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        td.dataset.address = core.formatAddress(row, col);
        td.textContent = core.evaluateCellDisplay(workbook, td.dataset.address);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    fragment.appendChild(table);
    elements.grid.innerHTML = '';
    elements.grid.appendChild(fragment);
  }

  function createCornerCell() {
    const cell = document.createElement('th');
    cell.className = 'corner';
    cell.textContent = '';
    return cell;
  }

  function onGridClick(event) {
    const cell = event.target.closest('td[data-address]');
    if (!cell) {
      return;
    }
    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
  }

  function onGridDoubleClick(event) {
    const cell = event.target.closest('td[data-address]');
    if (!cell) {
      return;
    }
    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    startEditing(workbook.getCell(cell.dataset.address), true);
  }

  function onFormulaInput(event) {
    if (!state.editing) {
      state.editing = {
        address: activeAddress(),
        draft: event.target.value,
        preserve: true,
        source: 'formula',
      };
    } else {
      state.editing.draft = event.target.value;
    }
  }

  function onFormulaKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit('down');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  function onWindowKeyDown(event) {
    const targetIsFormula = event.target === elements.formula;
    if (state.editing && !targetIsFormula && event.key === 'Escape') {
      cancelEdit();
      return;
    }

    if (!targetIsFormula && isTypingKey(event)) {
      event.preventDefault();
      startEditing(event.key, false);
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      startEditing(workbook.getCell(activeAddress()), true);
      return;
    }

    if (event.key === 'Enter' && !targetIsFormula) {
      event.preventDefault();
      if (state.editing) {
        commitEdit('down');
      } else {
        startEditing(workbook.getCell(activeAddress()), true);
      }
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      if (state.editing) {
        commitEdit('right');
      } else {
        moveSelection(0, 1);
      }
      return;
    }

    if (state.editing) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1);
    }
  }

  function isTypingKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  function selectCell(row, col) {
    state.active = {
      row: clamp(row, 1, ROWS),
      col: clamp(col, 1, COLS),
    };
    if (!state.editing) {
      elements.formula.value = workbook.getCell(activeAddress());
    }
    renderSelection();
    persistState();
  }

  function moveSelection(rowDelta, colDelta) {
    selectCell(state.active.row + rowDelta, state.active.col + colDelta);
    scrollActiveCellIntoView();
  }

  function renderSelection() {
    elements.grid.querySelectorAll('.is-active, .is-col-active, .is-row-active').forEach((node) => {
      node.classList.remove('is-active', 'is-col-active', 'is-row-active');
    });

    const active = findCell(state.active.row, state.active.col);
    if (active) {
      active.classList.add('is-active');
    }

    const colHeader = elements.grid.querySelector(`[data-col-header="${state.active.col}"]`);
    const rowHeader = elements.grid.querySelector(`[data-row-header="${state.active.row}"]`);
    if (colHeader) {
      colHeader.classList.add('is-col-active');
    }
    if (rowHeader) {
      rowHeader.classList.add('is-row-active');
    }

    elements.name.value = activeAddress();
    elements.formula.value = state.editing ? state.editing.draft : workbook.getCell(activeAddress());
  }

  function startEditing(value, preserve) {
    state.editing = {
      address: activeAddress(),
      draft: value,
      preserve,
      source: 'cell',
    };
    elements.formula.value = value;
    elements.formula.focus();
    elements.formula.setSelectionRange(value.length, value.length);
    setStatus(`Editing ${activeAddress()}`);
  }

  function commitEdit(direction) {
    if (!state.editing) {
      return;
    }
    workbook.setCell(state.editing.address, state.editing.draft);
    state.editing = null;
    refreshVisibleCells();
    renderSelection();
    persistState();
    setStatus(`Saved ${activeAddress()}`);
    if (direction === 'down') {
      moveSelection(1, 0);
    } else if (direction === 'right') {
      moveSelection(0, 1);
    }
  }

  function cancelEdit() {
    state.editing = null;
    renderSelection();
    setStatus('Edit cancelled');
  }

  function refreshVisibleCells() {
    elements.grid.querySelectorAll('td[data-address]').forEach((cell) => {
      cell.textContent = core.evaluateCellDisplay(workbook, cell.dataset.address);
    });
  }

  function findCell(row, col) {
    return elements.grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  }

  function scrollActiveCellIntoView() {
    const cell = findCell(state.active.row, state.active.col);
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function activeAddress() {
    return core.formatAddress(state.active.row, state.active.col);
  }

  function persistState() {
    const namespace = getRunNamespace();
    localStorage.setItem(core.getStorageKey(namespace, 'workbook'), JSON.stringify(workbook.getCells()));
    localStorage.setItem(core.getStorageKey(namespace, 'selection'), JSON.stringify(state.active));
  }

  function loadState() {
    const namespace = getRunNamespace();
    const storedCells = localStorage.getItem(core.getStorageKey(namespace, 'workbook'));
    const storedSelection = localStorage.getItem(core.getStorageKey(namespace, 'selection'));

    if (storedCells) {
      const entries = JSON.parse(storedCells);
      Object.keys(entries).forEach((address) => workbook.setCell(address, entries[address]));
    }
    if (storedSelection) {
      const selection = JSON.parse(storedSelection);
      if (selection && selection.row && selection.col) {
        state.active = {
          row: clamp(selection.row, 1, ROWS),
          col: clamp(selection.col, 1, COLS),
        };
      }
    }
  }

  function getRunNamespace() {
    return window.__BENCHMARK_RUN_NAMESPACE__
      || window.BENCHMARK_RUN_NAMESPACE
      || document.documentElement.dataset.storageNamespace
      || 'spreadsheet';
  }

  function setStatus(text) {
    elements.status.textContent = text;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
