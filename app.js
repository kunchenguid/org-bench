(function () {
  const formulaApi = window.SpreadsheetFormula;
  const sheet = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');

  const namespace = [
    window.__RUN_STORAGE_NAMESPACE__,
    window.__BENCHMARK_RUN_NAMESPACE__,
    window.__storageNamespace,
    'facebook-spreadsheet',
  ].find(Boolean);

  const storageKeys = {
    cells: namespace + ':cells',
    selection: namespace + ':selection',
  };

  const storedCells = parseJson(localStorage.getItem(storageKeys.cells), {});
  const storedSelection = parseJson(localStorage.getItem(storageKeys.selection), { row: 0, col: 0 });
  const workbook = formulaApi.createWorkbook(storedCells);

  const state = {
    active: clampCell(storedSelection.row, storedSelection.col),
    anchor: clampCell(storedSelection.row, storedSelection.col),
    editing: null,
    mouseSelecting: false,
  };

  buildGrid();
  renderAll();
  syncFormulaBar();

  sheet.addEventListener('mousedown', onSheetMouseDown);
  sheet.addEventListener('mouseover', onSheetMouseOver);
  sheet.addEventListener('dblclick', onSheetDoubleClick);
  document.addEventListener('mouseup', function () {
    state.mouseSelecting = false;
  });
  document.addEventListener('keydown', onDocumentKeyDown);

  formulaInput.addEventListener('focus', function () {
    formulaInput.select();
  });
  formulaInput.addEventListener('input', function () {
    if (!state.editing) {
      state.editing = {
        row: state.active.row,
        col: state.active.col,
        original: workbook.getCell(cellId(state.active.row, state.active.col)),
        source: 'formula',
      };
    }
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(formulaInput.value, 1, 0);
      sheet.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      sheet.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(formulaInput.value, 0, 1);
      sheet.focus();
    }
  });
  formulaInput.addEventListener('blur', function () {
    if (state.editing && state.editing.source === 'formula') {
      commitEdit(formulaInput.value, 0, 0);
    }
  });

  function buildGrid() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(div('corner', ''));

    for (let col = 0; col < formulaApi.MAX_COLS; col += 1) {
      fragment.appendChild(div('col-header', formulaApi.indexToColumn(col)));
    }

    for (let row = 0; row < formulaApi.MAX_ROWS; row += 1) {
      fragment.appendChild(div('row-header', String(row + 1)));
      for (let col = 0; col < formulaApi.MAX_COLS; col += 1) {
        const cell = div('cell', '');
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        fragment.appendChild(cell);
      }
    }

    sheet.appendChild(fragment);
    sheet.tabIndex = 0;
  }

  function renderAll() {
    for (let row = 0; row < formulaApi.MAX_ROWS; row += 1) {
      for (let col = 0; col < formulaApi.MAX_COLS; col += 1) {
        renderCell(row, col);
      }
    }
    syncFormulaBar();
    persistSelection();
  }

  function renderCell(row, col) {
    const cell = getCellElement(row, col);
    const id = cellId(row, col);
    const raw = workbook.getCell(id);
    const value = workbook.getDisplayValue(id);
    const isSelected = inSelection(row, col);
    const isActive = row === state.active.row && col === state.active.col;

    cell.className = 'cell';
    if (isSelected) {
      cell.classList.add('selected');
    }
    if (isActive) {
      cell.classList.add('active');
    }
    if (/^#/.test(value)) {
      cell.classList.add('error');
    }
    if (!raw.startsWith('=') && /^[-+]?\d+(\.\d+)?$/.test(raw.trim())) {
      cell.classList.add('numeric');
    }
    if (state.editing && state.editing.row === row && state.editing.col === col && state.editing.source === 'cell') {
      mountEditor(cell, raw, state.editing.replaceWith);
      return;
    }
    cell.textContent = value;
    cell.title = raw || value;
  }

  function mountEditor(cell, raw, replaceWith) {
    cell.textContent = '';
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = replaceWith != null ? replaceWith : raw;
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(input.value, 1, 0);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(input.value, 0, event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    input.addEventListener('blur', function () {
      if (state.editing && state.editing.source === 'cell') {
        commitEdit(input.value, 0, 0);
      }
    });
  }

  function onSheetMouseDown(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    state.mouseSelecting = true;
    if (event.shiftKey) {
      state.active = { row, col };
    } else {
      state.anchor = { row, col };
      state.active = { row, col };
    }
    endCellEdit(false);
    renderAll();
  }

  function onSheetMouseOver(event) {
    if (!state.mouseSelecting) {
      return;
    }
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    state.active = {
      row: Number(cell.dataset.row),
      col: Number(cell.dataset.col),
    };
    renderAll();
  }

  function onSheetDoubleClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    startCellEdit(Number(cell.dataset.row), Number(cell.dataset.col));
  }

  function onDocumentKeyDown(event) {
    if (event.target === formulaInput) {
      return;
    }
    if (state.editing && state.editing.source === 'cell') {
      return;
    }

    if ((event.key === 'Backspace' || event.key === 'Delete') && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      clearSelection();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startCellEdit(state.active.row, state.active.col);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      startCellEdit(state.active.row, state.active.col, event.key);
      return;
    }

    const deltas = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };

    if (deltas[event.key]) {
      event.preventDefault();
      const delta = deltas[event.key];
      moveSelection(delta[0], delta[1], event.shiftKey);
    }
  }

  function moveSelection(rowDelta, colDelta, extend) {
    const next = clampCell(state.active.row + rowDelta, state.active.col + colDelta);
    state.active = next;
    if (!extend) {
      state.anchor = next;
    }
    renderAll();
    scrollCellIntoView(next.row, next.col);
  }

  function startCellEdit(row, col, replaceWith) {
    state.active = { row, col };
    state.anchor = { row, col };
    state.editing = {
      row,
      col,
      original: workbook.getCell(cellId(row, col)),
      replaceWith,
      source: 'cell',
    };
    renderAll();
  }

  function commitEdit(value, moveRow, moveCol) {
    if (!state.editing) {
      workbook.setCell(cellId(state.active.row, state.active.col), value);
    } else {
      workbook.setCell(cellId(state.editing.row, state.editing.col), value);
      state.active = { row: state.editing.row, col: state.editing.col };
      state.anchor = { row: state.editing.row, col: state.editing.col };
      state.editing = null;
    }
    persistCells();
    state.active = clampCell(state.active.row + moveRow, state.active.col + moveCol);
    state.anchor = { row: state.active.row, col: state.active.col };
    renderAll();
    scrollCellIntoView(state.active.row, state.active.col);
  }

  function cancelEdit() {
    state.editing = null;
    renderAll();
  }

  function endCellEdit(commit) {
    if (!state.editing || state.editing.source !== 'cell') {
      return;
    }
    const input = getCellElement(state.editing.row, state.editing.col).querySelector('input');
    if (commit && input) {
      commitEdit(input.value, 0, 0);
    } else {
      cancelEdit();
    }
  }

  function clearSelection() {
    const bounds = getSelectionBounds();
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        workbook.setCell(cellId(row, col), '');
      }
    }
    persistCells();
    renderAll();
  }

  function syncFormulaBar() {
    if (document.activeElement !== formulaInput || !state.editing || state.editing.source !== 'formula') {
      formulaInput.value = workbook.getCell(cellId(state.active.row, state.active.col));
    }
  }

  function persistCells() {
    localStorage.setItem(storageKeys.cells, JSON.stringify(workbook.getSnapshot()));
  }

  function persistSelection() {
    localStorage.setItem(storageKeys.selection, JSON.stringify(state.active));
  }

  function getSelectionBounds() {
    return {
      top: Math.min(state.anchor.row, state.active.row),
      bottom: Math.max(state.anchor.row, state.active.row),
      left: Math.min(state.anchor.col, state.active.col),
      right: Math.max(state.anchor.col, state.active.col),
    };
  }

  function inSelection(row, col) {
    const bounds = getSelectionBounds();
    return row >= bounds.top && row <= bounds.bottom && col >= bounds.left && col <= bounds.right;
  }

  function getCellElement(row, col) {
    return sheet.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]');
  }

  function scrollCellIntoView(row, col) {
    const cell = getCellElement(row, col);
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function cellId(row, col) {
    return formulaApi.toCellId(row, col);
  }

  function clampCell(row, col) {
    return {
      row: Math.max(0, Math.min(formulaApi.MAX_ROWS - 1, row || 0)),
      col: Math.max(0, Math.min(formulaApi.MAX_COLS - 1, col || 0)),
    };
  }

  function div(className, text) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = text;
    return node;
  }

  function parseJson(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }
})();
