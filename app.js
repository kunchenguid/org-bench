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

  function cellFromAddress(address) {
    var match = String(address || '').match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return null;
    }

    return {
      row: Number(match[2]) - 1,
      column: match[1].charCodeAt(0) - 65,
    };
  }

  function cloneCells(cells) {
    return Object.assign({}, cells || {});
  }

  function selectionSize(selection) {
    return {
      rows: selection.maxRow - selection.minRow + 1,
      columns: selection.maxColumn - selection.minColumn + 1,
    };
  }

  function getSelectionOrigin(selection) {
    var size = selectionSize(selection);
    if (size.rows === 1 && size.columns === 1) {
      return {
        row: selection.active.row,
        column: selection.active.column,
      };
    }

    return {
      row: selection.minRow,
      column: selection.minColumn,
    };
  }

  function forEachCellInSelection(selection, callback) {
    for (var row = selection.minRow; row <= selection.maxRow; row += 1) {
      for (var column = selection.minColumn; column <= selection.maxColumn; column += 1) {
        callback({ row: row, column: column }, row - selection.minRow, column - selection.minColumn);
      }
    }
  }

  function clearSelectedCells(cells, selection) {
    var nextCells = cloneCells(cells);
    forEachCellInSelection(selection, function (cell) {
      delete nextCells[addressFromCell(cell)];
    });
    return nextCells;
  }

  function matrixFromSelection(cells, selection) {
    var rows = [];
    for (var row = selection.minRow; row <= selection.maxRow; row += 1) {
      var columns = [];
      for (var column = selection.minColumn; column <= selection.maxColumn; column += 1) {
        columns.push((cells && cells[addressFromCell({ row: row, column: column })]) || '');
      }
      rows.push(columns);
    }
    return rows;
  }

  function matrixToClipboardText(matrix) {
    return matrix.map(function (row) {
      return row.join('\t');
    }).join('\n');
  }

  function parseClipboardText(text) {
    return String(text || '').replace(/\r/g, '').split('\n').map(function (line) {
      return line.split('\t');
    });
  }

  function parseReferenceToken(token) {
    var match = String(token).match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      return null;
    }

    return {
      columnAbsolute: match[1] === '$',
      column: match[2].charCodeAt(0) - 64,
      rowAbsolute: match[3] === '$',
      row: Number(match[4]),
    };
  }

  function formatReferenceToken(reference) {
    return [
      reference.columnAbsolute ? '$' : '',
      String.fromCharCode(64 + reference.column),
      reference.rowAbsolute ? '$' : '',
      String(reference.row),
    ].join('');
  }

  function translateFormulaFallback(rawValue, sourceAddress, targetAddress) {
    if (typeof rawValue !== 'string' || rawValue.charAt(0) !== '=') {
      return rawValue;
    }

    var source = cellFromAddress(sourceAddress);
    var target = cellFromAddress(targetAddress);
    if (!source || !target) {
      return rawValue;
    }

    var rowOffset = target.row - source.row;
    var columnOffset = target.column - source.column;

    return '=' + rawValue.slice(1).replace(/\$?[A-Z]+\$?\d+/g, function (token) {
      var reference = parseReferenceToken(token);
      if (!reference) {
        return token;
      }

      var next = {
        columnAbsolute: reference.columnAbsolute,
        rowAbsolute: reference.rowAbsolute,
        column: reference.columnAbsolute ? reference.column : Math.max(1, reference.column + columnOffset),
        row: reference.rowAbsolute ? reference.row : Math.max(1, reference.row + rowOffset),
      };

      return formatReferenceToken(next);
    });
  }

  function getFormulaTranslator() {
    if (globalScope.SpreadsheetFormulaEngine && typeof globalScope.SpreadsheetFormulaEngine.translateFormula === 'function') {
      return globalScope.SpreadsheetFormulaEngine.translateFormula;
    }
    return translateFormulaFallback;
  }

  function copySelection(cells, selection, mode) {
    var matrix = matrixFromSelection(cells, selection);
    return {
      text: matrixToClipboardText(matrix),
      payload: {
        mode: mode || 'copy',
        selection: {
          minRow: selection.minRow,
          maxRow: selection.maxRow,
          minColumn: selection.minColumn,
          maxColumn: selection.maxColumn,
        },
        matrix: matrix,
      },
    };
  }

  function normalizeClipboard(clipboard) {
    if (!clipboard) {
      return null;
    }

    if (clipboard.payload && clipboard.payload.matrix) {
      return clipboard.payload;
    }

    if (clipboard.matrix) {
      return clipboard;
    }

    return null;
  }

  function pasteSelection(options) {
    var clipboard = normalizeClipboard(options.clipboard);
    if (!clipboard || !clipboard.matrix || !clipboard.matrix.length) {
      return {
        cells: cloneCells(options.cells),
        selection: options.targetSelection,
        cutCleared: false,
      };
    }

    var nextCells = cloneCells(options.cells);
    var targetOrigin = getSelectionOrigin(options.targetSelection);
    var blockHeight = clipboard.matrix.length;
    var blockWidth = clipboard.matrix[0].length;
    var translateFormula = typeof options.translateFormula === 'function' ? options.translateFormula : getFormulaTranslator();

    if (clipboard.mode === 'cut' && clipboard.selection) {
      for (var sourceRow = clipboard.selection.minRow; sourceRow <= clipboard.selection.maxRow; sourceRow += 1) {
        for (var sourceColumn = clipboard.selection.minColumn; sourceColumn <= clipboard.selection.maxColumn; sourceColumn += 1) {
          delete nextCells[addressFromCell({ row: sourceRow, column: sourceColumn })];
        }
      }
    }

    clipboard.matrix.forEach(function (rowValues, rowOffset) {
      rowValues.forEach(function (rawValue, columnOffset) {
        var targetCell = {
          row: targetOrigin.row + rowOffset,
          column: targetOrigin.column + columnOffset,
        };
        var targetAddress = addressFromCell(targetCell);
        var sourceAddress = clipboard.selection
          ? addressFromCell({
              row: clipboard.selection.minRow + rowOffset,
              column: clipboard.selection.minColumn + columnOffset,
            })
          : targetAddress;
        var nextValue = rawValue;

        if (typeof rawValue === 'string' && rawValue.charAt(0) === '=') {
          nextValue = translateFormula(rawValue, sourceAddress, targetAddress);
        }

        if (nextValue) {
          nextCells[targetAddress] = nextValue;
        } else {
          delete nextCells[targetAddress];
        }
      });
    });

    var nextSelection = selectionFromEndpoints(targetOrigin, {
      row: targetOrigin.row + blockHeight - 1,
      column: targetOrigin.column + blockWidth - 1,
    });
    nextSelection.active = {
      row: targetOrigin.row,
      column: targetOrigin.column,
    };

    return {
      cells: nextCells,
      selection: nextSelection,
      cutCleared: clipboard.mode === 'cut',
    };
  }

  function renderCells(root, cells) {
    root.querySelectorAll('td').forEach(function (cell) {
      var address = cell.dataset.address;
      cell.textContent = (cells && cells[address]) || '';
    });
  }

  function syncFormulaBar(formulaInput, cells, selection) {
    if (!formulaInput) {
      return;
    }

    formulaInput.value = (cells && cells[addressFromCell(selection.active)]) || '';
  }

  function readClipboardPayload(clipboardData) {
    if (!clipboardData) {
      return null;
    }

    var rawPayload = clipboardData.getData('application/x-sheet-selection');
    if (rawPayload) {
      try {
        return JSON.parse(rawPayload);
      } catch (error) {
        return null;
      }
    }

    var text = clipboardData.getData('text/plain');
    if (!text) {
      return null;
    }

    return {
      mode: 'copy',
      matrix: parseClipboardText(text),
    };
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
    table.tabIndex = 0;

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

    var clipboardApi = globalScope.SpreadsheetClipboard || {
      copySelection: copySelection,
      readClipboardPayload: readClipboardPayload,
      commitRangeClear: function (currentRuntime, selection, source) {
        return currentRuntime.commit(
          {
            cells: clearSelectedCells(currentRuntime.getState().cells, selection),
            selection: selectionToRuntimeSelection(selection),
          },
          source || 'clipboard:clear'
        );
      },
      commitClipboardPaste: function (options) {
        var result = pasteSelection({
          cells: options.runtime.getState().cells,
          targetSelection: options.selection,
          clipboard: options.clipboard,
          translateFormula: options.translateFormula,
        });

        return {
          state: options.runtime.commit(
            {
              cells: result.cells,
              selection: selectionToRuntimeSelection(result.selection),
            },
            options.source || 'clipboard:paste'
          ),
          selection: result.selection,
          cutCleared: result.cutCleared,
        };
      },
    };

    var state = {
      selection: runtime
        ? selectionFromRuntimeSelection(runtime.getState().selection, TOTAL_ROWS, TOTAL_COLUMNS)
        : createInitialSelection(),
      dragAnchor: null,
      localCells: runtime ? null : {},
      clipboard: null,
    };

    function getCells() {
      return runtime ? runtime.getState().cells : state.localCells;
    }

    function syncFormulaBar() {
      if (!formulaInput) {
        return;
      }

      var rawValue = getCells()[addressFromCell(state.selection.active)];
      formulaInput.value = typeof rawValue === 'string' ? rawValue : '';
    }

    function commitCells(nextCells, source, nextSelection) {
      if (runtime) {
        var committed = runtime.commit(
          {
            cells: nextCells,
            selection: selectionToRuntimeSelection(nextSelection || state.selection),
          },
          source || 'clipboard:cells'
        );
        renderCells(table, committed.cells);
        syncFormulaBar();
        return committed;
      }

      state.localCells = nextCells;
      renderCells(table, state.localCells);
      syncFormulaBar();
      return {
        cells: state.localCells,
        selection: selectionToRuntimeSelection(nextSelection || state.selection),
      };
    }

    function setSelection(nextSelection, options) {
      state.selection = nextSelection;
      applySelectionState(table, state.selection);
      if (runtime && !(options && options.skipRuntime)) {
        runtime.updateSelection(selectionToRuntimeSelection(state.selection), 'shell:selection');
      }
      syncFormulaBar();
    }

    function applyRuntimeState(nextRuntimeState) {
      if (!nextRuntimeState) {
        return;
      }

      setSelection(selectionFromRuntimeSelection(nextRuntimeState.selection, TOTAL_ROWS, TOTAL_COLUMNS), {
        skipRuntime: true,
      });
    }

    if (runtime) {
      runtime.bus.on('state:change', function (payload) {
        applyRuntimeState(payload && payload.state);
      });
    }

    setSelection(state.selection);
    renderCells(table, getCells());

    table.addEventListener('mousedown', function (event) {
      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      event.preventDefault();
      table.focus();
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

      table.focus();
      var focus = readCellFromDataset(cell);
      var anchor = event.shiftKey ? state.selection.anchor : focus;
      setSelection(selectionFromEndpoints(anchor, focus));
    });

    document.addEventListener('keydown', function (event) {
      if (event.target && event.target.closest('.formula-bar')) {
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
        if ((event.key === 'Backspace' || event.key === 'Delete') && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          if (runtime) {
            var clearedState = clipboardApi.commitRangeClear(runtime, state.selection, 'clipboard:clear');
            renderCells(table, clearedState.cells);
            syncFormulaBar();
          } else {
            commitCells(clearSelectedCells(getCells(), state.selection), 'clipboard:clear');
          }
        }
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

    document.addEventListener('copy', function (event) {
      if (document.activeElement !== table) {
        return;
      }

      var clipboard = clipboardApi.copySelection(getCells(), state.selection, 'copy');
      event.preventDefault();
      event.clipboardData.setData('text/plain', clipboard.text);
      event.clipboardData.setData('application/x-sheet-selection', JSON.stringify(clipboard.payload));
      state.clipboard = clipboard.payload;
    });

    document.addEventListener('cut', function (event) {
      if (document.activeElement !== table) {
        return;
      }

      var clipboard = clipboardApi.copySelection(getCells(), state.selection, 'cut');
      event.preventDefault();
      event.clipboardData.setData('text/plain', clipboard.text);
      event.clipboardData.setData('application/x-sheet-selection', JSON.stringify(clipboard.payload));
      state.clipboard = clipboard.payload;
    });

    document.addEventListener('paste', function (event) {
      if (document.activeElement !== table) {
        return;
      }

      var clipboard = clipboardApi.readClipboardPayload(event.clipboardData) || state.clipboard;
      if (!clipboard) {
        return;
      }

      event.preventDefault();
      var result = runtime
        ? clipboardApi.commitClipboardPaste({
            runtime: runtime,
            selection: state.selection,
            clipboard: clipboard,
            translateFormula: getFormulaTranslator(),
            source: 'clipboard:paste',
          })
        : {
            selection: pasteSelection({
              cells: getCells(),
              targetSelection: state.selection,
              clipboard: clipboard,
              translateFormula: getFormulaTranslator(),
            }).selection,
            cutCleared: pasteSelection({
              cells: getCells(),
              targetSelection: state.selection,
              clipboard: clipboard,
              translateFormula: getFormulaTranslator(),
            }).cutCleared,
          };
      if (runtime) {
        renderCells(table, result.state.cells);
      } else {
        var fallbackPaste = pasteSelection({
          cells: getCells(),
          targetSelection: state.selection,
          clipboard: clipboard,
          translateFormula: getFormulaTranslator(),
        });
        commitCells(fallbackPaste.cells, 'clipboard:paste', fallbackPaste.selection);
        result = fallbackPaste;
      }
      setSelection(result.selection);
      if (result.cutCleared) {
        state.clipboard = null;
      }
    });
  }

  var api = {
    createColumnLabels: createColumnLabels,
    createGridRows: createGridRows,
    clampCell: clampCell,
    createInitialSelection: createInitialSelection,
    selectionFromEndpoints: selectionFromEndpoints,
    clearSelectedCells: clearSelectedCells,
    copySelection: copySelection,
    pasteSelection: pasteSelection,
    translateFormulaFallback: translateFormulaFallback,
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
