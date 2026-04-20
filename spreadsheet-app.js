(function () {
  const ROWS = 100;
  const COLS = 26;
  const STORAGE_NAMESPACE = resolveNamespace();
  const STORAGE_KEY = `${STORAGE_NAMESPACE}:sheet-state`;

  const sheetEl = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const core = window.SpreadsheetCore;

  const state = {
    cells: {},
    evaluated: {},
    selected: { row: 0, col: 0 },
    editing: null,
  };

  restoreState();
  recalculate();
  buildGrid();
  bindEvents();
  render();

  function resolveNamespace() {
    return (
      window.__BENCHMARK_NAMESPACE__ ||
      window.__RUN_NAMESPACE__ ||
      window.RUN_NAMESPACE ||
      document.documentElement.getAttribute('data-storage-namespace') ||
      'spreadsheet'
    );
  }

  function selectedRef() {
    return core.makeCellRef(state.selected.row, state.selected.col);
  }

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) {
        return;
      }
      state.cells = saved.cells || {};
      if (saved.selected) {
        state.selected = {
          row: clamp(saved.selected.row, 0, ROWS - 1),
          col: clamp(saved.selected.col, 0, COLS - 1),
        };
      }
    } catch (error) {
      console.warn('Failed to restore sheet state', error);
    }
  }

  function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cells: state.cells,
      selected: state.selected,
    }));
  }

  function recalculate() {
    state.evaluated = core.evaluateSheet(state.cells);
  }

  function buildGrid() {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);
    for (let col = 0; col < COLS; col += 1) {
      const th = document.createElement('th');
      th.textContent = core.indexToColumn(col);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (let col = 0; col < COLS; col += 1) {
        const td = document.createElement('td');
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    sheetEl.appendChild(thead);
    sheetEl.appendChild(tbody);
  }

  function bindEvents() {
    sheetEl.addEventListener('click', function (event) {
      const cell = event.target.closest('td');
      if (!cell) {
        return;
      }
      selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    });

    sheetEl.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('td');
      if (!cell) {
        return;
      }
      selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
      startEditing(getRawValue(selectedRef()));
    });

    document.addEventListener('keydown', handleDocumentKeydown);

    formulaInput.addEventListener('focus', function () {
      startEditing(getRawValue(selectedRef()), 'formula');
    });

    formulaInput.addEventListener('input', function () {
      if (!state.editing) {
        startEditing(formulaInput.value, 'formula');
      } else {
        state.editing.value = formulaInput.value;
        syncEditingInput();
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEditing(1, 0);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEditing(0, 1);
      }
    });
  }

  function handleDocumentKeydown(event) {
    const target = event.target;
    const isTypingField = target.tagName === 'INPUT' && target !== formulaInput;

    if (isTypingField) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (state.editing && target === formulaInput) {
      return;
    }

    if (!state.editing && event.key.length === 1 && !event.shiftKey) {
      event.preventDefault();
      startEditing(event.key);
      return;
    }

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        moveSelection(-1, 0);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveSelection(1, 0);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveSelection(0, -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveSelection(0, 1);
        break;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        startEditing(getRawValue(selectedRef()));
        break;
      default:
        break;
    }
  }

  function getRawValue(ref) {
    return state.cells[ref] || '';
  }

  function getDisplayEntry(ref) {
    return state.evaluated[ref] || { value: '', display: '' };
  }

  function selectCell(row, col) {
    state.selected = {
      row: clamp(row, 0, ROWS - 1),
      col: clamp(col, 0, COLS - 1),
    };
    if (!state.editing) {
      formulaInput.value = getRawValue(selectedRef());
    }
    persistState();
    render();
  }

  function moveSelection(rowDelta, colDelta) {
    selectCell(state.selected.row + rowDelta, state.selected.col + colDelta);
    scrollSelectedIntoView();
  }

  function startEditing(initialValue, source) {
    state.editing = {
      ref: selectedRef(),
      value: initialValue,
      original: getRawValue(selectedRef()),
      source: source || 'cell',
    };
    formulaInput.value = initialValue;
    render();
    syncEditingInput();
  }

  function syncEditingInput() {
    const input = sheetEl.querySelector('td.is-editing input');
    if (input && input.value !== state.editing.value) {
      input.value = state.editing.value;
    }
  }

  function commitEditing(rowDelta, colDelta) {
    if (!state.editing) {
      return;
    }
    const value = state.editing.value;
    if (value) {
      state.cells[state.editing.ref] = value;
    } else {
      delete state.cells[state.editing.ref];
    }
    state.editing = null;
    recalculate();
    persistState();
    moveSelection(rowDelta, colDelta);
    render();
  }

  function cancelEditing() {
    if (!state.editing) {
      return;
    }
    state.editing = null;
    formulaInput.value = getRawValue(selectedRef());
    render();
  }

  function render() {
    const cells = sheetEl.querySelectorAll('td');
    cells.forEach(function (cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const ref = core.makeCellRef(row, col);
      const active = row === state.selected.row && col === state.selected.col;
      const editing = active && state.editing && state.editing.ref === ref;

      cell.classList.toggle('is-active', active);
      cell.classList.toggle('is-editing', Boolean(editing));

      if (editing) {
        cell.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = state.editing.value;
        input.spellcheck = false;
        input.addEventListener('input', function () {
          state.editing.value = input.value;
          formulaInput.value = input.value;
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitEditing(1, 0);
          } else if (event.key === 'Tab') {
            event.preventDefault();
            commitEditing(0, 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditing();
          }
        });
        cell.appendChild(input);
        requestAnimationFrame(function () {
          input.focus();
          input.select();
        });
      } else {
        const entry = getDisplayEntry(ref);
        const display = document.createElement('div');
        display.className = 'cell-value';
        display.textContent = entry.display;
        if (typeof entry.value === 'number') {
          display.classList.add('is-number');
        }
        if (entry.display && entry.display[0] === '#') {
          display.classList.add('is-error');
        }
        cell.innerHTML = '';
        cell.appendChild(display);
      }
    });

    if (!state.editing) {
      formulaInput.value = getRawValue(selectedRef());
    }
  }

  function scrollSelectedIntoView() {
    const selector = `td[data-row="${state.selected.row}"][data-col="${state.selected.col}"]`;
    const cell = sheetEl.querySelector(selector);
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
