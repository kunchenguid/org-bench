(function (globalScope) {
  'use strict';

  var TOTAL_ROWS = 100;
  var TOTAL_COLUMNS = 26;

  function createColumnLabels(count) {
    return Array.from({ length: count }, function (_, index) {
      return String.fromCharCode(65 + index);
    });
  }

  function createGridRows(rowCount, columnCount) {
    var labels = createColumnLabels(columnCount);
    return Array.from({ length: rowCount }, function (_, rowIndex) {
      return {
        index: rowIndex + 1,
        cells: labels.map(function (label, columnIndex) {
          return {
            address: label + String(rowIndex + 1),
            row: rowIndex,
            column: columnIndex,
          };
        }),
      };
    });
  }

  function clampCell(cell, rowCount, columnCount) {
    return {
      row: Math.min(Math.max(cell.row, 0), rowCount - 1),
      column: Math.min(Math.max(cell.column, 0), columnCount - 1),
    };
  }

  function selectionFromEndpoints(anchor, focus) {
    return {
      anchor: { row: anchor.row, column: anchor.column },
      focus: { row: focus.row, column: focus.column },
      minRow: Math.min(anchor.row, focus.row),
      maxRow: Math.max(anchor.row, focus.row),
      minColumn: Math.min(anchor.column, focus.column),
      maxColumn: Math.max(anchor.column, focus.column),
      active: { row: focus.row, column: focus.column },
    };
  }

  function createInitialSelection() {
    return selectionFromEndpoints({ row: 0, column: 0 }, { row: 0, column: 0 });
  }

  function addressFromCell(cell) {
    return String.fromCharCode(65 + cell.column) + String(cell.row + 1);
  }

  function selectCell(selection, focus, keepAnchor) {
    var anchor = keepAnchor && selection ? selection.anchor : focus;
    return selectionFromEndpoints(anchor, focus);
  }

  function createInitialState(options) {
    options = options || {};
    return {
      selection: options.selection || createInitialSelection(),
      cells: Object.assign({}, options.cells),
      editing: options.editing || null,
    };
  }

  function cloneEditing(editing) {
    if (!editing) {
      return null;
    }

    return {
      address: editing.address,
      draft: editing.draft,
      original: editing.original,
      source: editing.source,
    };
  }

  function cloneState(state) {
    return {
      selection: selectionFromEndpoints(state.selection.anchor, state.selection.focus),
      cells: Object.assign({}, state.cells),
      editing: cloneEditing(state.editing),
    };
  }

  function readCellValue(state, cell) {
    return state.cells[addressFromCell(cell)] || '';
  }

  function writeCellValue(state, cell, value) {
    var nextState = cloneState(state);
    var address = addressFromCell(cell);
    if (value === '') {
      delete nextState.cells[address];
    } else {
      nextState.cells[address] = value;
    }
    return nextState;
  }

  function beginCellEdit(state, replacementText, preserveExisting, source) {
    var nextState = cloneState(state);
    var active = nextState.selection.active;
    var original = readCellValue(nextState, active);
    nextState.editing = {
      address: addressFromCell(active),
      draft: preserveExisting ? original : replacementText || '',
      original: original,
      source: source || 'cell',
    };
    return nextState;
  }

  function applyEditDraft(state, draft) {
    if (!state.editing) {
      return state;
    }

    var nextState = cloneState(state);
    nextState.editing.draft = draft;
    return nextState;
  }

  function moveActiveCell(state, delta, keepAnchor) {
    if (state.editing) {
      return state;
    }

    var active = state.selection.active;
    var nextFocus = clampCell(
      {
        row: active.row + delta.row,
        column: active.column + delta.column,
      },
      TOTAL_ROWS,
      TOTAL_COLUMNS
    );

    var nextState = cloneState(state);
    nextState.selection = selectCell(nextState.selection, nextFocus, keepAnchor);
    return nextState;
  }

  function commitActiveEdit(state, direction) {
    direction = direction || 'stay';
    if (!state.editing) {
      return state;
    }

    var active = state.selection.active;
    var nextState = writeCellValue(state, active, state.editing.draft);
    nextState.editing = null;

    if (direction === 'down') {
      return moveActiveCell(nextState, { row: 1, column: 0 }, false);
    }
    if (direction === 'up') {
      return moveActiveCell(nextState, { row: -1, column: 0 }, false);
    }
    if (direction === 'left') {
      return moveActiveCell(nextState, { row: 0, column: -1 }, false);
    }
    if (direction === 'right') {
      return moveActiveCell(nextState, { row: 0, column: 1 }, false);
    }

    return nextState;
  }

  function cancelActiveEdit(state) {
    if (!state.editing) {
      return state;
    }

    var nextState = cloneState(state);
    nextState.editing = null;
    return nextState;
  }

  function buildGrid(tableElement, rowCount, columnCount) {
    var fragment = document.createDocumentFragment();
    var headerRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner-cell';
    corner.scope = 'col';
    headerRow.appendChild(corner);

    createColumnLabels(columnCount).forEach(function (label, columnIndex) {
      var th = document.createElement('th');
      th.className = 'column-header';
      th.scope = 'col';
      th.dataset.column = String(columnIndex);
      th.textContent = label;
      headerRow.appendChild(th);
    });

    fragment.appendChild(headerRow);

    createGridRows(rowCount, columnCount).forEach(function (rowData, rowIndex) {
      var row = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.scope = 'row';
      rowHeader.dataset.row = String(rowIndex);
      rowHeader.textContent = String(rowData.index);
      row.appendChild(rowHeader);

      rowData.cells.forEach(function (cellData) {
        var cell = document.createElement('td');
        cell.dataset.row = String(cellData.row);
        cell.dataset.column = String(cellData.column);
        cell.dataset.address = cellData.address;
        cell.setAttribute('aria-label', cellData.address);
        row.appendChild(cell);
      });

      fragment.appendChild(row);
    });

    tableElement.replaceChildren(fragment);
  }

  function applySelectionState(root, selection) {
    root.querySelectorAll('.cell-active, .cell-range, .header-active, .header-range').forEach(function (node) {
      node.classList.remove('cell-active', 'cell-range', 'header-active', 'header-range');
    });

    for (var row = selection.minRow; row <= selection.maxRow; row += 1) {
      var rowHeader = root.querySelector('.row-header[data-row="' + row + '"]');
      if (rowHeader) {
        rowHeader.classList.add(selection.minRow === selection.maxRow ? 'header-active' : 'header-range');
      }

      for (var column = selection.minColumn; column <= selection.maxColumn; column += 1) {
        var cell = root.querySelector('td[data-row="' + row + '"][data-column="' + column + '"]');
        if (cell) {
          cell.classList.add('cell-range');
        }
      }
    }

    for (var headerColumn = selection.minColumn; headerColumn <= selection.maxColumn; headerColumn += 1) {
      var columnHeader = root.querySelector('.column-header[data-column="' + headerColumn + '"]');
      if (columnHeader) {
        columnHeader.classList.add(selection.minColumn === selection.maxColumn ? 'header-active' : 'header-range');
      }
    }

    var activeCell = root.querySelector('td[data-row="' + selection.active.row + '"][data-column="' + selection.active.column + '"]');
    if (activeCell) {
      activeCell.classList.remove('cell-range');
      activeCell.classList.add('cell-active');
      activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    var nameBox = document.getElementById('name-box');
    if (nameBox) {
      nameBox.textContent = addressFromCell(selection.active);
    }
  }

  function readCellFromDataset(target) {
    return {
      row: Number(target.dataset.row),
      column: Number(target.dataset.column),
    };
  }

  function renderGridValues(table, state, cellEditor) {
    table.querySelectorAll('td[data-address]').forEach(function (cell) {
      var address = cell.dataset.address;
      if (state.editing && state.editing.source === 'cell' && state.editing.address === address) {
        cell.textContent = '';
        cell.classList.add('cell-editing');
        if (cellEditor.parentNode !== cell) {
          cell.appendChild(cellEditor);
        }
        cellEditor.value = state.editing.draft;
      } else {
        cell.classList.remove('cell-editing');
        if (cellEditor.parentNode === cell) {
          cell.removeChild(cellEditor);
        }
        cell.textContent = state.cells[address] || '';
      }
    });
  }

  function focusEditor(input) {
    if (!input) {
      return;
    }

    input.focus();
    var length = input.value.length;
    input.setSelectionRange(length, length);
  }

  function initSpreadsheetShell() {
    if (typeof document === 'undefined') {
      return;
    }

    var table = document.getElementById('sheet-grid');
    var formulaInput = document.getElementById('formula-input');
    if (!table || !formulaInput) {
      return;
    }

    buildGrid(table, TOTAL_ROWS, TOTAL_COLUMNS);
    formulaInput.readOnly = false;

    var cellEditor = document.createElement('input');
    cellEditor.type = 'text';
    cellEditor.className = 'cell-editor';
    cellEditor.spellcheck = false;
    cellEditor.autocomplete = 'off';

    var state = createInitialState();

    function render() {
      applySelectionState(table, state.selection);
      renderGridValues(table, state, cellEditor);

      if (state.editing && state.editing.source === 'formula') {
        formulaInput.value = state.editing.draft;
      } else {
        formulaInput.value = readCellValue(state, state.selection.active);
      }
    }

    function setState(nextState) {
      state = nextState;
      render();
    }

    function startEditing(source, replacementText, preserveExisting) {
      setState(beginCellEdit(state, replacementText, preserveExisting, source));
      if (source === 'cell') {
        focusEditor(cellEditor);
      } else {
        focusEditor(formulaInput);
      }
    }

    render();

    table.addEventListener('mousedown', function (event) {
      var cell = event.target.closest('td');
      if (!cell || state.editing) {
        return;
      }

      event.preventDefault();
      setState(createInitialState({ cells: state.cells, selection: selectCell(state.selection, readCellFromDataset(cell)) }));
    });

    table.addEventListener('dblclick', function (event) {
      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      setState(createInitialState({ cells: state.cells, selection: selectCell(state.selection, readCellFromDataset(cell)) }));
      startEditing('cell', null, true);
    });

    table.addEventListener('click', function (event) {
      var cell = event.target.closest('td');
      if (!cell || state.editing) {
        return;
      }

      setState(createInitialState({ cells: state.cells, selection: selectCell(state.selection, readCellFromDataset(cell)) }));
    });

    formulaInput.addEventListener('focus', function () {
      if (!state.editing) {
        startEditing('formula', null, true);
      }
    });

    formulaInput.addEventListener('input', function (event) {
      if (!state.editing) {
        setState(beginCellEdit(state, event.target.value, false, 'formula'));
        return;
      }

      setState(applyEditDraft(state, event.target.value));
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        setState(commitActiveEdit(state, 'down'));
        formulaInput.blur();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        setState(commitActiveEdit(state, event.shiftKey ? 'left' : 'right'));
        formulaInput.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setState(cancelActiveEdit(state));
        formulaInput.blur();
      }
    });

    cellEditor.addEventListener('input', function (event) {
      setState(applyEditDraft(state, event.target.value));
    });

    cellEditor.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        setState(commitActiveEdit(state, 'down'));
      } else if (event.key === 'Tab') {
        event.preventDefault();
        setState(commitActiveEdit(state, event.shiftKey ? 'left' : 'right'));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setState(cancelActiveEdit(state));
      }
    });

    document.addEventListener('keydown', function (event) {
      var activeElement = document.activeElement;
      var isTypingIntoEditor = activeElement === formulaInput || activeElement === cellEditor;
      if (isTypingIntoEditor) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        startEditing('cell', null, true);
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        startEditing('cell', null, true);
        return;
      }

      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        startEditing('cell', event.key, false);
        return;
      }

      var delta = null;
      if (event.key === 'ArrowUp') {
        delta = { row: -1, column: 0 };
      } else if (event.key === 'ArrowDown') {
        delta = { row: 1, column: 0 };
      } else if (event.key === 'ArrowLeft') {
        delta = { row: 0, column: -1 };
      } else if (event.key === 'ArrowRight') {
        delta = { row: 0, column: 1 };
      }

      if (!delta) {
        return;
      }

      event.preventDefault();
      setState(moveActiveCell(state, delta, event.shiftKey));
    });
  }

  var api = {
    createColumnLabels: createColumnLabels,
    createGridRows: createGridRows,
    clampCell: clampCell,
    createInitialSelection: createInitialSelection,
    selectionFromEndpoints: selectionFromEndpoints,
    createInitialState: createInitialState,
    beginCellEdit: beginCellEdit,
    applyEditDraft: applyEditDraft,
    commitActiveEdit: commitActiveEdit,
    cancelActiveEdit: cancelActiveEdit,
    moveActiveCell: moveActiveCell,
    selectCell: selectCell,
    initSpreadsheetShell: initSpreadsheetShell,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.SpreadsheetShell = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSpreadsheetShell);
    } else {
      initSpreadsheetShell();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
