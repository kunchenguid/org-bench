(function () {
  var SpreadsheetState = window.SpreadsheetState;
  var gridRoot = document.getElementById('grid-root');
  var formulaInput = document.getElementById('formula-input');
  var cellName = document.getElementById('cell-name');
  var pointerSelection = null;

  if (!SpreadsheetState || !gridRoot || !formulaInput || !cellName) {
    return;
  }

  var adapter = window.SpreadsheetShellAdapter || {
    getDisplayValue: function (context) {
      return context.raw;
    },
    onCellsChanged: function () {},
  };

  var state = SpreadsheetState.createInitialState();

  function getSelectionBounds() {
    return SpreadsheetState.getSelectionBounds(state);
  }

  function isSelected(cell) {
    return SpreadsheetState.isCellInSelection(state, cell);
  }

  function getRaw(cell) {
    return SpreadsheetState.getCellRawValue(state, cell);
  }

  function getDisplay(cell) {
    return adapter.getDisplayValue({
      raw: getRaw(cell),
      cell: cell,
      state: state,
    });
  }

  function syncFormulaBar() {
    var raw = state.mode === 'editing' && state.editing ? state.editing.draft : getRaw(state.activeCell);
    formulaInput.value = raw;
    cellName.textContent = SpreadsheetState.getCellKey(state.activeCell);
  }

  function focusEditorIfNeeded() {
    if (state.mode !== 'editing') {
      return;
    }
    var editor = gridRoot.querySelector('.cell-editor');
    if (editor) {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  function render() {
    var table = document.createElement('table');
    table.className = 'sheet';
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    var selection = getSelectionBounds();
    for (var col = 0; col < state.grid.columns; col += 1) {
      var header = document.createElement('th');
      header.className = 'col-header';
      if (col >= selection.minCol && col <= selection.maxCol) {
        header.classList.add('selected');
      }
      header.textContent = SpreadsheetState.getColumnLabel(col);
      headerRow.appendChild(header);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var row = 0; row < state.grid.rows; row += 1) {
      var tr = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      if (row >= selection.minRow && row <= selection.maxRow) {
        rowHeader.classList.add('selected');
      }
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (var innerCol = 0; innerCol < state.grid.columns; innerCol += 1) {
        var cell = { col: innerCol, row: row };
        var td = document.createElement('td');
        td.className = 'cell';
        td.tabIndex = -1;
        td.dataset.col = String(innerCol);
        td.dataset.row = String(row);
        if (isSelected(cell)) {
          td.classList.add('selected');
        }
        if (cell.col === state.activeCell.col && cell.row === state.activeCell.row) {
          td.classList.add('active');
        }

        var isEditingCell =
          state.mode === 'editing' &&
          state.editing &&
          state.editing.cell.col === cell.col &&
          state.editing.cell.row === cell.row;

        if (isEditingCell) {
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'cell-editor';
          input.value = state.editing.draft;
          input.spellcheck = false;
          td.appendChild(input);
        } else {
          var content = document.createElement('div');
          content.className = 'cell-content';
          content.textContent = getDisplay(cell);
          td.appendChild(content);
        }

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    gridRoot.replaceChildren(table);
    syncFormulaBar();
    focusEditorIfNeeded();
  }

  function setState(nextState) {
    state = nextState;
    render();
  }

  function commitCurrentEdit(delta) {
    var before = state.cells;
    setState(SpreadsheetState.commitEdit(state, delta));
    if (before !== state.cells) {
      adapter.onCellsChanged({ cells: state.cells, activeCell: state.activeCell, state: state });
    }
  }

  function getCellFromElement(element) {
    if (!element) {
      return null;
    }
    var target = element.closest('.cell');
    if (!target) {
      return null;
    }
    return {
      col: Number(target.dataset.col),
      row: Number(target.dataset.row),
    };
  }

  function selectSingleCell(cell) {
    setState(SpreadsheetState.beginRangeSelection(state, cell));
  }

  function extendSelection(cell) {
    setState(SpreadsheetState.extendSelectionTo(state, cell));
  }

  function moveSelection(delta, extend) {
    if (extend) {
      extendSelection({
        col: state.activeCell.col + delta.colDelta,
        row: state.activeCell.row + delta.rowDelta,
      });
      return;
    }
    setState(SpreadsheetState.moveActiveCell(state, delta));
  }

  gridRoot.addEventListener('mousedown', function (event) {
    var cell = getCellFromElement(event.target);
    if (!cell) {
      return;
    }

    if (state.mode === 'editing') {
      commitCurrentEdit({ colDelta: 0, rowDelta: 0 });
    }

    if (event.shiftKey) {
      extendSelection(cell);
    } else {
      selectSingleCell(cell);
      pointerSelection = true;
    }
    event.preventDefault();
  });

  gridRoot.addEventListener('mousemove', function (event) {
    if (!pointerSelection) {
      return;
    }
    var cell = getCellFromElement(event.target);
    if (cell) {
      extendSelection(cell);
    }
  });

  window.addEventListener('mouseup', function () {
    pointerSelection = null;
  });

  gridRoot.addEventListener('dblclick', function (event) {
    var cell = getCellFromElement(event.target);
    if (!cell) {
      return;
    }
    selectSingleCell(cell);
    setState(SpreadsheetState.beginEditing(state));
  });

  gridRoot.addEventListener('input', function (event) {
    if (!event.target.classList.contains('cell-editor')) {
      return;
    }
    setState(SpreadsheetState.applyEditDraft(state, event.target.value));
  });

  gridRoot.addEventListener('keydown', function (event) {
    if (!event.target.classList.contains('cell-editor')) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCurrentEdit({ colDelta: 0, rowDelta: 1 });
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitCurrentEdit({ colDelta: 1, rowDelta: 0 });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setState(SpreadsheetState.cancelEdit(state));
    }
  });

  formulaInput.addEventListener('focus', function () {
    if (state.mode !== 'editing') {
      setState(SpreadsheetState.beginEditing(state));
    }
  });

  formulaInput.addEventListener('input', function (event) {
    if (state.mode !== 'editing') {
      setState(SpreadsheetState.beginEditing(state));
    }
    setState(SpreadsheetState.applyEditDraft(state, event.target.value));
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCurrentEdit({ colDelta: 0, rowDelta: 1 });
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitCurrentEdit({ colDelta: 1, rowDelta: 0 });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setState(SpreadsheetState.cancelEdit(state));
    }
  });

  window.addEventListener('keydown', function (event) {
    if (event.defaultPrevented) {
      return;
    }
    if (event.target === formulaInput || event.target.classList.contains('cell-editor')) {
      return;
    }

    var key = event.key;
    if (key === 'ArrowUp') {
      event.preventDefault();
      moveSelection({ colDelta: 0, rowDelta: -1 }, event.shiftKey);
      return;
    }
    if (key === 'ArrowDown') {
      event.preventDefault();
      moveSelection({ colDelta: 0, rowDelta: 1 }, event.shiftKey);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection({ colDelta: -1, rowDelta: 0 }, event.shiftKey);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      moveSelection({ colDelta: 1, rowDelta: 0 }, event.shiftKey);
      return;
    }
    if (key === 'F2') {
      event.preventDefault();
      setState(SpreadsheetState.beginEditing(state));
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      setState(SpreadsheetState.beginEditing(state));
      return;
    }
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setState(SpreadsheetState.beginEditingWithValue(state, key));
    }
  });

  render();
})();
