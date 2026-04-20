(function () {
  const core = window.SpreadsheetCore;
  const storageNamespace = window.__BENCHMARK_RUN_NAMESPACE__ || 'spreadsheet:';
  const storageKey = core.makeStorageKey(storageNamespace, 'sheet');
  const formulaInput = document.getElementById('formula-input');
  const spreadsheet = document.getElementById('spreadsheet');

  let state = loadState();
  let editing = null;

  render();
  bindEvents();

  function loadState() {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        return core.createEmptySheet();
      }

      const parsed = JSON.parse(stored);
      return {
        rows: parsed.rows || core.ROWS,
        cols: parsed.cols || core.COLS,
        selected: parsed.selected || { row: 0, col: 0 },
        cells: parsed.cells || {},
      };
    } catch (error) {
      return core.createEmptySheet();
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function selectedKey() {
    return core.cellKey(state.selected.row, state.selected.col);
  }

  function selectedRawValue() {
    return state.cells[selectedKey()] || '';
  }

  function commitEdit(nextRaw, direction) {
    const key = selectedKey();
    if (nextRaw === '') {
      delete state.cells[key];
    } else {
      state.cells[key] = nextRaw;
    }

    editing = null;
    moveSelection(direction || { row: 0, col: 0 });
    saveState();
    render();
  }

  function cancelEdit() {
    editing = null;
    render();
  }

  function moveSelection(delta) {
    state.selected = {
      row: clamp(state.selected.row + delta.row, 0, state.rows - 1),
      col: clamp(state.selected.col + delta.col, 0, state.cols - 1),
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function startEdit(preserve) {
    editing = {
      key: selectedKey(),
      value: preserve ? selectedRawValue() : '',
    };
    render();

    const input = spreadsheet.querySelector('.cell-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function render() {
    const evaluated = core.evaluateSheet(state.cells);
    const fragment = document.createDocumentFragment();

    fragment.appendChild(makeNode('div', 'corner', ''));
    for (let col = 0; col < state.cols; col += 1) {
      fragment.appendChild(makeNode('div', 'col-header', core.columnIndexToName(col)));
    }

    for (let row = 0; row < state.rows; row += 1) {
      fragment.appendChild(makeNode('div', 'row-header', String(row + 1)));
      for (let col = 0; col < state.cols; col += 1) {
        const key = core.cellKey(row, col);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.key = key;

        if (state.selected.row === row && state.selected.col === col) {
          cell.classList.add('selected');
        }

        const cellState = evaluated[key] || { display: '', raw: '' };
        if (cellState.display === '#ERR!' || cellState.display === '#DIV/0!' || cellState.display === '#CIRC!') {
          cell.classList.add('error');
        }

        if (editing && editing.key === key) {
          cell.classList.add('editing');
          const input = document.createElement('input');
          input.className = 'cell-input';
          input.type = 'text';
          input.value = editing.value;
          input.spellcheck = false;
          cell.appendChild(input);
        } else {
          cell.textContent = cellState.display;
          cell.title = cellState.display;
        }

        fragment.appendChild(cell);
      }
    }

    spreadsheet.replaceChildren(fragment);
    formulaInput.value = editing ? editing.value : selectedRawValue();
  }

  function makeNode(tagName, className, text) {
    const node = document.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function bindEvents() {
    spreadsheet.addEventListener('click', function (event) {
      const cell = event.target.closest('.cell');
      if (!cell) {
        return;
      }
      state.selected = {
        row: Number(cell.dataset.row),
        col: Number(cell.dataset.col),
      };
      editing = null;
      saveState();
      render();
    });

    spreadsheet.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('.cell');
      if (!cell) {
        return;
      }
      state.selected = {
        row: Number(cell.dataset.row),
        col: Number(cell.dataset.col),
      };
      startEdit(true);
    });

    spreadsheet.addEventListener('input', function (event) {
      if (!event.target.classList.contains('cell-input')) {
        return;
      }
      editing.value = event.target.value;
      formulaInput.value = editing.value;
    });

    spreadsheet.addEventListener('keydown', function (event) {
      if (!event.target.classList.contains('cell-input')) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(event.target.value, { row: 1, col: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(event.target.value, { row: 0, col: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    formulaInput.addEventListener('focus', function () {
      editing = {
        key: selectedKey(),
        value: selectedRawValue(),
      };
      render();
      formulaInput.focus();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    });

    formulaInput.addEventListener('input', function () {
      editing = {
        key: selectedKey(),
        value: formulaInput.value,
      };
      const cellInput = spreadsheet.querySelector('.cell-input');
      if (cellInput) {
        cellInput.value = formulaInput.value;
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(formulaInput.value, { row: 1, col: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(formulaInput.value, { row: 0, col: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    window.addEventListener('keydown', function (event) {
      if (event.target === formulaInput || event.target.classList.contains('cell-input')) {
        return;
      }

      const deltas = {
        ArrowUp: { row: -1, col: 0 },
        ArrowDown: { row: 1, col: 0 },
        ArrowLeft: { row: 0, col: -1 },
        ArrowRight: { row: 0, col: 1 },
      };

      if (deltas[event.key]) {
        event.preventDefault();
        moveSelection(deltas[event.key]);
        saveState();
        render();
        return;
      }

      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        startEdit(true);
        return;
      }

      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        editing = { key: selectedKey(), value: event.key };
        render();
      }
    });
  }
})();
