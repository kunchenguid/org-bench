(function () {
  var core = window.SpreadsheetCore;
  var ROWS = 100;
  var COLS = 26;
  var sheetElement = document.getElementById('sheet');
  var formulaInput = document.getElementById('formula-input');
  var selectedCellLabel = document.getElementById('selected-cell');
  var storageKey = resolveStorageKey();
  var state = loadState();

  renderGrid();
  syncFormulaBar();
  bindEvents();

  function resolveStorageKey() {
    var namespace = window.__RUN_STORAGE_NAMESPACE__ || window.__BENCHMARK_STORAGE_NAMESPACE__ || window.BENCHMARK_STORAGE_NAMESPACE;
    if (!namespace) {
      try {
        namespace = new URLSearchParams(window.location.search).get('storageNamespace');
      } catch (error) {
        namespace = null;
      }
    }
    return String(namespace || 'local') + ':spreadsheet-state';
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          sheet: parsed.sheet || core.createEmptySheet(),
          selected: parsed.selected || 'A1',
          editMode: false,
          editingValue: '',
        };
      }
    } catch (error) {
      // Ignore corrupt persisted state and start clean.
    }
    return {
      sheet: core.createEmptySheet(),
      selected: 'A1',
      editMode: false,
      editingValue: '',
    };
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify({ sheet: state.sheet, selected: state.selected }));
  }

  function renderGrid() {
    var cache = {};
    var html = '<thead><tr><th class="corner"></th>';
    for (var col = 0; col < COLS; col += 1) {
      html += '<th>' + core.indexToColumnLabel(col) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (var row = 0; row < ROWS; row += 1) {
      html += '<tr><th class="row-header">' + (row + 1) + '</th>';
      for (var innerCol = 0; innerCol < COLS; innerCol += 1) {
        var cellId = core.indexToColumnLabel(innerCol) + String(row + 1);
        var result = core.evaluateCell(state.sheet, cellId, cache);
        var className = 'cell';
        if (cellId === state.selected) className += ' active';
        if (/^#/.test(result.display)) className += ' error';
        if (result.display !== '' && !Number.isNaN(Number(result.display)) && !/^0\d/.test(result.display)) className += ' numeric';
        html += '<td class="' + className + '" data-cell-id="' + cellId + '">';
        if (state.editMode && cellId === state.selected) {
          html += '<input class="cell-editor" data-editor="cell" value="' + escapeHtml(state.editingValue) + '" spellcheck="false">';
        } else {
          html += escapeHtml(result.display);
        }
        html += '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
    sheetElement.innerHTML = html;
    selectedCellLabel.textContent = state.selected;
    if (state.editMode) {
      var editor = sheetElement.querySelector('[data-editor="cell"]');
      if (editor) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncFormulaBar() {
    formulaInput.value = state.editMode ? state.editingValue : getRawSelectedValue();
  }

  function getRawSelectedValue() {
    return Object.prototype.hasOwnProperty.call(state.sheet, state.selected) ? state.sheet[state.selected] : '';
  }

  function bindEvents() {
    sheetElement.addEventListener('click', function (event) {
      var cell = event.target.closest('[data-cell-id]');
      if (!cell) return;
      selectCell(cell.getAttribute('data-cell-id'));
    });

    sheetElement.addEventListener('dblclick', function (event) {
      var cell = event.target.closest('[data-cell-id]');
      if (!cell) return;
      selectCell(cell.getAttribute('data-cell-id'));
      startEdit(getRawSelectedValue());
    });

    sheetElement.addEventListener('input', function (event) {
      if (event.target.matches('[data-editor="cell"]')) {
        state.editingValue = event.target.value;
        formulaInput.value = state.editingValue;
      }
    });

    sheetElement.addEventListener('keydown', function (event) {
      if (!event.target.matches('[data-editor="cell"]')) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(1, 0);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(0, 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    formulaInput.addEventListener('focus', function () {
      startEdit(getRawSelectedValue(), false);
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    });

    formulaInput.addEventListener('input', function () {
      if (!state.editMode) {
        state.editMode = true;
      }
      state.editingValue = formulaInput.value;
      renderGrid();
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(1, 0);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.target === formulaInput || event.target.matches('[data-editor="cell"]')) {
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        startEdit(getRawSelectedValue());
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        startEdit(getRawSelectedValue());
        return;
      }
      if (event.key === 'ArrowUp') return moveSelection(-1, 0, event);
      if (event.key === 'ArrowDown') return moveSelection(1, 0, event);
      if (event.key === 'ArrowLeft') return moveSelection(0, -1, event);
      if (event.key === 'ArrowRight') return moveSelection(0, 1, event);
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearCell(state.selected);
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        startEdit(event.key);
      }
    });
  }

  function selectCell(cellId) {
    state.selected = cellId;
    state.editMode = false;
    state.editingValue = '';
    persist();
    renderGrid();
    syncFormulaBar();
  }

  function startEdit(initialValue, focusCell) {
    state.editMode = true;
    state.editingValue = initialValue;
    renderGrid();
    syncFormulaBar();
    if (focusCell !== false) {
      var editor = sheetElement.querySelector('[data-editor="cell"]');
      if (editor) {
        editor.focus();
      }
    }
  }

  function commitEdit(rowOffset, colOffset) {
    if (state.editingValue) {
      state.sheet[state.selected] = state.editingValue;
    } else {
      delete state.sheet[state.selected];
    }
    state.editMode = false;
    state.editingValue = '';
    persist();
    renderGrid();
    syncFormulaBar();
    if (rowOffset || colOffset) {
      shiftSelection(rowOffset, colOffset);
    }
  }

  function cancelEdit() {
    state.editMode = false;
    state.editingValue = '';
    renderGrid();
    syncFormulaBar();
  }

  function clearCell(cellId) {
    delete state.sheet[cellId];
    persist();
    renderGrid();
    syncFormulaBar();
  }

  function moveSelection(rowDelta, colDelta, event) {
    event.preventDefault();
    shiftSelection(rowDelta, colDelta);
  }

  function shiftSelection(rowDelta, colDelta) {
    var ref = core.parseCellRef(state.selected);
    var nextRow = clamp(ref.row + rowDelta, 0, ROWS - 1);
    var nextCol = clamp(ref.col + colDelta, 0, COLS - 1);
    selectCell(core.indexToColumnLabel(nextCol) + String(nextRow + 1));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
