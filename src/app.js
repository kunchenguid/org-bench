(function () {
  const modelApi = window.SpreadsheetModel;
  const namespace = window.__BENCHMARK_RUN_NAMESPACE__ || 'amazon-spreadsheet';
  const storageKey = namespace + ':spreadsheet';
  const selectedCellLabel = document.querySelector('[data-selected-cell]');
  const formulaInput = document.querySelector('[data-formula-input]');
  const grid = document.querySelector('[data-grid]');
  const editor = document.querySelector('[data-cell-editor]');
  const status = document.querySelector('[data-status]');
  const columns = modelApi.COLUMN_COUNT;
  const rows = modelApi.ROW_COUNT;
  const state = loadState();
  const model = modelApi.createSpreadsheetModel(state);
  const history = modelApi.createHistoryManager(50);
  let isEditing = false;
  let selectionAnchor = state && state.selectionAnchor ? state.selectionAnchor : model.getSelectedCell();
  let selectionFocus = state && state.selectionFocus ? state.selectionFocus : model.getSelectedCell();
  let isDraggingSelection = false;
  let clipboard = null;

  buildGrid();
  refresh();

  grid.addEventListener('mousedown', function (event) {
    const cell = event.target.closest('[data-address]');
    if (!cell) {
      return;
    }

    isDraggingSelection = true;
    if (event.shiftKey) {
      updateSelection(cell.dataset.address, true);
      return;
    }

    updateSelection(cell.dataset.address, false);
  });

  grid.addEventListener('click', function (event) {
    const cell = event.target.closest('[data-address]');
    if (!cell) {
      return;
    }

    isEditing = false;
    updateSelection(cell.dataset.address, event.shiftKey);
  });

  grid.addEventListener('mouseover', function (event) {
    const cell = event.target.closest('[data-address]');
    if (!cell || !isDraggingSelection) {
      return;
    }

    updateSelection(cell.dataset.address, true);
  });

  grid.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-address]');
    if (!cell) {
      return;
    }
    updateSelection(cell.dataset.address, false);
    beginEdit(model.getRawValue(cell.dataset.address));
  });

  document.addEventListener('mouseup', function () {
    isDraggingSelection = false;
  });

  document.addEventListener('keydown', function (event) {
    if (event.target === formulaInput) {
      return;
    }

    if (isEditing && event.target === editor) {
      handleEditorKeydown(event);
      return;
    }

    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      beginEdit(model.getRawValue(model.getSelectedCell()));
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      applyAction(function () {
        model.clearCells(getSelectedAddresses());
      });
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      clipboard = model.copyBlock(selectionAnchor, selectionFocus);
      status.textContent = selectionSummary(getSelectedAddresses().length) + ' copied';
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      clipboard = model.copyBlock(selectionAnchor, selectionFocus);
      clipboard.cut = true;
      status.textContent = selectionSummary(getSelectedAddresses().length) + ' cut';
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteSelection();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      restoreSnapshot(history.undo());
      return;
    }

    if (((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'z') || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      restoreSnapshot(history.redo());
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginEdit(event.key);
      return;
    }

    const movement = movementForKey(event.key);
    if (!movement) {
      return;
    }

    event.preventDefault();
    moveSelection(movement.column, movement.row, event.shiftKey);
  });

  formulaInput.addEventListener('input', function () {
    status.textContent = 'Editing ' + model.getSelectedCell();
  });

  editor.addEventListener('input', function () {
    formulaInput.value = editor.value;
    status.textContent = 'Editing ' + model.getSelectedCell();
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitValue(formulaInput.value, 0, 1);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      refresh();
    }
  });

  function buildGrid() {
    const fragment = document.createDocumentFragment();
    const table = document.createElement('table');
    table.className = 'sheet';

    const headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th'));
    for (let column = 0; column < columns; column += 1) {
      const th = document.createElement('th');
      th.className = 'column-header';
      th.textContent = modelApi.indexToColumnLetters(column);
      headRow.appendChild(th);
    }
    table.appendChild(headRow);

    for (let row = 1; row <= rows; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row);
      tr.appendChild(rowHeader);

      for (let column = 0; column < columns; column += 1) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.tabIndex = -1;
        td.dataset.address = modelApi.indexToColumnLetters(column) + String(row);
        tr.appendChild(td);
      }

      table.appendChild(tr);
    }

    fragment.appendChild(table);
    grid.appendChild(fragment);
  }

  function beginEdit(initialValue) {
    isEditing = true;
    editValue = initialValue;
    const address = model.getSelectedCell();
    const cell = grid.querySelector('[data-address="' + address + '"]');
    const rect = cell.getBoundingClientRect();
    const hostRect = grid.getBoundingClientRect();

    editor.hidden = false;
    editor.value = initialValue;
    formulaInput.value = initialValue;
    editor.style.left = (rect.left - hostRect.left + grid.scrollLeft) + 'px';
    editor.style.top = (rect.top - hostRect.top + grid.scrollTop) + 'px';
    editor.style.width = rect.width + 'px';
    editor.style.height = rect.height + 'px';
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    status.textContent = 'Editing ' + address;
  }

  function handleEditorKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitValue(editor.value, 0, 1);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitValue(editor.value, 1, 0);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  function cancelEdit() {
    isEditing = false;
    editor.hidden = true;
    refresh();
  }

  function commitValue(value, columnDelta, rowDelta) {
    const nextAddress = nextAddressFromSelection(columnDelta, rowDelta);
    applyAction(function () {
      model.setCell(model.getSelectedCell(), value);
      updateSelection(nextAddress, false);
    });
    isEditing = false;
    editor.hidden = true;
  }

  function moveSelection(columnDelta, rowDelta, extendSelection) {
    const point = modelApi.addressToPoint(model.getSelectedCell());
    const nextColumn = clamp(point.column + columnDelta, 0, columns - 1);
    const nextRow = clamp(point.row + rowDelta, 0, rows - 1);
    updateSelection(modelApi.pointToAddress(nextColumn, nextRow), extendSelection);
  }

  function updateSelection(address, extendSelection) {
    model.selectCell(address);
    if (!extendSelection) {
      selectionAnchor = address;
    }
    selectionFocus = address;
    refresh();
  }

  function pasteSelection() {
    if (!clipboard) {
      return;
    }

    applyAction(function () {
      if (clipboard.cut) {
        model.clearCells(clipboard.addresses);
      }
      model.pasteBlock(model.getSelectedCell(), clipboard);
    });

    if (clipboard.cut) {
      clipboard = null;
    }
  }

  function getSelectedAddresses() {
    return modelApi.expandRange(selectionAnchor, selectionFocus);
  }

  function refresh() {
    const selectedAddress = model.getSelectedCell();
    const selectedAddresses = new Set(getSelectedAddresses());
    selectedCellLabel.textContent = selectedAddress;
    formulaInput.value = model.getRawValue(selectedAddress);
    status.textContent = isEditing ? 'Editing ' + selectedAddress : selectionSummary(selectedAddresses.size);

    grid.querySelectorAll('[data-address]').forEach(function (cell) {
      const address = cell.dataset.address;
      cell.classList.toggle('is-in-range', selectedAddresses.has(address));
      cell.classList.toggle('is-selected', address === selectedAddress);
      cell.textContent = model.getDisplayValue(address);
      cell.classList.toggle('is-empty', cell.textContent === '');
    });
  }

  function persist() {
    const payload = model.serialize();
    payload.selectionAnchor = selectionAnchor;
    payload.selectionFocus = selectionFocus;
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function movementForKey(key) {
    switch (key) {
      case 'ArrowUp': return { column: 0, row: -1 };
      case 'ArrowDown': return { column: 0, row: 1 };
      case 'ArrowLeft': return { column: -1, row: 0 };
      case 'ArrowRight': return { column: 1, row: 0 };
      default: return null;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function selectionSummary(size) {
    if (size <= 1) {
      return 'Ready';
    }

    return size + ' cells selected';
  }

  function snapshotState() {
    const snapshot = model.serialize();
    snapshot.selectionAnchor = selectionAnchor;
    snapshot.selectionFocus = selectionFocus;
    return snapshot;
  }

  function applyAction(mutator) {
    const before = snapshotState();
    mutator();
    const after = snapshotState();
    history.record(before, after);
    persist();
    refresh();
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }
    model.loadState(snapshot);
    selectionAnchor = snapshot.selectionAnchor || model.getSelectedCell();
    selectionFocus = snapshot.selectionFocus || model.getSelectedCell();
    persist();
    refresh();
  }

  function nextAddressFromSelection(columnDelta, rowDelta) {
    const point = modelApi.addressToPoint(model.getSelectedCell());
    return modelApi.pointToAddress(
      clamp(point.column + columnDelta, 0, columns - 1),
      clamp(point.row + rowDelta, 0, rows - 1)
    );
  }
})();
