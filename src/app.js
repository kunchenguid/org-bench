(function () {
  const engine = window.SpreadsheetEngine;
  const historyApi = window.SpreadsheetHistory;
  const selection = window.SpreadsheetSelection;
  const MAX_COLUMNS = 26;
  const MAX_ROWS = 100;
  const namespace = window.__BENCHMARK_STORAGE_NAMESPACE__ || window.BENCHMARK_STORAGE_NAMESPACE || 'amazon-sheet';
  const storageKey = namespace + ':sheet-state';

  const grid = document.getElementById('sheet-grid');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');

  const storedState = loadState();
  const sheet = engine.createEmptySheet(storedState.cells);
  const history = historyApi.createHistory();
  let activeCell = storedState.activeCell || 'A1';
  let rangeAnchorCell = storedState.rangeAnchorCell || activeCell;
  let editingCell = null;
  let editOriginalValue = '';
  let clipboard = null;
  let isDraggingSelection = false;

  buildGrid();
  refreshAllCells();
  updateSelection();

  document.addEventListener('mouseup', function () {
    isDraggingSelection = false;
  });

  formulaInput.addEventListener('focus', function () {
    formulaInput.select();
  });

  formulaInput.addEventListener('input', function () {
    if (editingCell && editingCell !== activeCell) {
      finishEdit(true, false);
    }
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitFormulaBar('down');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitFormulaBar(event.shiftKey ? 'left' : 'right');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      formulaInput.value = engine.getCellRaw(sheet, activeCell);
      formulaInput.blur();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.target === formulaInput || (event.target && event.target.tagName === 'INPUT' && event.target.dataset.editorCell)) {
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(event.key, event.shiftKey);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      startEditing(activeCell, engine.getCellRaw(sheet, activeCell));
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      startEditing(activeCell, engine.getCellRaw(sheet, activeCell));
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelection();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const lowerKey = event.key.toLowerCase();
      if (lowerKey === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoLastAction();
        } else {
          undoLastAction();
        }
        return;
      }
      if (lowerKey === 'y') {
        event.preventDefault();
        redoLastAction();
        return;
      }
      if (lowerKey === 'c') {
        event.preventDefault();
        copyActiveCell(false);
        return;
      }
      if (lowerKey === 'x') {
        event.preventDefault();
        copyActiveCell(true);
        return;
      }
      if (lowerKey === 'v') {
        event.preventDefault();
        pasteIntoActiveCell();
        return;
      }
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      startEditing(activeCell, event.key);
    }
  });

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || { cells: {}, activeCell: 'A1', rangeAnchorCell: 'A1' };
    } catch (error) {
      return { cells: {}, activeCell: 'A1', rangeAnchorCell: 'A1' };
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify({
      cells: sheet.cells,
      activeCell: activeCell,
      rangeAnchorCell: rangeAnchorCell,
    }));
  }

  function buildGrid() {
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);
    for (let column = 1; column <= MAX_COLUMNS; column += 1) {
      const header = document.createElement('th');
      header.className = 'column-header';
      header.textContent = columnToLabel(column);
      headerRow.appendChild(header);
    }
    grid.appendChild(headerRow);

    for (let row = 1; row <= MAX_ROWS; row += 1) {
      const rowElement = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row);
      rowElement.appendChild(rowHeader);
      for (let column = 1; column <= MAX_COLUMNS; column += 1) {
        const address = columnToLabel(column) + row;
        const cell = document.createElement('td');
        cell.className = 'cell';
        cell.dataset.address = address;

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.address = address;
        button.addEventListener('mousedown', function (event) {
          isDraggingSelection = true;
          selectCell(address, event.shiftKey);
        });
        button.addEventListener('mouseenter', function () {
          if (isDraggingSelection) {
            selectCell(address, true);
          }
        });
        button.addEventListener('click', function (event) {
          selectCell(address, event.shiftKey || isDraggingSelection);
          isDraggingSelection = false;
        });
        button.addEventListener('dblclick', function () {
          startEditing(address, engine.getCellRaw(sheet, address));
        });

        cell.appendChild(button);
        rowElement.appendChild(cell);
      }
      grid.appendChild(rowElement);
    }
  }

  function refreshAllCells() {
    const buttons = grid.querySelectorAll('.cell button');
    buttons.forEach(function (button) {
      const address = button.dataset.address;
      refreshCell(address);
    });
    formulaInput.value = engine.getCellRaw(sheet, activeCell);
  }

  function refreshCell(address) {
    const cell = getCellElement(address);
    if (!cell) {
      return;
    }
    const button = cell.querySelector('button');
    const display = engine.getDisplayValue(sheet, address);
    button.textContent = display;
    cell.classList.toggle('error', display.charAt(0) === '#');
    cell.classList.toggle('numeric', typeof engine.getCellValue(sheet, address) === 'number');
  }

  function selectCell(address, keepRange) {
    if (editingCell && editingCell !== address) {
      finishEdit(true, false);
    }
    activeCell = address;
    if (!keepRange) {
      rangeAnchorCell = address;
    }
    updateSelection();
    saveState();
  }

  function updateSelection() {
    grid.querySelectorAll('.cell.active').forEach(function (cell) {
      cell.classList.remove('active');
    });
    grid.querySelectorAll('.cell.in-range').forEach(function (cell) {
      cell.classList.remove('in-range');
    });
    selection.listAddressesInRange(rangeAnchorCell, activeCell).forEach(function (address) {
      const selectedCell = getCellElement(address);
      if (selectedCell) {
        selectedCell.classList.add('in-range');
      }
    });
    const cell = getCellElement(activeCell);
    if (cell) {
      cell.classList.add('active');
      cell.querySelector('button').focus({ preventScroll: true });
    }
    nameBox.textContent = activeCell;
    formulaInput.value = engine.getCellRaw(sheet, activeCell);
  }

  function startEditing(address, initialValue) {
    selectCell(address, false);
    editingCell = address;
    editOriginalValue = engine.getCellRaw(sheet, address);
    const cell = getCellElement(address);
    const button = cell.querySelector('button');
    button.hidden = true;

    const input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    input.dataset.editorCell = address;
    input.value = initialValue;
    cell.appendChild(input);
    formulaInput.value = input.value;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('input', function () {
      formulaInput.value = input.value;
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        finishEdit(true, true);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        finishEdit(true, false, 'right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finishEdit(false, false);
      }
    });

    input.addEventListener('blur', function () {
      if (editingCell === address) {
        finishEdit(true, false);
      }
    });
  }

  function finishEdit(shouldCommit, moveDown, direction) {
    if (!editingCell) {
      return;
    }
    const address = editingCell;
    const cell = getCellElement(address);
    const input = cell.querySelector('input');
    const nextValue = shouldCommit ? input.value : editOriginalValue;
    input.remove();
    cell.querySelector('button').hidden = false;
    editingCell = null;
    setRawValue(address, nextValue, false);
    selectCell(address, false);
    if (shouldCommit && moveDown) {
      moveSelection('ArrowDown');
    } else if (shouldCommit && direction) {
      moveSelection(direction === 'right' ? 'ArrowRight' : 'ArrowLeft');
    }
  }

  function commitFormulaBar(moveDirection) {
    if (editingCell) {
      const input = getCellElement(editingCell).querySelector('input');
      input.value = formulaInput.value;
      finishEdit(true, false, moveDirection === 'right' ? 'right' : null);
      if (moveDirection === 'down') {
        moveSelection('ArrowDown');
      }
      return;
    }
    setRawValue(activeCell, formulaInput.value);
    if (moveDirection === 'down') {
      moveSelection('ArrowDown');
    } else if (moveDirection === 'right') {
      moveSelection('ArrowRight');
    }
  }

  function setRawValue(address, raw, preserveSelection) {
    const before = {};
    const after = {};
    before[address] = engine.getCellRaw(sheet, address);
    after[address] = raw == null ? '' : String(raw);
    applyAction(before, after, preserveSelection !== false ? address : null, true);
  }

  function moveSelection(key, extendRange) {
    const directions = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const direction = directions[key] || key;
    selectCell(engine.stepAddress(activeCell, direction, MAX_COLUMNS, MAX_ROWS), extendRange);
  }

  function clearSelection() {
    const before = captureSnapshot(selection.listAddressesInRange(rangeAnchorCell, activeCell));
    const after = {};
    Object.keys(before).forEach(function (address) {
      after[address] = '';
    });
    applyAction(before, after, null, true);
  }

  function getCellElement(address) {
    return grid.querySelector('.cell[data-address="' + address + '"]');
  }

  function copyActiveCell(isCut) {
    clipboard = {
      raw: engine.getCellRaw(sheet, activeCell),
      source: activeCell,
      cut: isCut,
    };
  }

  function pasteIntoActiveCell() {
    if (!clipboard) {
      return;
    }

    const sourcePosition = parseAddress(clipboard.source);
    const targetPosition = parseAddress(activeCell);
    let nextRaw = clipboard.raw;

    if (nextRaw && nextRaw.charAt(0) === '=') {
      nextRaw = engine.shiftFormulaReferences(
        nextRaw,
        targetPosition.row - sourcePosition.row,
        targetPosition.column - sourcePosition.column
      );
    }

    const before = captureSnapshot([activeCell].concat(clipboard.cut && clipboard.source !== activeCell ? [clipboard.source] : []));
    const after = {};
    after[activeCell] = nextRaw;

    if (clipboard.cut && clipboard.source !== activeCell) {
      after[clipboard.source] = '';
      clipboard = null;
    }
    applyAction(before, after, activeCell, true);
  }

  function undoLastAction() {
    const action = historyApi.undo(history);
    if (action) {
      applyAction(action.after, action.before, null, false);
    }
  }

  function redoLastAction() {
    const action = historyApi.redo(history);
    if (action) {
      applyAction(action.before, action.after, null, false);
    }
  }

  function captureSnapshot(addresses) {
    return addresses.reduce(function (snapshot, address) {
      snapshot[address] = engine.getCellRaw(sheet, address);
      return snapshot;
    }, {});
  }

  function applyAction(before, after, selectionAddress, recordHistory) {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }

    Object.keys(after).forEach(function (address) {
      engine.setCell(sheet, address, after[address]);
    });
    refreshAllCells();
    if (selectionAddress) {
      selectCell(selectionAddress, false);
    } else {
      updateSelection();
      saveState();
    }
    if (recordHistory) {
      historyApi.recordAction(history, { before: before, after: after });
    }
  }

  function parseAddress(address) {
    return selection.parseAddress(address);
  }
  function labelToColumn(label) {
    let total = 0;
    for (let index = 0; index < label.length; index += 1) {
      total = total * 26 + (label.charCodeAt(index) - 64);
    }
    return total;
  }
})();
