(function () {
  var model = new SpreadsheetModel();
  var gridRoot = document.getElementById('grid-root');
  var formulaInput = document.getElementById('formula-input');
  var nameBox = document.getElementById('name-box');
  var cellEditor = document.getElementById('cell-editor');
  var selection = { anchorRow: 0, anchorColumn: 0, focusRow: 0, focusColumn: 0 };
  var editing = null;
  var storageKey = getStorageKey();
  var dragging = false;
  var clipboard = null;
  var history = new HistoryManager(50);

  restore();
  renderGrid();
  renderSelection();

  gridRoot.addEventListener('click', handleGridClick);
  gridRoot.addEventListener('mousedown', handleGridMouseDown);
  gridRoot.addEventListener('mouseover', handleGridMouseOver);
  gridRoot.addEventListener('dblclick', handleGridDoubleClick);
  document.addEventListener('mouseup', handleGridMouseUp);
  document.addEventListener('keydown', handleKeydown);
  formulaInput.addEventListener('focus', syncFormulaBar);
  formulaInput.addEventListener('input', function () {
    if (!editing || editing.source !== 'formula') {
      editing = { address: currentAddress(), previous: model.getRaw(currentAddress()), source: 'formula' };
    }
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(formulaInput.value, 1, 0);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(formulaInput.value, 0, 1);
    }
  });
  cellEditor.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(cellEditor.value, 1, 0);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(cellEditor.value, 0, 1);
    }
  });

  function renderGrid() {
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner-cell';
    corner.textContent = '';
    headRow.appendChild(corner);

    for (var column = 0; column < model.columnCount; column += 1) {
      var header = document.createElement('th');
      header.textContent = indexToColumn(column);
      headRow.appendChild(header);
    }

    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var row = 0; row < model.rowCount; row += 1) {
      var tableRow = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tableRow.appendChild(rowHeader);

      for (column = 0; column < model.columnCount; column += 1) {
        var cell = document.createElement('td');
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        updateCellElement(cell, addressFromPosition(row, column));
        tableRow.appendChild(cell);
      }
      tbody.appendChild(tableRow);
    }

    table.appendChild(tbody);
    gridRoot.innerHTML = '';
    gridRoot.appendChild(table);
  }

  function updateAllCells() {
    var cells = gridRoot.querySelectorAll('td[data-row][data-column]');
    for (var i = 0; i < cells.length; i += 1) {
      var cell = cells[i];
      updateCellElement(cell, addressFromPosition(Number(cell.dataset.row), Number(cell.dataset.column)));
    }
  }

  function updateCellElement(cell, address) {
    var meta = model.getCellMeta(address);
    cell.textContent = meta.display === null || meta.display === undefined ? '' : String(meta.display);
    cell.className = '';
    if (meta.type === 'number') {
      cell.classList.add('numeric');
    } else if (meta.type === 'boolean') {
      cell.classList.add('boolean');
    }
    if (meta.error) {
      cell.classList.add('error');
    }
  }

  function renderSelection() {
    var highlighted = gridRoot.querySelectorAll('td.active, td.in-range');
    for (var i = 0; i < highlighted.length; i += 1) {
      highlighted[i].classList.remove('active');
      highlighted[i].classList.remove('in-range');
    }
    var range = getSelectionRange();
    for (var row = range.startRow; row <= range.endRow; row += 1) {
      for (var column = range.startColumn; column <= range.endColumn; column += 1) {
        var cell = getCellElement(row, column);
        if (cell) {
          cell.classList.add('in-range');
        }
      }
    }
    var active = getCellElement(selection.focusRow, selection.focusColumn);
    if (active) {
      active.classList.add('active');
    }
    nameBox.textContent = currentAddress();
    if (!editing || editing.source !== 'formula') {
      formulaInput.value = model.getRaw(currentAddress());
    }
    persist();
  }

  function handleGridClick(event) {
    var cell = event.target.closest('td[data-row][data-column]');
    if (!cell) {
      return;
    }
    setSelection(Number(cell.dataset.row), Number(cell.dataset.column), event.shiftKey);
    stopCellEditing();
    editing = null;
    renderSelection();
  }

  function handleGridMouseDown(event) {
    var cell = event.target.closest('td[data-row][data-column]');
    if (!cell) {
      return;
    }
    dragging = true;
    setSelection(Number(cell.dataset.row), Number(cell.dataset.column), event.shiftKey);
    renderSelection();
  }

  function handleGridMouseOver(event) {
    if (!dragging) {
      return;
    }
    var cell = event.target.closest('td[data-row][data-column]');
    if (!cell) {
      return;
    }
    selection.focusRow = Number(cell.dataset.row);
    selection.focusColumn = Number(cell.dataset.column);
    renderSelection();
  }

  function handleGridMouseUp() {
    dragging = false;
  }

  function handleGridDoubleClick(event) {
    var cell = event.target.closest('td[data-row][data-column]');
    if (!cell) {
      return;
    }
    setSelection(Number(cell.dataset.row), Number(cell.dataset.column), false);
    renderSelection();
    startCellEditing(model.getRaw(currentAddress()), false);
  }

  function handleKeydown(event) {
    if (event.defaultPrevented) {
      return;
    }
    if (document.activeElement === formulaInput) {
      return;
    }
    if (document.activeElement === cellEditor) {
      return;
    }
    var handled = true;
    if (event.key === 'ArrowUp') {
      moveSelection(-1, 0, event.shiftKey);
    } else if (event.key === 'ArrowDown') {
      moveSelection(1, 0, event.shiftKey);
    } else if (event.key === 'ArrowLeft') {
      moveSelection(0, -1, event.shiftKey);
    } else if (event.key === 'ArrowRight') {
      moveSelection(0, 1, event.shiftKey);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      startCellEditing(model.getRaw(currentAddress()), false);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      applyAction(function () {
        model.clearRange(getSelectionRange());
      });
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      clipboard = model.copyBlock(getSelectionRange());
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x') {
      clipboard = model.copyBlock(getSelectionRange());
      clipboard.cut = true;
      clipboard.cutRange = getSelectionRange();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      pasteClipboard();
    } else if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      undo();
    } else if (((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'z') || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y')) {
      redo();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      startCellEditing(event.key, true);
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
    }
  }

  function startCellEditing(value, replace) {
    var cell = getCellElement(selection.focusRow, selection.focusColumn);
    if (!cell) {
      return;
    }
    var rect = cell.getBoundingClientRect();
    var containerRect = gridRoot.getBoundingClientRect();
    editing = {
      address: currentAddress(),
      previous: model.getRaw(currentAddress()),
      source: 'cell'
    };
    cellEditor.classList.remove('hidden');
    cellEditor.style.left = String(rect.left - containerRect.left + gridRoot.scrollLeft - 1) + 'px';
    cellEditor.style.top = String(rect.top - containerRect.top + gridRoot.scrollTop - 1) + 'px';
    cellEditor.style.width = String(rect.width + 2) + 'px';
    cellEditor.value = replace ? value : model.getRaw(currentAddress());
    formulaInput.value = cellEditor.value;
    cellEditor.focus();
    cellEditor.setSelectionRange(cellEditor.value.length, cellEditor.value.length);
  }

  function stopCellEditing() {
    cellEditor.classList.add('hidden');
  }

  function commitEdit(raw, rowDelta, columnDelta) {
    var nextSelection = {
      anchorRow: clamp(selection.focusRow + rowDelta, 0, model.rowCount - 1),
      anchorColumn: clamp(selection.focusColumn + columnDelta, 0, model.columnCount - 1),
      focusRow: clamp(selection.focusRow + rowDelta, 0, model.rowCount - 1),
      focusColumn: clamp(selection.focusColumn + columnDelta, 0, model.columnCount - 1)
    };
    applyAction(function () {
      model.setRaw(currentAddress(), raw);
      selection.anchorRow = nextSelection.anchorRow;
      selection.anchorColumn = nextSelection.anchorColumn;
      selection.focusRow = nextSelection.focusRow;
      selection.focusColumn = nextSelection.focusColumn;
    });
    editing = null;
    stopCellEditing();
  }

  function cancelEdit() {
    if (editing) {
      formulaInput.value = editing.previous;
      editing = null;
    }
    stopCellEditing();
    renderSelection();
  }

  function moveSelection(rowDelta, columnDelta, extend) {
    var nextRow = clamp(selection.focusRow + rowDelta, 0, model.rowCount - 1);
    var nextColumn = clamp(selection.focusColumn + columnDelta, 0, model.columnCount - 1);
    setSelection(nextRow, nextColumn, extend);
    renderSelection();
    scrollSelectionIntoView();
  }

  function scrollSelectionIntoView() {
    var cell = getCellElement(selection.focusRow, selection.focusColumn);
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function getCellElement(row, column) {
    return gridRoot.querySelector('td[data-row="' + row + '"][data-column="' + column + '"]');
  }

  function currentAddress() {
    return addressFromPosition(selection.focusRow, selection.focusColumn);
  }

  function addressFromPosition(row, column) {
    return indexToColumn(column) + String(row + 1);
  }

  function getSelectionRange() {
    return {
      startRow: Math.min(selection.anchorRow, selection.focusRow),
      startColumn: Math.min(selection.anchorColumn, selection.focusColumn),
      endRow: Math.max(selection.anchorRow, selection.focusRow),
      endColumn: Math.max(selection.anchorColumn, selection.focusColumn)
    };
  }

  function setSelection(row, column, extend) {
    row = clamp(row, 0, model.rowCount - 1);
    column = clamp(column, 0, model.columnCount - 1);
    if (!extend) {
      selection.anchorRow = row;
      selection.anchorColumn = column;
    }
    selection.focusRow = row;
    selection.focusColumn = column;
  }

  function pasteClipboard() {
    if (!clipboard) {
      return;
    }
    applyAction(function () {
      if (clipboard.cut && clipboard.cutRange) {
        model.clearRange(clipboard.cutRange);
      }
      model.pasteBlock(selection.focusRow, selection.focusColumn, clipboard);
    });
    if (clipboard.cut) {
      clipboard = null;
    }
  }

  function applyAction(mutator) {
    var before = snapshotState();
    mutator();
    var after = snapshotState();
    history.record(before, after);
    updateAllCells();
    renderSelection();
    persist();
  }

  function snapshotState() {
    return {
      cells: model.cloneCells(),
      selection: {
        anchorRow: selection.anchorRow,
        anchorColumn: selection.anchorColumn,
        focusRow: selection.focusRow,
        focusColumn: selection.focusColumn
      }
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }
    model.load(snapshot.cells || {});
    selection.anchorRow = clamp(Number(snapshot.selection.anchorRow) || 0, 0, model.rowCount - 1);
    selection.anchorColumn = clamp(Number(snapshot.selection.anchorColumn) || 0, 0, model.columnCount - 1);
    selection.focusRow = clamp(Number(snapshot.selection.focusRow) || 0, 0, model.rowCount - 1);
    selection.focusColumn = clamp(Number(snapshot.selection.focusColumn) || 0, 0, model.columnCount - 1);
    updateAllCells();
    renderSelection();
    persist();
  }

  function undo() {
    restoreSnapshot(history.undo(snapshotState()));
  }

  function redo() {
    restoreSnapshot(history.redo(snapshotState()));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function syncFormulaBar() {
    formulaInput.value = model.getRaw(currentAddress());
  }

  function getStorageKey() {
    var namespace = window.__AMAZON_RUN_NAMESPACE__ || 'amazon-sheet';
    return namespace + ':spreadsheet-state';
  }

  function persist() {
    var payload = {
      cells: model.cloneCells(),
      selection: selection
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }

  function restore() {
    try {
      var payload = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!payload) {
        return;
      }
      model.load(payload.cells || {});
      if (payload.selection) {
        selection.anchorRow = clamp(Number(payload.selection.anchorRow) || 0, 0, model.rowCount - 1);
        selection.anchorColumn = clamp(Number(payload.selection.anchorColumn) || 0, 0, model.columnCount - 1);
        selection.focusRow = clamp(Number(payload.selection.focusRow) || 0, 0, model.rowCount - 1);
        selection.focusColumn = clamp(Number(payload.selection.focusColumn) || 0, 0, model.columnCount - 1);
      }
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }
}());
