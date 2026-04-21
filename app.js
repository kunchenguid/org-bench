(function () {
  const SpreadsheetModel = window.SpreadsheetCore.SpreadsheetModel;
  const utils = window.SpreadsheetCore.utils;

  const ROWS = 100;
  const COLS = 26;
  const STORAGE_KEY = resolveStorageNamespace() + 'sheet-state';

  const grid = document.getElementById('grid');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');

  const restoredState = loadState();
  const model = new SpreadsheetModel(restoredState.cells || {});

  const state = {
    selected: clampSelection(restoredState.selected || { row: 0, column: 0 }),
    editing: null,
  };

  buildGrid();
  renderAllCells();
  renderSelection();
  bindEvents();

  function resolveStorageNamespace() {
    return (
      window.__RUN_STORAGE_NAMESPACE__ ||
      window.RUN_STORAGE_NAMESPACE ||
      window.__BENCHMARK_STORAGE_NAMESPACE__ ||
      document.documentElement.dataset.storageNamespace ||
      'gridline:'
    );
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selected: state.selected,
        cells: model.toJSON(),
      })
    );
  }

  function buildGrid() {
    const fragment = document.createDocumentFragment();

    fragment.appendChild(makeDiv('corner', ''));
    for (let column = 0; column < COLS; column += 1) {
      fragment.appendChild(makeDiv('header-cell', utils.indexToColumn(column)));
    }

    for (let row = 0; row < ROWS; row += 1) {
      fragment.appendChild(makeDiv('row-header', String(row + 1)));
      for (let column = 0; column < COLS; column += 1) {
        const address = utils.joinAddress(column, row);
        const cell = makeDiv('cell', '');
        cell.dataset.address = address;
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        fragment.appendChild(cell);
      }
    }
    grid.appendChild(fragment);
  }

  function makeDiv(className, text) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    return element;
  }

  function bindEvents() {
    grid.addEventListener('click', onGridClick);
    grid.addEventListener('dblclick', onGridDoubleClick);
    formulaInput.addEventListener('input', onFormulaInput);
    formulaInput.addEventListener('keydown', onFormulaKeyDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    window.addEventListener('beforeunload', persist);
  }

  function onGridClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    if (state.editing) {
      commitEdit(state.editing.value, { rowDelta: 0, columnDelta: 0 });
    }
    state.selected = {
      row: Number(cell.dataset.row),
      column: Number(cell.dataset.column),
    };
    renderSelection();
  }

  function onGridDoubleClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    startCellEdit(getSelectedAddress(), model.getCellRaw(getSelectedAddress()));
  }

  function onFormulaInput(event) {
    if (state.editing && state.editing.source === 'cell') {
      return;
    }
    state.editing = {
      source: 'formula',
      address: getSelectedAddress(),
      value: event.target.value,
      original: model.getCellRaw(getSelectedAddress()),
    };
  }

  function onFormulaKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(formulaInput.value, { rowDelta: 1, columnDelta: 0 });
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  function onDocumentKeyDown(event) {
    if (event.target === formulaInput) {
      return;
    }

    if (state.editing && state.editing.source === 'cell') {
      return;
    }

    if ((event.metaKey || event.ctrlKey || event.altKey) && event.key.toLowerCase() !== 'v') {
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
      startCellEdit(getSelectedAddress(), model.getCellRaw(getSelectedAddress()));
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      model.setCellRaw(getSelectedAddress(), '');
      renderAllCells();
      renderSelection();
      persist();
      return;
    }
    if (isPrintableKey(event)) {
      event.preventDefault();
      startCellEdit(getSelectedAddress(), event.key, true);
    }
  }

  function isPrintableKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  function startCellEdit(address, initialValue, replace) {
    const cell = getCellElement(address);
    if (!cell) {
      return;
    }
    const raw = replace ? initialValue : model.getCellRaw(address);
    state.editing = {
      source: 'cell',
      address: address,
      value: raw,
      original: model.getCellRaw(address),
    };
    cell.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = raw;
    input.setAttribute('spellcheck', 'false');
    input.addEventListener('input', function () {
      state.editing.value = input.value;
      formulaInput.value = input.value;
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(input.value, { rowDelta: 1, columnDelta: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(input.value, { rowDelta: 0, columnDelta: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });
    input.addEventListener('blur', function () {
      if (state.editing && state.editing.source === 'cell') {
        commitEdit(input.value, { rowDelta: 0, columnDelta: 0 });
      }
    });
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    formulaInput.value = raw;
  }

  function cancelEdit() {
    if (!state.editing) {
      return;
    }
    state.editing = null;
    renderAllCells();
    renderSelection();
  }

  function commitEdit(value, movement) {
    if (!state.editing) {
      state.editing = {
        source: 'formula',
        address: getSelectedAddress(),
      };
    }
    model.setCellRaw(state.editing.address, value);
    state.editing = null;
    renderAllCells();
    moveSelection(movement.rowDelta, movement.columnDelta, true);
    persist();
  }

  function moveSelection(rowDelta, columnDelta, keepFocus) {
    state.selected = clampSelection({
      row: state.selected.row + rowDelta,
      column: state.selected.column + columnDelta,
    });
    renderSelection();
    if (!keepFocus) {
      persist();
    }
  }

  function clampSelection(next) {
    return {
      row: Math.max(0, Math.min(ROWS - 1, next.row)),
      column: Math.max(0, Math.min(COLS - 1, next.column)),
    };
  }

  function renderAllCells() {
    const cells = grid.querySelectorAll('.cell');
    cells.forEach(function (cell) {
      const address = cell.dataset.address;
      if (state.editing && state.editing.source === 'cell' && state.editing.address === address) {
        return;
      }
      const value = model.getCellDisplay(address);
      cell.textContent = value;
      cell.classList.remove('error', 'text', 'number', 'boolean');
      if (value.startsWith('#')) {
        cell.classList.add('error');
      } else if (value === 'TRUE' || value === 'FALSE') {
        cell.classList.add('boolean');
      } else if (value !== '' && !Number.isNaN(Number(value))) {
        cell.classList.add('number');
      } else {
        cell.classList.add('text');
      }
    });
  }

  function renderSelection() {
    grid.querySelectorAll('.cell.active').forEach(function (cell) {
      cell.classList.remove('active');
    });
    const address = getSelectedAddress();
    const activeCell = getCellElement(address);
    if (activeCell) {
      activeCell.classList.add('active');
      activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    nameBox.textContent = address;
    if (!state.editing || state.editing.source !== 'cell') {
      formulaInput.value = model.getCellRaw(address);
    }
  }

  function getSelectedAddress() {
    return utils.joinAddress(state.selected.column, state.selected.row);
  }

  function getCellElement(address) {
    return grid.querySelector('.cell[data-address="' + address + '"]');
  }
})();
