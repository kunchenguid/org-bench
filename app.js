(function () {
  const core = window.SpreadsheetCore;
  const sheetNode = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const storageKey = resolveStorageKey();

  const state = loadState();

  buildGrid();
  render();
  bindEvents();

  function resolveStorageKey() {
    const explicit = window.__RUN_STORAGE_NAMESPACE__ || window.__BENCHMARK_RUN_NAMESPACE__ || document.documentElement.getAttribute('data-storage-namespace');
    return String(explicit || 'northstar-sheet') + ':sheet-state';
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (parsed && parsed.cells && parsed.selection) {
        return {
          cells: parsed.cells,
          selection: clampSelection(parsed.selection),
          rangeStart: clampSelection(parsed.rangeStart || parsed.selection),
          rangeEnd: clampSelection(parsed.rangeEnd || parsed.selection),
          editing: false,
          draft: '',
        };
      }
    } catch (error) {
      // Ignore broken persisted state and reset to an empty sheet.
    }
    const selection = { row: 0, col: 0 };
    return { cells: {}, selection, rangeStart: selection, rangeEnd: selection, editing: false, draft: '' };
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify({
      cells: state.cells,
      selection: state.selection,
      rangeStart: state.rangeStart,
      rangeEnd: state.rangeEnd,
    }));
  }

  function clampSelection(selection) {
    return {
      row: Math.max(0, Math.min(core.ROWS - 1, selection.row || 0)),
      col: Math.max(0, Math.min(core.COLS - 1, selection.col || 0)),
    };
  }

  function buildGrid() {
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    corner.textContent = '';
    headRow.appendChild(corner);

    for (let col = 0; col < core.COLS; col += 1) {
      const header = document.createElement('th');
      header.textContent = core.indexToColumn(col);
      headRow.appendChild(header);
    }

    thead.appendChild(headRow);
    sheetNode.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < core.ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);
      for (let col = 0; col < core.COLS; col += 1) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.tabIndex = -1;
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    sheetNode.appendChild(tbody);
  }

  function bindEvents() {
    sheetNode.addEventListener('click', function (event) {
      const cell = event.target.closest('.cell');
      if (!cell) return;
      const next = readCellPosition(cell);
      if (event.shiftKey) {
        state.rangeEnd = next;
        state.selection = next;
      } else {
        state.selection = next;
        state.rangeStart = next;
        state.rangeEnd = next;
      }
      state.editing = false;
      render();
    });

    sheetNode.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('.cell');
      if (!cell) return;
      state.selection = readCellPosition(cell);
      state.rangeStart = state.selection;
      state.rangeEnd = state.selection;
      startEditing(rawValueAtSelection(), true);
    });

    let dragging = false;
    sheetNode.addEventListener('mousedown', function (event) {
      const cell = event.target.closest('.cell');
      if (!cell) return;
      dragging = true;
      state.selection = readCellPosition(cell);
      state.rangeStart = state.selection;
      state.rangeEnd = state.selection;
      state.editing = false;
      render();
    });

    sheetNode.addEventListener('mouseover', function (event) {
      if (!dragging) return;
      const cell = event.target.closest('.cell');
      if (!cell) return;
      state.selection = readCellPosition(cell);
      state.rangeEnd = state.selection;
      render();
    });

    document.addEventListener('mouseup', function () {
      dragging = false;
    });

    document.addEventListener('keydown', handleDocumentKeydown);
    formulaInput.addEventListener('focus', function () {
      if (!state.editing) {
        state.editing = true;
        state.draft = rawValueAtSelection();
      }
      render();
    });
    formulaInput.addEventListener('input', function () {
      state.editing = true;
      state.draft = formulaInput.value;
    });
    formulaInput.addEventListener('keydown', handleFormulaKeydown);
    window.addEventListener('beforeunload', persist);
  }

  function handleDocumentKeydown(event) {
    const modifier = event.metaKey || event.ctrlKey;

    if (!state.editing && (event.key === 'Backspace' || event.key === 'Delete')) {
      clearRange();
      event.preventDefault();
      return;
    }

    if (state.editing && document.activeElement === formulaInput) return;

    if (modifier) return;

    if (event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      moveSelection(event.key, true);
      event.preventDefault();
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      moveSelection(event.key, false);
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      startEditing(rawValueAtSelection(), true);
      event.preventDefault();
      return;
    }

    if (event.key === 'Tab') {
      moveSelection('ArrowRight', false);
      event.preventDefault();
      return;
    }

    if (event.key.length === 1 && !event.altKey) {
      startEditing(event.key, false);
      event.preventDefault();
    }
  }

  function handleFormulaKeydown(event) {
    if (event.key === 'Enter') {
      commitEdit('down');
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab') {
      commitEdit('right');
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      cancelEdit();
      event.preventDefault();
    }
  }

  function clearRange() {
    eachSelectedCell(function (address) {
      delete state.cells[address];
    });
    state.editing = false;
    persist();
    render();
  }

  function startEditing(initialValue, selectAll) {
    state.editing = true;
    state.draft = initialValue;
    render();
    formulaInput.focus();
    if (selectAll) formulaInput.select();
    else formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
  }

  function commitEdit(direction) {
    const address = selectionAddress();
    if (state.draft === '') delete state.cells[address];
    else state.cells[address] = state.draft;
    state.editing = false;
    persist();
    if (direction === 'down') moveSelection('ArrowDown', false, true);
    if (direction === 'right') moveSelection('ArrowRight', false, true);
    render();
  }

  function cancelEdit() {
    state.editing = false;
    state.draft = rawValueAtSelection();
    render();
  }

  function moveSelection(key, extend, silent) {
    const next = { row: state.selection.row, col: state.selection.col };
    if (key === 'ArrowUp') next.row -= 1;
    if (key === 'ArrowDown') next.row += 1;
    if (key === 'ArrowLeft') next.col -= 1;
    if (key === 'ArrowRight') next.col += 1;
    state.selection = clampSelection(next);
    if (extend) {
      state.rangeEnd = state.selection;
    } else {
      state.rangeStart = state.selection;
      state.rangeEnd = state.selection;
    }
    if (!silent) render();
  }

  function render() {
    const sheet = core.createSheet(state.cells);
    const activeAddress = selectionAddress();
    nameBox.value = activeAddress;
    formulaInput.value = state.editing ? state.draft : rawValueAtSelection();

    const range = selectedBounds();
    sheetNode.querySelectorAll('.cell').forEach(function (cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const address = core.toAddress(col, row);
      const result = core.evaluateCell(sheet, address);
      cell.textContent = result.display;
      cell.classList.toggle('active', address === activeAddress);
      cell.classList.toggle('error', /^#/.test(result.display));
      cell.classList.toggle('in-range', row >= range.top && row <= range.bottom && col >= range.left && col <= range.right);
    });
    const activeCell = sheetNode.querySelector('.cell.active');
    if (activeCell) activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function selectedBounds() {
    return {
      top: Math.min(state.rangeStart.row, state.rangeEnd.row),
      bottom: Math.max(state.rangeStart.row, state.rangeEnd.row),
      left: Math.min(state.rangeStart.col, state.rangeEnd.col),
      right: Math.max(state.rangeStart.col, state.rangeEnd.col),
    };
  }

  function eachSelectedCell(callback) {
    const bounds = selectedBounds();
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        callback(core.toAddress(col, row), row, col);
      }
    }
  }

  function rawValueAtSelection() {
    return state.cells[selectionAddress()] || '';
  }

  function selectionAddress() {
    return core.toAddress(state.selection.col, state.selection.row);
  }

  function readCellPosition(cell) {
    return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
  }
})();
