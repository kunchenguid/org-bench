(function () {
  var STORAGE_PREFIX = window.__BENCHMARK_RUN_NAMESPACE__ || 'facebook-spreadsheet';
  var STORAGE_KEY = STORAGE_PREFIX + ':sheet';
  var model = loadModel();
  var state = {
    editingCell: null,
    draftValue: '',
  };

  var grid = document.getElementById('grid');
  var formulaInput = document.getElementById('formula-input');
  var nameBox = document.getElementById('name-box');

  buildGrid();
  render();

  function loadModel() {
    try {
      var snapshot = window.localStorage.getItem(STORAGE_KEY);
      return snapshot ? window.SpreadsheetModel.deserialize(snapshot) : new window.SpreadsheetModel();
    } catch (error) {
      return new window.SpreadsheetModel();
    }
  }

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, model.serialize());
  }

  function buildGrid() {
    var table = document.createElement('table');
    table.className = 'sheet-table';

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner-cell';
    headRow.appendChild(corner);

    for (var col = 0; col < window.SpreadsheetAddressing.COLUMN_COUNT; col += 1) {
      var th = document.createElement('th');
      th.textContent = window.SpreadsheetAddressing.indexToColumnLabel(col);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var row = 1; row <= window.SpreadsheetAddressing.ROW_COUNT; row += 1) {
      var tr = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.textContent = String(row);
      tr.appendChild(rowHeader);

      for (var gridCol = 0; gridCol < window.SpreadsheetAddressing.COLUMN_COUNT; gridCol += 1) {
        var cell = document.createElement('td');
        var address = window.SpreadsheetAddressing.indexToColumnLabel(gridCol) + String(row);
        cell.dataset.cell = address;
        cell.tabIndex = -1;
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    grid.appendChild(table);

    grid.addEventListener('click', onCellClick);
    grid.addEventListener('dblclick', onCellDoubleClick);
    document.addEventListener('keydown', onKeyDown);
    formulaInput.addEventListener('focus', function () {
      enterFormulaEdit();
    });
    formulaInput.addEventListener('keydown', onFormulaKeyDown);
    formulaInput.addEventListener('input', function () {
      if (state.editingCell) {
        state.draftValue = formulaInput.value;
      }
    });
  }

  function onCellClick(event) {
    var cell = event.target.closest('td[data-cell]');
    if (!cell) {
      return;
    }
    selectCell(cell.dataset.cell);
  }

  function onCellDoubleClick(event) {
    var cell = event.target.closest('td[data-cell]');
    if (!cell) {
      return;
    }
    selectCell(cell.dataset.cell);
    enterCellEdit(cell.dataset.cell);
  }

  function onKeyDown(event) {
    if (event.target === formulaInput) {
      return;
    }

    if (state.editingCell) {
      var editInput = document.querySelector('.cell-editor');
      if (editInput) {
        editInput.focus();
      }
      return;
    }

    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      enterCellEdit(model.activeCell);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      enterCellEdit(model.activeCell, event.key, true);
      return;
    }

    var move = null;
    if (event.key === 'ArrowUp') {
      move = { row: -1, col: 0 };
    } else if (event.key === 'ArrowDown') {
      move = { row: 1, col: 0 };
    } else if (event.key === 'ArrowLeft') {
      move = { row: 0, col: -1 };
    } else if (event.key === 'ArrowRight' || event.key === 'Tab') {
      move = { row: 0, col: 1 };
    }

    if (move) {
      event.preventDefault();
      nudgeSelection(move.row, move.col);
    }
  }

  function onFormulaKeyDown(event) {
    if (!state.editingCell) {
      state.editingCell = model.activeCell;
      state.draftValue = formulaInput.value;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(1, 0);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(0, 1);
    }
  }

  function selectCell(address) {
    if (state.editingCell) {
      commitEdit(0, 0);
    }
    model.setActiveCell(address);
    persist();
    render();
  }

  function enterFormulaEdit() {
    state.editingCell = model.activeCell;
    state.draftValue = model.getCellRaw(model.activeCell);
    formulaInput.value = state.draftValue;
    formulaInput.select();
  }

  function enterCellEdit(address, nextValue, replaceContents) {
    state.editingCell = address;
    state.draftValue = replaceContents ? nextValue : model.getCellRaw(address);
    render();

    var input = document.querySelector('.cell-editor');
    if (!input) {
      return;
    }
    input.focus();
    if (replaceContents) {
      input.setSelectionRange(input.value.length, input.value.length);
    } else {
      input.select();
    }
  }

  function commitEdit(rowDelta, colDelta) {
    if (!state.editingCell) {
      return;
    }
    model.setCellRaw(state.editingCell, state.draftValue);
    model.setActiveCell(state.editingCell);
    state.editingCell = null;
    state.draftValue = '';
    nudgeSelection(rowDelta, colDelta);
    persist();
    render();
  }

  function cancelEdit() {
    state.editingCell = null;
    state.draftValue = '';
    render();
  }

  function nudgeSelection(rowDelta, colDelta) {
    var match = /^([A-Z]+)([1-9][0-9]*)$/.exec(model.activeCell);
    var col = window.SpreadsheetAddressing.columnLabelToIndex(match[1]);
    var row = Number(match[2]) - 1;
    var nextRow = clamp(row + rowDelta, 0, window.SpreadsheetAddressing.ROW_COUNT - 1);
    var nextCol = clamp(col + colDelta, 0, window.SpreadsheetAddressing.COLUMN_COUNT - 1);
    model.setActiveCell(window.SpreadsheetAddressing.indexToColumnLabel(nextCol) + String(nextRow + 1));
    persist();
    render();
    scrollActiveCellIntoView();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function render() {
    nameBox.textContent = model.activeCell;
    formulaInput.value = state.editingCell ? state.draftValue : model.getCellRaw(model.activeCell);
    var cells = grid.querySelectorAll('td[data-cell]');
    for (var i = 0; i < cells.length; i += 1) {
      var cell = cells[i];
      var address = cell.dataset.cell;
      cell.className = address === model.activeCell ? 'is-active' : '';
      cell.textContent = '';

      if (state.editingCell === address) {
        var input = document.createElement('input');
        input.className = 'cell-editor';
        input.value = state.draftValue;
        input.addEventListener('input', function (event) {
          state.draftValue = event.target.value;
          formulaInput.value = state.draftValue;
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelEdit();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            commitEdit(1, 0);
            return;
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            commitEdit(0, 1);
          }
        });
        cell.appendChild(input);
      } else {
        cell.textContent = model.getCellDisplay(address);
        cell.title = model.getCellRaw(address);
        cell.classList.toggle('is-number', /^-?\d+(?:\.\d+)?$/.test(cell.textContent));
        cell.classList.toggle('is-error', /^#/.test(cell.textContent));
      }
    }
  }

  function scrollActiveCellIntoView() {
    var active = grid.querySelector('td[data-cell="' + model.activeCell + '"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
})();
