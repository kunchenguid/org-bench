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

  function selectionToRuntimeSelection(selection) {
    return {
      row: selection.active.row + 1,
      col: selection.active.column + 1,
    };
  }

  function selectionFromRuntimeSelection(selection, rowCount, columnCount) {
    var row = selection && Number.isInteger(selection.row) ? selection.row - 1 : 0;
    var col = selection && Number.isInteger(selection.col) ? selection.col - 1 : 0;
    var clamped = clampCell({ row: row, column: col }, rowCount, columnCount);
    return selectionFromEndpoints(clamped, clamped);
  }

  function handleHistoryHotkey(event, runtime) {
    if (!runtime || (!event.metaKey && !event.ctrlKey) || event.altKey) {
      return null;
    }

    var key = String(event.key || '').toLowerCase();
    if (key === 'z' && event.shiftKey) {
      event.preventDefault();
      return runtime.redo();
    }

    if (key === 'z') {
      event.preventDefault();
      return runtime.undo();
    }

    if (key === 'y') {
      event.preventDefault();
      return runtime.redo();
    }

    return null;
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

  function getCellContent(state, row, column) {
    return readCellValue(state, { row: row, column: column });
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

  function beginEdit(state, mode) {
    return beginCellEdit(state, null, true, mode);
  }

  function applyEditDraft(state, draft) {
    if (!state.editing) {
      return state;
    }

    var nextState = cloneState(state);
    nextState.editing.draft = draft;
    return nextState;
  }

  function inputText(state, text) {
    if (!state.editing) {
      return beginCellEdit(state, text, false, 'cell');
    }

    return applyEditDraft(state, text);
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

  function moveSelection(state, direction) {
    var delta = {
      up: { row: -1, column: 0 },
      down: { row: 1, column: 0 },
      left: { row: 0, column: -1 },
      right: { row: 0, column: 1 },
      stay: { row: 0, column: 0 },
    }[direction] || { row: 0, column: 0 };

    return moveActiveCell(state, delta, false);
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

  function commitEdit(state, direction) {
    return commitActiveEdit(state, direction);
  }

  function cancelActiveEdit(state) {
    if (!state.editing) {
      return state;
    }

    var nextState = cloneState(state);
    nextState.editing = null;
    return nextState;
  }

  function cancelEdit(state) {
    return cancelActiveEdit(state);
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
        cell.style.padding = '0';
        if (cellEditor.parentNode !== cell) {
          cell.appendChild(cellEditor);
        }
        cellEditor.value = state.editing.draft;
      } else {
        cell.style.removeProperty('padding');
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
    if (!table) {
      return;
    }

    buildGrid(table, TOTAL_ROWS, TOTAL_COLUMNS);

    var persistence = null;
    if (globalScope.SpreadsheetPersistence && typeof globalScope.localStorage !== 'undefined') {
      persistence = globalScope.SpreadsheetPersistence.createPersistence({
        storage: globalScope.localStorage,
        namespace: globalScope.__APPLE_RUN_STORAGE_NAMESPACE__ || 'sheet',
        defaultState: {
          cells: {},
          selection: { row: 1, col: 1 },
        },
      });
    }

    var history = globalScope.SpreadsheetHistory
      ? globalScope.SpreadsheetHistory.createHistory({
          initialState: persistence ? persistence.load() : undefined,
        })
      : null;

    var runtime = globalScope.SpreadsheetRuntime
      ? globalScope.SpreadsheetRuntime.createRuntime({
          history: history,
          persistence: persistence,
          structure: globalScope.StructuralEdit,
        })
      : null;

    if (runtime) {
      globalScope.SpreadsheetApp = Object.assign(globalScope.SpreadsheetApp || {}, {
        runtime: runtime,
      });
      runtime.start();
    }

    var cellEditor = document.createElement('input');
    cellEditor.type = 'text';
    cellEditor.spellcheck = false;
    cellEditor.autocomplete = 'off';
    cellEditor.style.width = '100%';
    cellEditor.style.height = '100%';
    cellEditor.style.border = '0';
    cellEditor.style.padding = '0 10px';
    cellEditor.style.font = 'inherit';
    cellEditor.style.color = 'inherit';
    cellEditor.style.background = 'rgba(255, 255, 255, 0.98)';
    cellEditor.style.outline = '0';

    var runtimeState = runtime ? runtime.getState() : null;
    var state = createInitialState({
      selection: runtimeState
        ? selectionFromRuntimeSelection(runtimeState.selection, TOTAL_ROWS, TOTAL_COLUMNS)
        : createInitialSelection(),
      cells: runtimeState ? runtimeState.cells : {},
    });
    state.dragAnchor = null;

    function syncFormulaBar() {
      if (!formulaInput) {
        return;
      }

      if (state.editing && state.editing.source === 'formula') {
        formulaInput.value = state.editing.draft;
        return;
      }

      formulaInput.value = readCellValue(state, state.selection.active);
    }

    function render() {
      applySelectionState(table, state.selection);
      renderGridValues(table, state, cellEditor);
      syncFormulaBar();
    }

    function applyRuntimeState(nextRuntimeState) {
      if (!nextRuntimeState) {
        return;
      }

      state.cells = Object.assign({}, nextRuntimeState.cells);
      state.selection = selectionFromRuntimeSelection(nextRuntimeState.selection, TOTAL_ROWS, TOTAL_COLUMNS);
      render();
    }

    function setSelection(nextSelection, options) {
      state.selection = nextSelection;
      render();
      if (runtime && !(options && options.skipRuntime)) {
        runtime.updateSelection(selectionToRuntimeSelection(state.selection), options && options.source ? options.source : 'shell:selection');
      }
    }

    function commitRuntime(nextState, source) {
      state.selection = nextState.selection;
      state.cells = Object.assign({}, nextState.cells);
      state.editing = nextState.editing;
      render();

      if (runtime) {
        runtime.commit({
          cells: nextState.cells,
          selection: selectionToRuntimeSelection(nextState.selection),
        }, source || 'shell:edit');
      }
    }

    function setSelection(nextSelection, source) {
      state.selection = nextSelection;
      render();
      if (runtime) {
        runtime.updateSelection(selectionToRuntimeSelection(state.selection), source || 'shell:selection');
      }
    }

    function setEditing(nextState) {
      state.selection = nextState.selection;
      state.cells = Object.assign({}, nextState.cells);
      state.editing = nextState.editing;
      render();
    }

    function startEditing(source, replacementText, preserveExisting) {
      setEditing(beginCellEdit(state, replacementText, preserveExisting, source));
      if (source === 'cell') {
        focusEditor(cellEditor);
      } else if (formulaInput) {
        focusEditor(formulaInput);
      }
    }

    if (runtime) {
      runtime.bus.on('state:change', function (payload) {
        applyRuntimeState(payload && payload.state);
      });
    }

    if (formulaInput) {
      formulaInput.readOnly = false;
    }

    render();

    table.addEventListener('mousedown', function (event) {
      var cell = event.target.closest('td');
      if (!cell || state.editing) {
        return;
      }

      event.preventDefault();
      var anchor = readCellFromDataset(cell);
      state.dragAnchor = event.shiftKey ? state.selection.anchor : anchor;
      setSelection(selectionFromEndpoints(state.dragAnchor, anchor), 'shell:selection');
    });

    table.addEventListener('mouseover', function (event) {
      if (!state.dragAnchor || state.editing || (event.buttons & 1) !== 1) {
        return;
      }

      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      setSelection(selectionFromEndpoints(state.dragAnchor, readCellFromDataset(cell)), 'shell:selection');
    });

    document.addEventListener('mouseup', function () {
      state.dragAnchor = null;
    });

    table.addEventListener('click', function (event) {
      var cell = event.target.closest('td');
      if (!cell || state.editing) {
        return;
      }

      var focus = readCellFromDataset(cell);
      var anchor = event.shiftKey ? state.selection.anchor : focus;
      setSelection(selectionFromEndpoints(anchor, focus), 'shell:selection');
    });

    table.addEventListener('dblclick', function (event) {
      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      setSelection(selectionFromEndpoints(readCellFromDataset(cell), readCellFromDataset(cell)), 'shell:selection');
      startEditing('cell', null, true);
    });

    if (formulaInput) {
      formulaInput.addEventListener('focus', function () {
        if (!state.editing) {
          startEditing('formula', null, true);
        }
      });

      formulaInput.addEventListener('input', function (event) {
        if (!state.editing) {
          setEditing(beginCellEdit(state, event.target.value, false, 'formula'));
          return;
        }

        setEditing(applyEditDraft(state, event.target.value));
      });

      formulaInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitRuntime(commitActiveEdit(state, 'down'), 'shell:formula-enter');
          formulaInput.blur();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitRuntime(commitActiveEdit(state, event.shiftKey ? 'left' : 'right'), 'shell:formula-tab');
          formulaInput.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setEditing(cancelActiveEdit(state));
          formulaInput.blur();
        }
      });
    }

    cellEditor.addEventListener('input', function (event) {
      setEditing(applyEditDraft(state, event.target.value));
    });

    cellEditor.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitRuntime(commitActiveEdit(state, 'down'), 'shell:cell-enter');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitRuntime(commitActiveEdit(state, event.shiftKey ? 'left' : 'right'), 'shell:cell-tab');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setEditing(cancelActiveEdit(state));
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

      var historyState = handleHistoryHotkey(event, runtime);
      if (historyState) {
        applyRuntimeState(historyState);
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
      setSelection(moveActiveCell(state, delta, event.shiftKey).selection, 'shell:selection');
    });
  }

  var api = {
    createColumnLabels: createColumnLabels,
    createGridRows: createGridRows,
    clampCell: clampCell,
    createInitialSelection: createInitialSelection,
    selectionFromEndpoints: selectionFromEndpoints,
    createInitialState: createInitialState,
    getCellContent: getCellContent,
    beginCellEdit: beginCellEdit,
    beginEdit: beginEdit,
    applyEditDraft: applyEditDraft,
    inputText: inputText,
    commitActiveEdit: commitActiveEdit,
    commitEdit: commitEdit,
    cancelActiveEdit: cancelActiveEdit,
    cancelEdit: cancelEdit,
    moveActiveCell: moveActiveCell,
    moveSelection: moveSelection,
    selectCell: selectCell,
    selectionFromRuntimeSelection: selectionFromRuntimeSelection,
    handleHistoryHotkey: handleHistoryHotkey,
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
