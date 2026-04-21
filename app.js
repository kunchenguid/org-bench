(function () {
  'use strict';

  var core = window.SpreadsheetCore;
  var state = {
    cells: {},
    selected: { col: 0, row: 0 },
  };

  var storageNamespace = window.__BENCHMARK_RUN_NAMESPACE__ || 'spreadsheet:';
  var stateStorageKey = core.storageKey(storageNamespace, 'sheet-state');

  var formulaInput;
  var nameBox;
  var gridBody;

  function selectedKey() {
    return core.cellKey(state.selected);
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(stateStorageKey);
      if (!raw) {
        return;
      }

      var saved = JSON.parse(raw);
      if (saved && saved.cells && saved.selected) {
        state.cells = saved.cells;
        state.selected = core.clampPosition(saved.selected);
      }
    } catch (error) {
      console.warn('Failed to load spreadsheet state', error);
    }
  }

  function saveState() {
    window.localStorage.setItem(stateStorageKey, JSON.stringify(state));
  }

  function updateChrome() {
    var key = selectedKey();
    nameBox.value = key;
    formulaInput.value = state.cells[key] || '';
  }

  function updateSelection() {
    var previous = gridBody.querySelector('.cell.is-active');
    if (previous) {
      previous.classList.remove('is-active');
    }

    var next = gridBody.querySelector('[data-cell="' + selectedKey() + '"]');
    if (next) {
      next.classList.add('is-active');
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    updateChrome();
  }

  function commitFormulaBar() {
    var key = selectedKey();
    var value = formulaInput.value;

    if (value) {
      state.cells[key] = value;
    } else {
      delete state.cells[key];
    }

    var cell = gridBody.querySelector('[data-cell="' + key + '"]');
    if (cell) {
      cell.textContent = value;
      cell.classList.toggle('is-empty', !value);
    }

    saveState();
    updateChrome();
  }

  function renderGrid() {
    var fragment = document.createDocumentFragment();

    for (var rowIndex = 0; rowIndex < core.GRID_ROWS; rowIndex += 1) {
      var row = document.createElement('div');
      row.className = 'grid-row';

      var rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(rowIndex + 1);
      row.appendChild(rowHeader);

      for (var colIndex = 0; colIndex < core.GRID_COLUMNS; colIndex += 1) {
        var position = { col: colIndex, row: rowIndex };
        var key = core.cellKey(position);
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.setAttribute('data-cell', key);
        cell.textContent = state.cells[key] || '';
        cell.classList.toggle('is-empty', !state.cells[key]);
        cell.addEventListener('click', function (event) {
          var clickedKey = event.currentTarget.getAttribute('data-cell');
          var columnCode = clickedKey.charCodeAt(0) - 65;
          var rowNumber = Number(clickedKey.slice(1)) - 1;
          state.selected = { col: columnCode, row: rowNumber };
          updateSelection();
          saveState();
        });
        row.appendChild(cell);
      }

      fragment.appendChild(row);
    }

    gridBody.appendChild(fragment);
  }

  function renderHeaders() {
    var headerRow = document.getElementById('column-headers');
    for (var colIndex = 0; colIndex < core.GRID_COLUMNS; colIndex += 1) {
      var cell = document.createElement('div');
      cell.className = 'column-header';
      cell.textContent = core.columnLabel(colIndex);
      headerRow.appendChild(cell);
    }
  }

  function onKeyDown(event) {
    if (document.activeElement === formulaInput) {
      if (event.key === 'Enter') {
        commitFormulaBar();
        state.selected = core.movePosition(state.selected, 0, 1);
        updateSelection();
        saveState();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      state.selected = core.movePosition(state.selected, 0, -1);
    } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
      state.selected = core.movePosition(state.selected, 0, 1);
    } else if (event.key === 'ArrowLeft') {
      state.selected = core.movePosition(state.selected, -1, 0);
    } else if (event.key === 'ArrowRight' || event.key === 'Tab') {
      state.selected = core.movePosition(state.selected, 1, 0);
      if (event.key === 'Tab') {
        event.preventDefault();
      }
    } else {
      return;
    }

    updateSelection();
    saveState();
  }

  function init() {
    formulaInput = document.getElementById('formula-input');
    nameBox = document.getElementById('name-box');
    gridBody = document.getElementById('grid-body');

    loadState();
    renderHeaders();
    renderGrid();
    updateSelection();

    formulaInput.addEventListener('change', commitFormulaBar);
    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        updateChrome();
        formulaInput.blur();
      }
    });
    document.addEventListener('keydown', onKeyDown);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
