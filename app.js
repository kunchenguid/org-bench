(function (root, factory) {
  const api = factory(
    root,
    typeof module !== 'undefined' && module.exports
      ? require('./engine.js')
      : root.SpreadsheetEngine
  );

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root && root.document) {
    root.addEventListener('DOMContentLoaded', function () {
      api.mountSpreadsheet(root.document);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, engineApi) {
  const ROWS = 100;
  const COLS = 26;

  function createEmptyState() {
    return {
      cells: {},
      selection: 'A1',
    };
  }

  function evaluateAllCells(cells) {
    return engineApi.createEngine(cells || {}).values;
  }

  function defaultNamespace(namespace) {
    return namespace || 'spreadsheet';
  }

  function createStorage(storage, namespace) {
    const key = defaultNamespace(namespace) + ':spreadsheet-state';
    return {
      load: function () {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : createEmptyState();
      },
      save: function (state) {
        storage.setItem(key, JSON.stringify(state));
      },
    };
  }

  function getStorageNamespace(document, env) {
    const source = env || root || {};
    const candidates = [
      source.__BENCHMARK_STORAGE_NAMESPACE__,
      source.BENCHMARK_STORAGE_NAMESPACE,
      source.__BENCHMARK_RUN_NAMESPACE__,
      source.BENCHMARK_RUN_NAMESPACE,
      source.__RUN_STORAGE_NAMESPACE__,
      source.RUN_STORAGE_NAMESPACE,
      document && document.documentElement && document.documentElement.getAttribute('data-storage-namespace'),
      document && document.body && document.body.getAttribute('data-storage-namespace'),
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      if (typeof candidates[index] === 'string' && candidates[index]) {
        return candidates[index];
      }
    }

    return 'spreadsheet:';
  }

  function moveSelection(cellId, direction) {
    const current = cellIdToPosition(cellId);
    const deltas = {
      left: { col: -1, row: 0 },
      right: { col: 1, row: 0 },
      up: { col: 0, row: -1 },
      down: { col: 0, row: 1 },
    };
    const delta = deltas[direction] || { col: 0, row: 0 };

    return positionToCellId(
      clamp(current.col + delta.col, 0, COLS - 1),
      clamp(current.row + delta.row, 0, ROWS - 1)
    );
  }

  function cellIdToPosition(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    if (!match) {
      throw new Error('Invalid cell id');
    }

    let col = 0;
    for (let index = 0; index < match[1].length; index += 1) {
      col = col * 26 + (match[1].charCodeAt(index) - 64);
    }

    return {
      col: col - 1,
      row: Number(match[2]) - 1,
    };
  }

  function positionToCellId(col, row) {
    let value = col + 1;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - remainder - 1) / 26);
    }
    return letters + String(row + 1);
  }

  function mountSpreadsheet(document) {
    const sheet = document.getElementById('sheet');
    const formulaInput = document.getElementById('formula-input');
    const nameBox = document.getElementById('name-box');
    const scrollContainer = document.getElementById('sheet-scroll');
    if (!sheet || !formulaInput || !nameBox || !scrollContainer) {
      return;
    }

    const namespace = getStorageNamespace(document, root);
    const storage = createStorage(root.localStorage, namespace.replace(/:$/, ''));
    const persisted = storage.load();
    const state = {
      cells: persisted.cells || {},
      selection: persisted.selection || 'A1',
      editing: null,
      values: evaluateAllCells(persisted.cells || {}),
    };

    buildGrid();
    renderCells();
    renderSelection();

    sheet.addEventListener('click', function (event) {
      const cell = event.target.closest('[data-cell-id]');
      if (!cell) {
        return;
      }
      if (state.editing) {
        commitEdit(null);
      }
      state.selection = cell.dataset.cellId;
      persist();
      renderSelection();
    });

    sheet.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('[data-cell-id]');
      if (!cell) {
        return;
      }
      state.selection = cell.dataset.cellId;
      startCellEdit(getRaw(state.selection), false);
    });

    formulaInput.addEventListener('focus', function () {
      if (!state.editing) {
        state.editing = {
          source: 'formula',
          original: getRaw(state.selection),
          value: getRaw(state.selection),
        };
      }
      formulaInput.select();
    });

    formulaInput.addEventListener('input', function () {
      if (!state.editing) {
        state.editing = {
          source: 'formula',
          original: getRaw(state.selection),
          value: formulaInput.value,
        };
      }
      state.editing.value = formulaInput.value;
      setRaw(state.selection, formulaInput.value);
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.editing = null;
        state.selection = moveSelection(state.selection, 'down');
        persist();
        renderSelection();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        state.editing = null;
        state.selection = moveSelection(state.selection, 'right');
        persist();
        renderSelection();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (state.editing) {
          setRaw(state.selection, state.editing.original);
        }
        state.editing = null;
        formulaInput.blur();
      }
    });

    formulaInput.addEventListener('blur', function () {
      state.editing = null;
      renderSelection();
    });

    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (document.activeElement === formulaInput) {
        return;
      }
      if (state.editing) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        state.selection = moveSelection(state.selection, 'left');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        state.selection = moveSelection(state.selection, 'right');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.selection = moveSelection(state.selection, 'up');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.selection = moveSelection(state.selection, 'down');
      } else if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        startCellEdit(getRaw(state.selection), false);
        return;
      } else if (event.key === 'Tab') {
        event.preventDefault();
        state.selection = moveSelection(state.selection, 'right');
      } else if (isPrintableKey(event.key)) {
        event.preventDefault();
        startCellEdit(event.key, true);
        return;
      } else {
        return;
      }

      persist();
      renderSelection();
    });

    function buildGrid() {
      const fragment = document.createDocumentFragment();
      const headerRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'corner';
      headerRow.appendChild(corner);

      for (let col = 0; col < COLS; col += 1) {
        const header = document.createElement('th');
        header.className = 'column-header';
        header.textContent = positionToCellId(col, 0).replace('1', '');
        header.dataset.col = String(col);
        headerRow.appendChild(header);
      }
      fragment.appendChild(headerRow);

      for (let row = 0; row < ROWS; row += 1) {
        const tr = document.createElement('tr');
        const rowHeader = document.createElement('th');
        rowHeader.className = 'row-header';
        rowHeader.dataset.row = String(row);
        rowHeader.textContent = String(row + 1);
        tr.appendChild(rowHeader);

        for (let col = 0; col < COLS; col += 1) {
          const cellId = positionToCellId(col, row);
          const cell = document.createElement('td');
          cell.className = 'cell';
          cell.dataset.cellId = cellId;
          const content = document.createElement('button');
          content.type = 'button';
          content.className = 'cell-inner';
          content.dataset.cellId = cellId;
          content.tabIndex = -1;
          cell.appendChild(content);
          tr.appendChild(cell);
        }

        fragment.appendChild(tr);
      }

      sheet.replaceChildren(fragment);
    }

    function renderCells() {
      const buttons = sheet.querySelectorAll('.cell-inner');
      buttons.forEach(function (button) {
        const cellId = button.dataset.cellId;
        const cell = button.parentElement;
        const result = state.values[cellId] || { value: '', display: '', error: null };
        button.textContent = result.display;
        cell.dataset.kind = kindForCell(cellId, result);
        cell.classList.toggle('error', !!result.error);
      });
    }

    function renderSelection() {
      const previous = sheet.querySelector('.cell.active');
      if (previous) {
        previous.classList.remove('active');
      }

      const cell = sheet.querySelector('.cell[data-cell-id="' + state.selection + '"]');
      if (cell) {
        cell.classList.add('active');
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }

      nameBox.textContent = state.selection;
      if (document.activeElement !== formulaInput) {
        formulaInput.value = getRaw(state.selection);
      }
    }

    function startCellEdit(initialValue, replace) {
      const cell = sheet.querySelector('.cell[data-cell-id="' + state.selection + '"]');
      if (!cell) {
        return;
      }

      state.editing = {
        source: 'cell',
        original: getRaw(state.selection),
      };

      const current = cell.querySelector('.cell-inner');
      current.hidden = true;
      cell.classList.add('editing');

      const input = document.createElement('input');
      input.className = 'cell-editor';
      input.type = 'text';
      input.value = replace ? initialValue : getRaw(state.selection);
      cell.appendChild(input);
      formulaInput.value = input.value;

      input.addEventListener('input', function () {
        formulaInput.value = input.value;
      });

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit('down');
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitEdit('right');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
      });

      input.addEventListener('blur', function () {
        if (state.editing) {
          commitEdit(null);
        }
      });

      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }

    function commitEdit(move) {
      const cell = sheet.querySelector('.cell[data-cell-id="' + state.selection + '"]');
      const input = cell && cell.querySelector('.cell-editor');
      const nextValue = input ? input.value : getRaw(state.selection);
      teardownEditor();
      setRaw(state.selection, nextValue);
      if (move) {
        state.selection = moveSelection(state.selection, move);
      }
      persist();
      renderSelection();
    }

    function cancelEdit() {
      if (!state.editing) {
        return;
      }
      const original = state.editing.original;
      teardownEditor();
      setRaw(state.selection, original);
      renderSelection();
    }

    function teardownEditor() {
      const cell = sheet.querySelector('.cell[data-cell-id="' + state.selection + '"]');
      if (cell) {
        cell.classList.remove('editing');
        const input = cell.querySelector('.cell-editor');
        if (input) {
          input.remove();
        }
        const inner = cell.querySelector('.cell-inner');
        if (inner) {
          inner.hidden = false;
        }
      }
      state.editing = null;
    }

    function kindForCell(cellId, result) {
      if (result.error) {
        return 'error';
      }
      const raw = getRaw(cellId).trim();
      if (!raw) {
        return 'empty';
      }
      if (raw.charAt(0) === '=') {
        return typeof result.value === 'number' ? 'number' : 'text';
      }
      return Number.isNaN(Number(raw)) ? 'text' : 'number';
    }

    function getRaw(cellId) {
      return state.cells[cellId] || '';
    }

    function setRaw(cellId, value) {
      if (value) {
        state.cells[cellId] = value;
      } else {
        delete state.cells[cellId];
      }
      state.values = evaluateAllCells(state.cells);
      renderCells();
    }

    function persist() {
      storage.save({
        cells: state.cells,
        selection: state.selection,
      });
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isPrintableKey(key) {
    return key.length === 1;
  }

  return {
    createEmptyState: createEmptyState,
    evaluateAllCells: evaluateAllCells,
    moveSelection: moveSelection,
    createStorage: createStorage,
    defaultNamespace: defaultNamespace,
    getStorageNamespace: getStorageNamespace,
    mountSpreadsheet: mountSpreadsheet,
  };
});
