(function () {
  var COLUMN_COUNT = 26;
  var ROW_COUNT = 100;

  function detectNamespace() {
    if (window.AMAZON_RUN_NAMESPACE) {
      return window.AMAZON_RUN_NAMESPACE;
    }
    if (window.__BENCHMARK_RUN_NAMESPACE__) {
      return window.__BENCHMARK_RUN_NAMESPACE__;
    }
    return 'northstar-sheet:' + window.location.pathname;
  }

  var STORAGE_KEY = detectNamespace() + ':sheet-state';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function cellId(row, column) {
    return window.Spreadsheet.indexToColumn(column) + String(row + 1);
  }

  function loadState() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return {
          cells: {},
          selected: { row: 0, column: 0 }
        };
      }

      var parsed = JSON.parse(saved);
      return {
        cells: parsed.cells || {},
        selected: parsed.selected || { row: 0, column: 0 }
      };
    } catch (error) {
      return {
        cells: {},
        selected: { row: 0, column: 0 }
      };
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createSpreadsheet(root, formulaInput, cellNameInput) {
    var state = loadState();
    var model = window.Spreadsheet.SpreadsheetModel.fromJSON({ cells: state.cells });
    var editingCell = null;

    function saveState() {
      state.cells = model.toJSON().cells;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function getRaw(row, column) {
      return model.getRaw(cellId(row, column));
    }

    function getDisplay(row, column) {
      return model.getDisplayValue(cellId(row, column));
    }

    function syncFormulaBar() {
      var currentId = cellId(state.selected.row, state.selected.column);
      cellNameInput.value = currentId;
      formulaInput.value = editingCell ? editingCell.draft : model.getRaw(currentId);
    }

    function moveSelection(nextRow, nextColumn) {
      state.selected = {
        row: clamp(nextRow, 0, ROW_COUNT - 1),
        column: clamp(nextColumn, 0, COLUMN_COUNT - 1)
      };
      saveState();
      render();
    }

    function commitToCell(row, column, raw) {
      model.setCellRaw(cellId(row, column), raw);
      state.cells = model.toJSON().cells;
      saveState();
    }

    function commitEdit(raw, move) {
      if (!editingCell) {
        return;
      }

      commitToCell(editingCell.row, editingCell.column, raw);
      editingCell = null;
      if (move === 'down') {
        moveSelection(state.selected.row + 1, state.selected.column);
        return;
      }
      if (move === 'right') {
        moveSelection(state.selected.row, state.selected.column + 1);
        return;
      }
      render();
    }

    function cancelEdit() {
      editingCell = null;
      render();
    }

    function startEditing(row, column, initialValue, selectAll) {
      state.selected = { row: row, column: column };
      editingCell = {
        row: row,
        column: column,
        draft: initialValue == null ? getRaw(row, column) : initialValue
      };
      render();
      var editor = root.querySelector('.cell-editor');
      if (editor) {
        editor.focus();
        if (selectAll) {
          editor.select();
        } else {
          var end = editor.value.length;
          editor.setSelectionRange(end, end);
        }
      }
    }

    function handleGridKeydown(event) {
      if (editingCell) {
        return;
      }

      var row = state.selected.row;
      var column = state.selected.column;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(row - 1, column);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(row + 1, column);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelection(row, column - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(row, column + 1);
      } else if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        startEditing(row, column, getRaw(row, column), false);
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        startEditing(row, column, event.key, true);
      }
    }

    formulaInput.addEventListener('focus', function () {
      editingCell = {
        row: state.selected.row,
        column: state.selected.column,
        draft: getRaw(state.selected.row, state.selected.column)
      };
    });

    formulaInput.addEventListener('input', function () {
      if (!editingCell) {
        editingCell = {
          row: state.selected.row,
          column: state.selected.column,
          draft: getRaw(state.selected.row, state.selected.column)
        };
      }
      editingCell.draft = formulaInput.value;
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitToCell(state.selected.row, state.selected.column, formulaInput.value);
        editingCell = null;
        moveSelection(state.selected.row + 1, state.selected.column);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        editingCell = null;
        syncFormulaBar();
        root.focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitToCell(state.selected.row, state.selected.column, formulaInput.value);
        editingCell = null;
        moveSelection(state.selected.row, state.selected.column + 1);
      }
    });

    root.addEventListener('keydown', handleGridKeydown);

    function render() {
      var html = ['<div class="sheet-grid">', '<div class="corner" aria-hidden="true"></div>'];

      for (var column = 0; column < COLUMN_COUNT; column += 1) {
        html.push('<div class="column-header">' + window.Spreadsheet.indexToColumn(column) + '</div>');
      }

      for (var row = 0; row < ROW_COUNT; row += 1) {
        html.push('<div class="row-header">' + (row + 1) + '</div>');
        for (column = 0; column < COLUMN_COUNT; column += 1) {
          var raw = getRaw(row, column);
          var display = getDisplay(row, column);
          var isNumber = raw !== '' && raw[0] !== '=' && !Number.isNaN(Number(raw)) && raw.trim() !== '';
          var isActive = row === state.selected.row && column === state.selected.column;
          if (editingCell && editingCell.row === row && editingCell.column === column) {
            html.push(
              '<div class="cell active editing" data-row="' + row + '" data-column="' + column + '">' +
                '<input class="cell-editor" value="' + escapeHtml(editingCell.draft) + '" spellcheck="false">' +
              '</div>'
            );
          } else {
            var classes = ['cell', isNumber ? 'number' : 'text'];
            if (display.charAt(0) === '#') {
              classes.push('error');
            }
            if (isActive) {
              classes.push('active');
            }
            html.push(
              '<div class="' + classes.join(' ') + '" data-row="' + row + '" data-column="' + column + '" data-cell-id="' + cellId(row, column) + '">' +
                escapeHtml(display) +
              '</div>'
            );
          }
        }
      }

      html.push('</div>');
      root.innerHTML = html.join('');
      syncFormulaBar();

      root.querySelectorAll('.cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          moveSelection(Number(cell.dataset.row), Number(cell.dataset.column));
          root.focus();
        });
        cell.addEventListener('dblclick', function () {
          startEditing(Number(cell.dataset.row), Number(cell.dataset.column), getRaw(Number(cell.dataset.row), Number(cell.dataset.column)), false);
        });
      });

      var editor = root.querySelector('.cell-editor');
      if (editor) {
        editor.addEventListener('input', function () {
          editingCell.draft = editor.value;
          formulaInput.value = editor.value;
        });
        editor.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitEdit(editor.value, 'down');
          } else if (event.key === 'Tab') {
            event.preventDefault();
            commitEdit(editor.value, 'right');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEdit();
          }
        });
        editor.addEventListener('blur', function () {
          if (editingCell) {
            commitEdit(editor.value, null);
          }
        });
      }
    }

    render();
    root.tabIndex = 0;
    root.focus();

    return {
      getState: function () {
        return {
          cells: model.toJSON().cells,
          selected: { row: state.selected.row, column: state.selected.column }
        };
      },
      selectCell: moveSelection
    };
  }

  window.NorthstarSheetApp = {
    createSpreadsheet: createSpreadsheet,
    cellId: cellId
  };

  function boot() {
    var root = document.getElementById('sheet-root');
    var formulaInput = document.getElementById('formula-input');
    var cellNameInput = document.getElementById('cell-name');
    if (!root || !formulaInput || !cellNameInput) {
      return;
    }
    createSpreadsheet(root, formulaInput, cellNameInput);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
