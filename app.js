(function () {
  var core = window.SpreadsheetCore;
  var FormulaEngine = window.FormulaEngine;
  var Structure = window.SpreadsheetStructure;
  var selectionApi = window.RangeSelection;
  var rowCount = 100;
  var columnCount = 26;
  var gridElement = document.getElementById('sheet-grid');
  var formulaInput = document.getElementById('formula-input');
  var insertRowButton = document.getElementById('insert-row-btn');
  var deleteRowButton = document.getElementById('delete-row-btn');
  var insertColumnButton = document.getElementById('insert-column-btn');
  var deleteColumnButton = document.getElementById('delete-column-btn');
  var undoButton = document.getElementById('undo-btn');
  var redoButton = document.getElementById('redo-btn');
  var namespace = core.resolveStorageNamespace(window);
  var storageKey = namespace + ':sheet-state';
  var state = loadState();
  rowCount = state.rowCount || rowCount;
  columnCount = state.columnCount || columnCount;
  var activeEditor = null;
  var formulaEngine = null;
  var dragAnchor = null;
  var pendingCut = null;
  var history = Structure && Structure.createHistory ? Structure.createHistory(50) : null;

  renderGrid();
  renderSelection();
  bindEvents();

  function defaultState() {
    return {
      rowCount: rowCount,
      columnCount: columnCount,
      selected: { row: 0, column: 0 },
      rangeAnchor: { row: 0, column: 0 },
      cells: {},
    };
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(storageKey);
      if (!saved) {
        return defaultState();
      }

      var parsed = JSON.parse(saved);
      if (!parsed || !parsed.selected || !parsed.cells) {
        return defaultState();
      }

      return {
        rowCount: Math.max(1, Number(parsed.rowCount) || rowCount),
        columnCount: Math.max(1, Number(parsed.columnCount) || columnCount),
        selected: {
          row: clamp(Number(parsed.selected.row) || 0, 0, rowCount - 1),
          column: clamp(Number(parsed.selected.column) || 0, 0, columnCount - 1),
        },
        rangeAnchor: parsed.rangeAnchor ? {
          row: clamp(Number(parsed.rangeAnchor.row) || 0, 0, rowCount - 1),
          column: clamp(Number(parsed.rangeAnchor.column) || 0, 0, columnCount - 1),
        } : {
          row: clamp(Number(parsed.selected.row) || 0, 0, rowCount - 1),
          column: clamp(Number(parsed.selected.column) || 0, 0, columnCount - 1),
        },
        cells: parsed.cells,
      };
    } catch (error) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function renderGrid() {
    var fragment = document.createDocumentFragment();
    gridElement.setAttribute('aria-rowcount', String(rowCount));
    gridElement.setAttribute('aria-colcount', String(columnCount));
    fragment.appendChild(makeCell('div', 'corner-cell'));

    for (var columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      var header = makeCell('div', 'col-header');
      header.setAttribute('role', 'columnheader');
      header.setAttribute('aria-colindex', String(columnIndex + 1));
      header.textContent = core.columnLabelFromIndex(columnIndex);
      fragment.appendChild(header);
    }

    for (var rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      var rowHeader = makeCell('div', 'row-header');
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.setAttribute('aria-rowindex', String(rowIndex + 1));
      rowHeader.textContent = String(rowIndex + 1);
      fragment.appendChild(rowHeader);

      for (var dataColumnIndex = 0; dataColumnIndex < columnCount; dataColumnIndex += 1) {
        var cell = makeCell('button', 'grid-cell');
        var cellId = core.cellIdFromPosition(rowIndex, dataColumnIndex);
        cell.type = 'button';
        cell.dataset.cellId = cellId;
        cell.dataset.row = String(rowIndex);
        cell.dataset.column = String(dataColumnIndex);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', cellId);
        cell.setAttribute('aria-rowindex', String(rowIndex + 1));
        cell.setAttribute('aria-colindex', String(dataColumnIndex + 1));
        cell.setAttribute('aria-selected', 'false');
        fragment.appendChild(cell);
      }
    }

    gridElement.innerHTML = '';
    gridElement.appendChild(fragment);
  }

  function bindEvents() {
    gridElement.addEventListener('pointerdown', handleGridPointerDown);
    gridElement.addEventListener('pointerover', handleGridPointerOver);
    gridElement.addEventListener('dblclick', handleGridDoubleClick);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);
    insertRowButton.addEventListener('click', function () { runStructuralAction('insert-row', Structure.insertRow, state.selected.row + 1); });
    deleteRowButton.addEventListener('click', function () { runStructuralAction('delete-row', Structure.deleteRow, state.selected.row + 1); });
    insertColumnButton.addEventListener('click', function () { runStructuralAction('insert-column', Structure.insertColumn, state.selected.column + 1); });
    deleteColumnButton.addEventListener('click', function () { runStructuralAction('delete-column', Structure.deleteColumn, state.selected.column + 1); });
    undoButton.addEventListener('click', handleUndo);
    redoButton.addEventListener('click', handleRedo);
    formulaInput.addEventListener('focus', syncFormulaBar);
    formulaInput.addEventListener('input', handleFormulaInput);
    formulaInput.addEventListener('keydown', handleFormulaKeydown);
    updateActionButtons();
  }

  function handleGridPointerDown(event) {
    var cell = event.target.closest('.grid-cell');
    if (!cell) {
      return;
    }

    var rowIndex = Number(cell.dataset.row);
    var columnIndex = Number(cell.dataset.column);
    dragAnchor = event.shiftKey ? getAnchorPosition() : { row: rowIndex, column: columnIndex };
    setSelection(dragAnchor, { row: rowIndex, column: columnIndex });
    event.preventDefault();
  }

  function handleGridPointerOver(event) {
    var cell;
    if (!dragAnchor || event.buttons === 0) {
      return;
    }

    cell = event.target.closest('.grid-cell');
    if (!cell) {
      return;
    }

    setSelection(dragAnchor, {
      row: Number(cell.dataset.row),
      column: Number(cell.dataset.column),
    });
  }

  function handlePointerUp() {
    dragAnchor = null;
  }

  function handleGridDoubleClick(event) {
    var cell = event.target.closest('.grid-cell');
    if (!cell) {
      return;
    }

    setSelection(
      { row: Number(cell.dataset.row), column: Number(cell.dataset.column) },
      { row: Number(cell.dataset.row), column: Number(cell.dataset.column) }
    );
    startEditing();
  }

  function handleDocumentKeydown(event) {
    if (activeEditor) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        handleRedo();
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === 'z') {
        handleUndo();
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === 'y') {
        handleRedo();
        event.preventDefault();
        return;
      }
    }

    if (event.target === formulaInput) {
      return;
    }

    var handled = true;
    if (event.shiftKey && isArrowKey(event.key)) {
      extendSelection(event.key);
    } else if (event.key === 'ArrowUp') {
      moveSelection(-1, 0);
    } else if (event.key === 'ArrowDown') {
      moveSelection(1, 0);
    } else if (event.key === 'ArrowLeft') {
      moveSelection(0, -1);
    } else if (event.key === 'ArrowRight') {
      moveSelection(0, 1);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      clearSelectedRange();
    } else if (event.key === 'Enter' || event.key === 'F2') {
      startEditing();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      startEditing(event.key, true);
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  }

  function handleFormulaInput() {
    var cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    setRawValue(cellId, formulaInput.value);
    updateCellDisplay(cellId);
    saveState();
  }

  function handleFormulaKeydown(event) {
    if (event.key === 'Enter') {
      moveSelection(1, 0);
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      syncFormulaBar();
      event.preventDefault();
    }
  }

  function handleCopy(event) {
    var clipboardText;

    if (!canHandleClipboard(event)) {
      return;
    }

    clipboardText = selectionApi.serializeClipboardBlock(copySelectedBlock());
    pendingCut = null;
    event.clipboardData.setData('text/plain', clipboardText);
    event.preventDefault();
  }

  function handleCut(event) {
    var clipboardText;

    if (!canHandleClipboard(event)) {
      return;
    }

    clipboardText = selectionApi.serializeClipboardBlock(copySelectedBlock());
    pendingCut = {
      block: copySelectedBlock(),
      range: getCurrentRange(),
      text: clipboardText,
    };
    event.clipboardData.setData('text/plain', clipboardText);
    event.preventDefault();
  }

  function handlePaste(event) {
    var block;
    var clipboardText;
    var movePlan;

    if (!canHandleClipboard(event)) {
      return;
    }

    clipboardText = event.clipboardData.getData('text/plain');
    block = selectionApi.parseClipboardText(clipboardText);
    if (!block.length) {
      pendingCut = null;
      event.preventDefault();
      return;
    }

    if (pendingCut && pendingCut.text === clipboardText) {
      movePlan = selectionApi.planCutMove(pendingCut.block, pendingCut.range, getPasteTarget(block), {
        adjustCell: adjustPastedCell,
      });
      applyOperations(movePlan.pasteOperations.concat(movePlan.clearOperations));
      pendingCut = null;
      event.preventDefault();
      return;
    }

    pendingCut = null;
    applyOperations(selectionApi.planPaste(block, getPasteTarget(block), {
      // Formula shifting belongs to the formula subsystem. For now this keeps
      // paste wiring isolated while exposing a stable hook for relative refs.
      adjustCell: adjustPastedCell,
    }));
    event.preventDefault();
  }

  function moveSelection(rowDelta, columnDelta) {
    var nextRow = clamp(state.selected.row + rowDelta, 0, rowCount - 1);
    var nextColumn = clamp(state.selected.column + columnDelta, 0, columnCount - 1);
    setSelection({ row: nextRow, column: nextColumn }, { row: nextRow, column: nextColumn });
  }

  function extendSelection(key) {
    var nextSelection = selectionApi.extendSelectionWithArrow(getSelectionModel(), key, {
      rows: rowCount,
      cols: columnCount,
    });
    setSelection(fromSelectionPoint(nextSelection.anchor), fromSelectionPoint(nextSelection.focus));
  }

  function setSelection(anchorPosition, focusPosition) {
    state.rangeAnchor = { row: anchorPosition.row, column: anchorPosition.column };
    state.selected = { row: focusPosition.row, column: focusPosition.column };
    renderSelection();
    saveState();
  }

  function renderSelection() {
    var previous = gridElement.querySelectorAll('.grid-cell.is-selected, .grid-cell.is-in-range');
    var currentSelection = getSelectionModel();
    var rowIndex;
    var columnIndex;
    var cellId;
    var current;
    var index;

    for (index = 0; index < previous.length; index += 1) {
      previous[index].classList.remove('is-selected', 'is-in-range');
    }

    for (rowIndex = currentSelection.range.startRow - 1; rowIndex < currentSelection.range.endRow; rowIndex += 1) {
      for (columnIndex = currentSelection.range.startCol - 1; columnIndex < currentSelection.range.endCol; columnIndex += 1) {
        cellId = core.cellIdFromPosition(rowIndex, columnIndex);
        current = gridElement.querySelector('[data-cell-id="' + cellId + '"]');
        if (current) {
          current.classList.add('is-in-range');
          current.setAttribute('aria-selected', 'true');
        }
      }
    }

    cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    current = gridElement.querySelector('[data-cell-id="' + cellId + '"]');
    if (current) {
      current.classList.add('is-selected');
      current.setAttribute('aria-selected', 'true');
      current.focus();
    }

    syncFormulaBar();
    refreshGridValues();
    updateActionButtons();
  }

  function refreshGridValues() {
    formulaEngine = createFormulaEngine();
    var cellElements = gridElement.querySelectorAll('.grid-cell');
    for (var index = 0; index < cellElements.length; index += 1) {
      updateCellDisplay(cellElements[index].dataset.cellId);
    }
  }

  function updateCellDisplay(cellId) {
    var cellElement = gridElement.querySelector('[data-cell-id="' + cellId + '"]');
    if (!cellElement || cellElement === activeEditor) {
      return;
    }

    cellElement.classList.remove('is-editing');
    cellElement.textContent = getDisplayValue(cellId);
  }

  function getDisplayValue(cellId) {
    var raw = state.cells[cellId] || '';
    if (!raw) {
      return '';
    }

    return getCellResult(cellId).display;
  }

  function syncFormulaBar() {
    var cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    formulaInput.value = state.cells[cellId] || '';
  }

  function startEditing(seedValue, replaceContents) {
    var cellId = core.cellIdFromPosition(state.selected.row, state.selected.column);
    var cellElement = gridElement.querySelector('[data-cell-id="' + cellId + '"]');
    if (!cellElement || activeEditor) {
      return;
    }

    var originalValue = state.cells[cellId] || '';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = replaceContents ? (seedValue || '') : originalValue;
    cellElement.classList.add('is-editing');
    cellElement.textContent = '';
    cellElement.appendChild(input);
    activeEditor = cellElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('input', function () {
      formulaInput.value = input.value;
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        commitEditor(input.value);
        moveSelection(1, 0);
        event.preventDefault();
        return;
      }

      if (event.key === 'Tab') {
        commitEditor(input.value);
        moveSelection(0, 1);
        event.preventDefault();
        return;
      }

      if (event.key === 'Escape') {
        closeEditor(originalValue);
        event.preventDefault();
      }
    });

    input.addEventListener('blur', function () {
      if (activeEditor) {
        commitEditor(input.value);
      }
    });
  }

  function commitEditor(value) {
    if (!activeEditor) {
      return;
    }

    var cellId = activeEditor.dataset.cellId;
    setRawValue(cellId, value);
    closeEditor(value);
    saveState();
  }

  function closeEditor(value) {
    if (!activeEditor) {
      return;
    }

    var cellId = activeEditor.dataset.cellId;
    activeEditor.classList.remove('is-editing');
    activeEditor.innerHTML = '';
    activeEditor.textContent = value;
    activeEditor = null;
    updateCellDisplay(cellId);
    syncFormulaBar();
  }

  function setRawValue(cellId, value) {
    formulaEngine = null;
    if (value) {
      state.cells[cellId] = value;
      return;
    }

    delete state.cells[cellId];
  }

  function makeCell(tagName, className) {
    var element = document.createElement(tagName);
    element.className = className;
    return element;
  }

  function createFormulaEngine() {
    if (!FormulaEngine) {
      return null;
    }

    return new FormulaEngine({
      getCell: function (address) {
        return state.cells[address] || '';
      },
    });
  }

  function getCellResult(cellId) {
    if (!formulaEngine) {
      formulaEngine = createFormulaEngine();
    }

    if (!formulaEngine) {
      return {
        display: state.cells[cellId] || '',
      };
    }

    return formulaEngine.evaluateCell(cellId);
  }

  function getStructureState() {
    return Structure.createEmptyState({
      rowCount: rowCount,
      columnCount: columnCount,
      cells: state.cells,
    });
  }

  function runStructuralAction(label, operation, index) {
    var before;
    var after;

    if (!Structure || typeof operation !== 'function') {
      return;
    }

    before = getStructureState();
    after = operation(before, index);
    if (history) {
      history.record(before, after, label);
    }
    applyStructureState(after);
  }

  function applyStructureState(nextState) {
    rowCount = nextState.rowCount;
    columnCount = nextState.columnCount;
    state.rowCount = rowCount;
    state.columnCount = columnCount;
    state.cells = nextState.cells;
    state.selected = {
      row: clamp(state.selected.row, 0, rowCount - 1),
      column: clamp(state.selected.column, 0, columnCount - 1),
    };
    state.rangeAnchor = {
      row: clamp(getAnchorPosition().row, 0, rowCount - 1),
      column: clamp(getAnchorPosition().column, 0, columnCount - 1),
    };
    formulaEngine = null;
    renderGrid();
    renderSelection();
    saveState();
  }

  function handleUndo() {
    var entry;
    if (!history) {
      return;
    }
    entry = history.undo();
    if (entry) {
      applyStructureState(entry.state);
    }
  }

  function handleRedo() {
    var entry;
    if (!history) {
      return;
    }
    entry = history.redo();
    if (entry) {
      applyStructureState(entry.state);
    }
  }

  function updateActionButtons() {
    if (!Structure) {
      return;
    }

    deleteRowButton.disabled = rowCount <= 1;
    deleteColumnButton.disabled = columnCount <= 1;
    undoButton.disabled = !history || !history.canUndo();
    redoButton.disabled = !history || !history.canRedo();
  }

  function canHandleClipboard(event) {
    if (activeEditor || event.target === formulaInput) {
      return false;
    }

    return Boolean(event.clipboardData);
  }

  function copySelectedBlock() {
    return selectionApi.copyRange(buildSelectionMap(), getCurrentRange());
  }

  function buildSelectionMap() {
    var map = new Map();
    var cellIds = Object.keys(state.cells);
    var index;
    var cellId;
    var position;

    for (index = 0; index < cellIds.length; index += 1) {
      cellId = cellIds[index];
      position = positionFromCellId(cellId);
      if (position) {
        map.set((position.row + 1) + ':' + (position.column + 1), { raw: state.cells[cellId] });
      }
    }

    return map;
  }

  function getSelectionModel() {
    return selectionApi.buildRangeSelection(toSelectionPoint(getAnchorPosition()), toSelectionPoint(state.selected));
  }

  function getCurrentRange() {
    return getSelectionModel().range;
  }

  function getAnchorPosition() {
    return state.rangeAnchor || state.selected;
  }

  function getPasteTarget(block) {
    var range = getCurrentRange();
    var selectedRows = range.endRow - range.startRow + 1;
    var selectedColumns = range.endCol - range.startCol + 1;
    var blockRows = block.length;
    var blockColumns = block[0] ? block[0].length : 0;

    if (selectedRows === blockRows && selectedColumns === blockColumns) {
      return range;
    }

    return toSelectionPoint(state.selected);
  }

  function applyOperations(operations) {
    var index;
    var operation;
    var cellId;

    for (index = 0; index < operations.length; index += 1) {
      operation = operations[index];
      cellId = core.cellIdFromPosition(operation.row - 1, operation.col - 1);
      setRawValue(cellId, operation.raw);
    }

    refreshGridValues();
    syncFormulaBar();
    saveState();
  }

  function clearSelectedRange() {
    applyOperations(selectionApi.planClearRange(getCurrentRange()));
  }

  function adjustPastedCell(context) {
    return context.raw;
  }

  function toSelectionPoint(position) {
    return {
      row: position.row + 1,
      col: position.column + 1,
    };
  }

  function fromSelectionPoint(point) {
    return {
      row: point.row - 1,
      column: point.col - 1,
    };
  }

  function isArrowKey(key) {
    return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
  }

  function positionFromCellId(cellId) {
    var match = /^([A-Z]+)(\d+)$/.exec(cellId);
    var columnLabel;
    var rowNumber;
    var columnIndex;
    var index;

    if (!match) {
      return null;
    }

    columnLabel = match[1];
    rowNumber = Number(match[2]) - 1;
    columnIndex = 0;
    for (index = 0; index < columnLabel.length; index += 1) {
      columnIndex = (columnIndex * 26) + (columnLabel.charCodeAt(index) - 64);
    }

    return {
      row: rowNumber,
      column: columnIndex - 1,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}());
