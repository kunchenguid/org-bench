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

  function addressFromCell(cell) {
    return String.fromCharCode(65 + cell.column) + String(cell.row + 1);
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

    var state = {
      selection: runtime
        ? selectionFromRuntimeSelection(runtime.getState().selection, TOTAL_ROWS, TOTAL_COLUMNS)
        : createInitialSelection(),
      dragAnchor: null,
    };

    function syncFormulaBar() {
      if (!formulaInput) {
        return;
      }

      if (!runtime) {
        formulaInput.value = '';
        return;
      }

      var rawValue = runtime.getState().cells[addressFromCell(state.selection.active)];
      formulaInput.value = typeof rawValue === 'string' ? rawValue : '';
    }

    function setSelection(nextSelection) {
      state.selection = nextSelection;
      applySelectionState(table, state.selection);
      if (runtime) {
        runtime.updateSelection(selectionToRuntimeSelection(state.selection), 'shell:selection');
      }
      syncFormulaBar();
    }

    setSelection(state.selection);

    table.addEventListener('mousedown', function (event) {
      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      event.preventDefault();
      var anchor = readCellFromDataset(cell);
      state.dragAnchor = event.shiftKey ? state.selection.anchor : anchor;
      setSelection(selectionFromEndpoints(state.dragAnchor, anchor));
    });

    table.addEventListener('mouseover', function (event) {
      if (!state.dragAnchor || (event.buttons & 1) !== 1) {
        return;
      }

      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      setSelection(selectionFromEndpoints(state.dragAnchor, readCellFromDataset(cell)));
    });

    document.addEventListener('mouseup', function () {
      state.dragAnchor = null;
    });

    table.addEventListener('click', function (event) {
      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      var focus = readCellFromDataset(cell);
      var anchor = event.shiftKey ? state.selection.anchor : focus;
      setSelection(selectionFromEndpoints(anchor, focus));
    });

    document.addEventListener('keydown', function (event) {
      if (event.target && event.target.closest('.formula-bar')) {
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
      var nextFocus = clampCell(
        {
          row: state.selection.active.row + delta.row,
          column: state.selection.active.column + delta.column,
        },
        TOTAL_ROWS,
        TOTAL_COLUMNS
      );
      var nextAnchor = event.shiftKey ? state.selection.anchor : nextFocus;
      setSelection(selectionFromEndpoints(nextAnchor, nextFocus));
    });
  }

  var api = {
    createColumnLabels: createColumnLabels,
    createGridRows: createGridRows,
    clampCell: clampCell,
    createInitialSelection: createInitialSelection,
    selectionFromEndpoints: selectionFromEndpoints,
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
