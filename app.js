(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./src/formula.js'),
      require('./src/spreadsheet-state.js')
    );
    return;
  }

  root.SpreadsheetApp = factory(root.FormulaEngine, root.SpreadsheetState);
  document.addEventListener('DOMContentLoaded', function () {
    root.SpreadsheetApp.mountSpreadsheet(document);
  });
})(typeof globalThis !== 'undefined' ? globalThis : window, function (FormulaEngine, SpreadsheetState) {
  const COLS = 26;
  const ROWS = 100;

  function defaultNamespace(namespace) {
    return namespace ? String(namespace) : 'spreadsheet';
  }

  function createStorage(storage, namespace) {
    const key = defaultNamespace(namespace) + ':spreadsheet-state';
    return {
      save(state) {
        storage.setItem(key, JSON.stringify(state));
      },
      load() {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : createEmptyState();
      },
    };
  }

  function createEmptyState() {
    return {
      selection: 'A1',
      cells: {},
      editing: null,
      draft: '',
    };
  }

  function createSpreadsheetCore(options) {
    const rows = options && options.rows ? options.rows : ROWS;
    const cols = options && options.cols ? options.cols : COLS;
    const cells = {};

    function setCell(cellId, raw) {
      const value = raw == null ? '' : String(raw);
      if (value) {
        cells[cellId] = value;
      } else {
        delete cells[cellId];
      }
    }

    function getCellRaw(cellId) {
      return cells[cellId] || '';
    }

    function getCellResult(cellId) {
      return evaluateAllCells(cells)[cellId] || { display: '', error: null, kind: 'empty' };
    }

    function getCellDisplay(cellId) {
      return getCellResult(cellId).display;
    }

    function getCellKind(cellId) {
      const result = getCellResult(cellId);
      if (result.error) {
        return 'error';
      }
      return result.kind || 'text';
    }

    function exportState() {
      return Object.assign({}, cells);
    }

    function importState(nextCells) {
      Object.keys(cells).forEach(function (cellId) {
        delete cells[cellId];
      });
      Object.keys(nextCells || {}).forEach(function (cellId) {
        if (nextCells[cellId] != null && nextCells[cellId] !== '') {
          cells[cellId] = String(nextCells[cellId]);
        }
      });
    }

    return {
      rows: rows,
      cols: cols,
      setCell: setCell,
      getCellRaw: getCellRaw,
      getCellDisplay: getCellDisplay,
      getCellKind: getCellKind,
      exportState: exportState,
      importState: importState,
    };
  }

  function cloneState(state) {
    return {
      selection: state.selection,
      cells: Object.assign({}, state.cells || {}),
      editing: state.editing || null,
      draft: state.draft || '',
    };
  }

  function beginEditingState(state, mode, replacement) {
    const next = cloneState(state);
    next.editing = mode;
    next.draft = replacement != null ? replacement : (next.cells[next.selection] || '');
    return next;
  }

  function commitEditingState(state, colDelta, rowDelta) {
    if (!state.editing) {
      return cloneState(state);
    }

    const next = cloneState(state);
    if (next.draft) {
      next.cells[next.selection] = next.draft;
    } else {
      delete next.cells[next.selection];
    }
    next.editing = null;
    next.selection = SpreadsheetState.moveSelection(next.selection, colDelta, rowDelta, COLS, ROWS);
    return next;
  }

  function cancelEditingState(state) {
    const next = cloneState(state);
    next.editing = null;
    next.draft = next.cells[next.selection] || '';
    return next;
  }

  function evaluateAllCells(cells) {
    return FormulaEngine.evaluateSheet(cells || {});
  }

  function moveSelection(cellId, direction) {
    const offsets = {
      left: [-1, 0],
      right: [1, 0],
      up: [0, -1],
      down: [0, 1],
    };
    const offset = offsets[direction] || [0, 0];
    return SpreadsheetState.moveSelection(cellId, offset[0], offset[1], COLS, ROWS);
  }

  function getSelectionAxis(cellId) {
    return SpreadsheetState.cellIdToPosition(cellId);
  }

  function getStorageNamespace(documentRef, env) {
    const source = env || (typeof window !== 'undefined' ? window : {});
    const candidates = [
      source.__BENCHMARK_STORAGE_NAMESPACE__,
      source.BENCHMARK_STORAGE_NAMESPACE,
      source.__BENCHMARK_RUN_NAMESPACE__,
      source.BENCHMARK_RUN_NAMESPACE,
      source.__RUN_STORAGE_NAMESPACE__,
      documentRef && documentRef.documentElement ? documentRef.documentElement.getAttribute('data-storage-namespace') : '',
      documentRef && documentRef.body ? documentRef.body.getAttribute('data-storage-namespace') : '',
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      if (candidates[i]) {
        return String(candidates[i]);
      }
    }

    return '';
  }

  function mountSpreadsheet(documentRef) {
    const formulaInput = documentRef.getElementById('formula-input');
    const selectedCellLabel = documentRef.getElementById('selected-cell-label');
    const grid = documentRef.getElementById('sheet-grid');
    if (!formulaInput || !selectedCellLabel || !grid) {
      return;
    }

    const storage = createStorage(window.localStorage, getStorageNamespace(documentRef));
    const persisted = storage.load();
    const state = createEmptyState();
    state.selection = persisted.selection || 'A1';
    state.cells = persisted.cells || {};

    buildGrid(grid);
    attachEvents();
    render();

    function attachEvents() {
      grid.addEventListener('click', function (event) {
        const cell = event.target.closest('[data-cell]');
        if (!cell) {
          return;
        }
        selectCell(cell.dataset.cell);
      });

      grid.addEventListener('dblclick', function (event) {
        const cell = event.target.closest('[data-cell]');
        if (!cell) {
          return;
        }
        selectCell(cell.dataset.cell);
        startEditing('cell');
      });

      formulaInput.addEventListener('focus', function () {
        if (!state.editing) {
          startEditing('formula');
        }
      });

      formulaInput.addEventListener('input', function (event) {
        state.editing = 'formula';
        state.draft = event.target.value;
      });

      formulaInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEditing(0, 1);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitEditing(1, 0);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEditing();
        }
      });

      documentRef.addEventListener('keydown', function (event) {
        if (state.editing === 'cell') {
          return;
        }

        if (!state.editing && isPrintableKey(event)) {
          event.preventDefault();
          startEditing('cell', event.key);
          return;
        }

        if (!state.editing && (event.key === 'Enter' || event.key === 'F2')) {
          event.preventDefault();
          startEditing('cell');
          return;
        }

        if (state.editing === 'formula') {
          return;
        }

        const directions = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const direction = directions[event.key];
        if (!direction) {
          return;
        }

        event.preventDefault();
        state.selection = SpreadsheetState.moveSelection(state.selection, direction[0], direction[1], COLS, ROWS);
        save();
        render();
      });
    }

    function selectCell(cellId) {
      if (state.editing) {
        commitEditing(0, 0);
      }
      state.selection = cellId;
      save();
      render();
    }

    function startEditing(mode, replacement) {
      Object.assign(state, beginEditingState(state, mode, replacement));
      render();

      if (mode === 'formula') {
        formulaInput.focus();
        formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
        return;
      }

      const editor = grid.querySelector('[data-cell="' + state.selection + '"] .cell-editor');
      if (editor) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
        editor.addEventListener('input', function (event) {
          state.draft = event.target.value;
          formulaInput.value = state.draft;
        });
        editor.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitEditing(0, 1);
          } else if (event.key === 'Tab') {
            event.preventDefault();
            commitEditing(1, 0);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditing();
          }
        });
        editor.addEventListener('blur', function () {
          if (state.editing === 'cell') {
            commitEditing(0, 0);
          }
        }, { once: true });
      }
    }

    function commitEditing(colDelta, rowDelta) {
      if (!state.editing) {
        return;
      }

      Object.assign(state, commitEditingState(state, colDelta, rowDelta));
      save();
      render();
    }

    function cancelEditing() {
      Object.assign(state, cancelEditingState(state));
      render();
    }

    function save() {
      storage.save({ selection: state.selection, cells: state.cells });
    }

    function render() {
      const evaluated = evaluateAllCells(state.cells);
      const cells = grid.querySelectorAll('[data-cell]');
      const axis = getSelectionAxis(state.selection);
      const columnHeaders = grid.querySelectorAll('[data-column-index]');
      const rowHeaders = grid.querySelectorAll('[data-row-index]');

      cells.forEach(function (cell) {
        const cellId = cell.dataset.cell;
        const result = evaluated[cellId] || { display: '', kind: 'blank', error: false };
        const isActive = cellId === state.selection;
        const isEditingCell = isActive && state.editing === 'cell';
        cell.className = 'cell';

        if (isActive) {
          cell.classList.add('active');
        }
        if (result.kind === 'number') {
          cell.classList.add('numeric');
        }
        if (result.error) {
          cell.classList.add('error');
        }

        if (isEditingCell) {
          cell.innerHTML = '<input class="cell-editor" type="text" spellcheck="false" autocomplete="off">';
          cell.firstChild.value = state.draft;
        } else {
          cell.innerHTML = '<div class="cell-display"></div>';
          cell.firstChild.textContent = result.display;
        }
      });

      columnHeaders.forEach(function (header) {
        header.classList.toggle('active-axis', Number(header.dataset.columnIndex) === axis.col);
      });

      rowHeaders.forEach(function (header) {
        header.classList.toggle('active-axis', Number(header.dataset.rowIndex) === axis.row);
      });

      selectedCellLabel.textContent = state.selection;
      formulaInput.value = state.editing ? state.draft : (state.cells[state.selection] || '');
      const activeCell = grid.querySelector('[data-cell="' + state.selection + '"]');
      if (activeCell) {
        activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  function buildGrid(grid) {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    for (let col = 0; col < COLS; col += 1) {
      const header = document.createElement('th');
      header.className = 'column-header';
      header.dataset.columnIndex = String(col);
      header.textContent = SpreadsheetState.positionToCellId(col, 0).replace('1', '');
      headerRow.appendChild(header);
    }

    thead.appendChild(headerRow);
    grid.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.dataset.rowIndex = String(row);
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (let col = 0; col < COLS; col += 1) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.dataset.cell = SpreadsheetState.positionToCellId(col, row);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    grid.appendChild(tbody);
  }

  function isPrintableKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  return {
    createSpreadsheetCore: createSpreadsheetCore,
    createEmptyState: createEmptyState,
    createStorage: createStorage,
    defaultNamespace: defaultNamespace,
    evaluateAllCells: evaluateAllCells,
    getStorageNamespace: getStorageNamespace,
    beginEditingState: beginEditingState,
    commitEditingState: commitEditingState,
    cancelEditingState: cancelEditingState,
    getSelectionAxis: getSelectionAxis,
    mountSpreadsheet: mountSpreadsheet,
    moveSelection: moveSelection,
  };
});
