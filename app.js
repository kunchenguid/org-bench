(function () {
  const core = window.SpreadsheetCore;
  const namespace = window.__BENCHMARK_RUN_NAMESPACE__ || 'microsoft-sheet';
  const storageKey = namespace + ':spreadsheet';
  const selectionKey = namespace + ':selection';
  const grid = document.getElementById('grid');
  const formulaInput = document.getElementById('formula-input');
  const store = core.createStore(loadJSON(storageKey));
  let selection = loadJSON(selectionKey) || { col: 0, row: 0 };
  let isEditing = false;
  let history = [];
  let future = [];

  function loadJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(store.toJSON()));
    localStorage.setItem(selectionKey, JSON.stringify(selection));
  }

  function pushHistory() {
    history.push(JSON.stringify(store.toJSON()));
    if (history.length > 50) {
      history = history.slice(-50);
    }
    future = [];
  }

  function restore(serialized) {
    const nextStore = core.createStore(JSON.parse(serialized));
    store.raw.clear();
    nextStore.raw.forEach(function (value, key) {
      store.raw.set(key, value);
    });
  }

  function render() {
    const sheet = core.evaluateSheet(store);
    grid.innerHTML = '';
    const corner = document.createElement('div');
    corner.className = 'corner';
    grid.appendChild(corner);
    for (let col = 0; col < core.COLS; col += 1) {
      const header = document.createElement('div');
      header.className = 'col-header';
      header.textContent = core.colToName(col);
      grid.appendChild(header);
    }
    for (let row = 0; row < core.ROWS; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      grid.appendChild(rowHeader);
      for (let col = 0; col < core.COLS; col += 1) {
        const cellData = sheet.getCell(col, row);
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.col = String(col);
        cell.dataset.row = String(row);
        cell.tabIndex = -1;
        if (selection.col === col && selection.row === row) {
          cell.classList.add('active');
        }
        if (/^-?\d/.test(cellData.display)) {
          cell.classList.add('numeric');
        }
        if (String(cellData.display).startsWith('#')) {
          cell.classList.add('error');
        }
        cell.textContent = cellData.display;
        cell.addEventListener('click', function () {
          selection = { col: col, row: row };
          isEditing = false;
          syncFormula();
          render();
        });
        cell.addEventListener('dblclick', function () {
          selection = { col: col, row: row };
          startEditing();
        });
        grid.appendChild(cell);
      }
    }
    syncFormula();
  }

  function syncFormula() {
    formulaInput.value = store.getCell(selection.col, selection.row);
  }

  function moveSelection(dCol, dRow) {
    selection = {
      col: Math.max(0, Math.min(core.COLS - 1, selection.col + dCol)),
      row: Math.max(0, Math.min(core.ROWS - 1, selection.row + dRow)),
    };
    save();
    render();
  }

  function commit(value, dCol, dRow) {
    pushHistory();
    store.setCell(selection.col, selection.row, value);
    isEditing = false;
    moveSelection(dCol, dRow);
    save();
  }

  function startEditing() {
    const cell = grid.querySelector('.cell.active');
    if (!cell) {
      return;
    }
    isEditing = true;
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = store.getCell(selection.col, selection.row);
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit(input.value, 0, 1);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commit(input.value, 1, 0);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        isEditing = false;
        render();
      }
    });
    input.addEventListener('blur', function () {
      if (isEditing) {
        commit(input.value, 0, 0);
      }
    });
  }

  formulaInput.addEventListener('focus', function () {
    isEditing = true;
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(formulaInput.value, 0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      isEditing = false;
      syncFormula();
    }
  });
  formulaInput.addEventListener('input', function () {
    if (isEditing) {
      store.setCell(selection.col, selection.row, formulaInput.value);
      save();
      render();
    }
  });

  document.addEventListener('keydown', function (event) {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        if (future.length) {
          history.push(JSON.stringify(store.toJSON()));
          restore(future.pop());
          save();
          render();
        }
        return;
      }
      if (history.length) {
        future.push(JSON.stringify(store.toJSON()));
        restore(history.pop());
        save();
        render();
      }
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (future.length) {
        history.push(JSON.stringify(store.toJSON()));
        restore(future.pop());
        save();
        render();
      }
      return;
    }
    if (event.target === formulaInput || grid.querySelector('.cell-editor')) {
      if (event.key === 'F2' && !grid.querySelector('.cell-editor')) {
        startEditing();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(-1, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(0, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(0, 1);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      pushHistory();
      store.setCell(selection.col, selection.row, '');
      save();
      render();
    } else if (event.key.length === 1 && !meta && !event.altKey) {
      event.preventDefault();
      pushHistory();
      store.setCell(selection.col, selection.row, event.key);
      save();
      render();
      startEditing();
    }
  });

  render();
  save();
})();
