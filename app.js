(function () {
  const engineApi = window.SpreadsheetEngine;
  const SpreadsheetModel = engineApi.SpreadsheetModel;
  const indexToColumn = engineApi.indexToColumn;

  const ROWS = 100;
  const COLS = 26;
  const STORAGE_PREFIX = [
    window.__RUN_STORAGE_NAMESPACE__,
    window.RUN_STORAGE_NAMESPACE,
    document.documentElement.dataset.storageNamespace,
    'northstar-sheet'
  ].find(Boolean);
  const STORAGE_KEY = STORAGE_PREFIX + ':sheet-state';

  const grid = document.getElementById('sheet-grid');
  const formulaInput = document.getElementById('formula-input');
  const selectionChip = document.getElementById('selection-chip');

  let selected = 'A1';
  let editing = null;
  let model = new SpreadsheetModel(loadState());

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (parsed.selection) {
        selected = parsed.selection;
      }
      return parsed;
    } catch (error) {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cells: model.serialize().cells,
      selection: selected
    }));
  }

  function buildGrid() {
    const fragment = document.createDocumentFragment();
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);
    for (let col = 0; col < COLS; col += 1) {
      const th = document.createElement('th');
      th.textContent = indexToColumn(col);
      headerRow.appendChild(th);
    }
    fragment.appendChild(headerRow);

    for (let row = 1; row <= ROWS; row += 1) {
      const tr = document.createElement('tr');
      const header = document.createElement('th');
      header.className = 'row-header';
      header.textContent = String(row);
      tr.appendChild(header);
      for (let col = 0; col < COLS; col += 1) {
        const ref = indexToColumn(col) + row;
        const td = document.createElement('td');
        td.dataset.ref = ref;
        tr.appendChild(td);
      }
      fragment.appendChild(tr);
    }

    grid.innerHTML = '';
    grid.appendChild(fragment);
  }

  function render() {
    grid.querySelectorAll('td').forEach((cell) => {
      const ref = cell.dataset.ref;
      const display = model.getDisplay(ref);
      cell.classList.toggle('active', ref === selected);
      cell.classList.toggle('error', /^#/.test(display));
      if (editing === ref) {
        return;
      }
      cell.textContent = display;
    });
    selectionChip.textContent = selected;
    if (document.activeElement !== formulaInput) {
      formulaInput.value = model.getRaw(selected);
    }
    const activeCell = grid.querySelector(`td[data-ref="${selected}"]`);
    if (activeCell) {
      activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function setSelection(ref) {
    selected = ref;
    saveState();
    render();
  }

  function moveSelection(rowDelta, colDelta) {
    const match = selected.match(/^([A-Z]+)(\d+)$/);
    const nextCol = Math.max(0, Math.min(COLS - 1, engineApi.columnToIndex(match[1]) + colDelta));
    const nextRow = Math.max(1, Math.min(ROWS, Number(match[2]) + rowDelta));
    setSelection(indexToColumn(nextCol) + nextRow);
  }

  function startEdit(seedValue) {
    if (editing) {
      return;
    }
    editing = selected;
    const cell = grid.querySelector(`td[data-ref="${selected}"]`);
    const input = document.createElement('input');
    input.className = 'editor';
    input.value = seedValue != null ? seedValue : model.getRaw(selected);
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(input.value, { rowDelta: 1, colDelta: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(input.value, { rowDelta: 0, colDelta: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });
    input.addEventListener('blur', () => {
      if (editing === selected) {
        commitEdit(input.value, null);
      }
    });
  }

  function commitEdit(value, moveAfter) {
    if (!editing) {
      return;
    }
    model.setCell(editing, value);
    editing = null;
    saveState();
    render();
    if (moveAfter) {
      moveSelection(moveAfter.rowDelta, moveAfter.colDelta);
    }
  }

  function cancelEdit() {
    editing = null;
    render();
  }

  grid.addEventListener('click', (event) => {
    const cell = event.target.closest('td[data-ref]');
    if (!cell) {
      return;
    }
    setSelection(cell.dataset.ref);
  });

  grid.addEventListener('dblclick', (event) => {
    const cell = event.target.closest('td[data-ref]');
    if (!cell) {
      return;
    }
    setSelection(cell.dataset.ref);
    startEdit();
  });

  formulaInput.addEventListener('focus', () => {
    formulaInput.select();
  });

  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      model.setCell(selected, formulaInput.value);
      saveState();
      render();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      formulaInput.value = model.getRaw(selected);
      formulaInput.blur();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (editing || document.activeElement === formulaInput) {
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEdit();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      model.setCell(selected, '');
      saveState();
      render();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      startEdit(event.key);
    }
  });

  buildGrid();
  render();
})();
