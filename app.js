(function () {
  var core = window.SpreadsheetCore;
  var rowCount = 100;
  var columnCount = 26;
  var gridElement = document.getElementById('sheet-grid');
  var formulaInput = document.getElementById('formula-input');
  var namespace = core.resolveStorageNamespace(window);
  var storageKey = namespace + ':sheet-state';
  var state = loadState();
  var activeEditor = null;

  renderGrid();
  renderSelection();
  bindEvents();

  function defaultState() {
    return {
      selected: { row: 0, column: 0 },
      cells: {},
    };
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(storageKey);
      if (!saved) {
        return defaultState();
      }

      var parsed = JSON.parse(saved);
      if (!parsed || !parsed.selected || !parsed.cells) {
        return defaultState();
      }

      return parsed;
    } catch (error) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function renderGrid() {
    var fragment = document.createDocumentFragment();
    fragment.appendChild(makeCell('div', 'corner-cell'));

    for (var columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      var header = makeCell('div', 'col-header');
      header.textContent = core.columnLabelFromIndex(columnIndex);
      fragment.appendChild(header);
    }

    for (var rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      var rowHeader = makeCell('div', 'row-header');
      rowHeader.textContent = String(rowIndex + 1);
      fragment.appendChild(rowHeader);

      for (var dataColumnIndex = 0; dataColumnIndex < columnCount; dataColumnIndex += 1) {
        var cell = makeCell('button', 'grid-cell');
        var cellId = core.cellIdFromPosition(rowIndex, dataColumnIndex);
        cell.type = 'button';
        cell.dataset.cellId = cellId;
        cell.dataset.row = String(rowIndex);
        cell.dataset.column = String(dataColumnIndex);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', cellId);
        fragment.appendChild(cell);
      }
    }

    gridElement.innerHTML = '';
    gridElement.appendChild(fragment);
  }

  function bindEvents() {
    gridElement.addEventListener('click', handleGridClick);
    gridElement.addEventListener('dblclick', handleGridDoubleClick);
    document.addEventListener('keydown', handleDocumentKeydown);
    formulaInput.addEventListener('focus', syncFormulaBar);
    formulaInput.addEventListener('input', handleFormulaInput);
    formulaInput.addEventListener('keydown', handleFormulaKeydown);
  }

  function handleGridClick(event) {
    var cell = event.target.closest('.grid-cell');
    if (!cell) {
      return;
    }

    selectCell(Number(cell.dataset.row), Number(cell.dataset.column));
  }

  function handleGridDoubleClick(event) {
    var cell = event.target.closest('.grid-cell');
    if (!cell) {
      return;
    }

    selectCell(Number(cell.dataset.row), Number(cell.dataset.column));
    startEditing();
  }

  function handleDocumentKeydown(event) {
    if (activeEditor) {
      return;
    }

    if (event.target === formulaInput) {
      return;
    }

    var handled = true;
    if (event.key === 'ArrowUp') {
      moveSelection(-1, 0);
    } else if (event.key === 'ArrowDown') {
      moveSelection(1, 0);
    } else if (event.key === 'ArrowLeft') {
      moveSelection(0, -1);
    } else if (event.key === 'ArrowRight') {
      moveSelection(0, 1);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      startEditing();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      startEditing(event.key, true);
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  }

  function handleFormulaInput() {
    var cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    setRawValue(cellId, formulaInput.value);
    updateCellDisplay(cellId);
    saveState();
  }

  function handleFormulaKeydown(event) {
    if (event.key === 'Enter') {
      moveSelection(1, 0);
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      syncFormulaBar();
      event.preventDefault();
    }
  }

  function moveSelection(rowDelta, columnDelta) {
    var nextRow = clamp(state.selected.row + rowDelta, 0, rowCount - 1);
    var nextColumn = clamp(state.selected.column + columnDelta, 0, columnCount - 1);
    selectCell(nextRow, nextColumn);
  }

  function selectCell(rowIndex, columnIndex) {
    state.selected = { row: rowIndex, column: columnIndex };
    renderSelection();
    saveState();
  }

  function renderSelection() {
    var previous = gridElement.querySelector('.grid-cell.is-selected');
    if (previous) {
      previous.classList.remove('is-selected');
    }

    var cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    var current = gridElement.querySelector('[data-cell-id="' + cellId + '"]');
    if (current) {
      current.classList.add('is-selected');
      current.focus();
    }

    syncFormulaBar();
    refreshGridValues();
  }

  function refreshGridValues() {
    var cellElements = gridElement.querySelectorAll('.grid-cell');
    for (var index = 0; index < cellElements.length; index += 1) {
      updateCellDisplay(cellElements[index].dataset.cellId);
    }
  }

  function updateCellDisplay(cellId) {
    var cellElement = gridElement.querySelector('[data-cell-id="' + cellId + '"]');
    if (!cellElement || cellElement === activeEditor) {
      return;
    }

    cellElement.classList.remove('is-editing');
    cellElement.textContent = getDisplayValue(cellId);
  }

  function getDisplayValue(cellId) {
    var raw = state.cells[cellId] || '';
    if (!raw) {
      return '';
    }

    return raw;
  }

  function syncFormulaBar() {
    var cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    formulaInput.value = state.cells[cellId] || '';
  }

  function startEditing(seedValue, replaceContents) {
    var cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    var cellElement = gridElement.querySelector('[data-cell-id="' + cellId + '"]');
    if (!cellElement || activeEditor) {
      return;
    }

    var originalValue = state.cells[cellId] || '';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = replaceContents ? (seedValue || '') : originalValue;
    cellElement.classList.add('is-editing');
    cellElement.textContent = '';
    cellElement.appendChild(input);
    activeEditor = cellElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('input', function () {
      formulaInput.value = input.value;
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        commitEditor(input.value);
        moveSelection(1, 0);
        event.preventDefault();
        return;
      }

      if (event.key === 'Tab') {
        commitEditor(input.value);
        moveSelection(0, 1);
        event.preventDefault();
        return;
      }

      if (event.key === 'Escape') {
        closeEditor(originalValue);
        event.preventDefault();
      }
    });

    input.addEventListener('blur', function () {
      if (activeEditor) {
        commitEditor(input.value);
      }
    });
  }

  function commitEditor(value) {
    if (!activeEditor) {
      return;
    }

    var cellId = activeEditor.dataset.cellId;
    setRawValue(cellId, value);
    closeEditor(value);
    saveState();
  }

  function closeEditor(value) {
    if (!activeEditor) {
      return;
    }

    var cellId = activeEditor.dataset.cellId;
    activeEditor.classList.remove('is-editing');
    activeEditor.innerHTML = '';
    activeEditor.textContent = value;
    activeEditor = null;
    updateCellDisplay(cellId);
    syncFormulaBar();
  }

  function setRawValue(cellId, value) {
    if (value) {
      state.cells[cellId] = value;
      return;
    }

    delete state.cells[cellId];
  }

  function makeCell(tagName, className) {
    var element = document.createElement(tagName);
    element.className = className;
    return element;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}());
