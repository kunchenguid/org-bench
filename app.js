(function () {
  const formulaApi = window.SpreadsheetFormula;
  const appHelpers = window.SpreadsheetAppHelpers;
  const editingUx = window.SpreadsheetEditingUX;
  const ROWS = 100;
  const COLS = 26;
  const STORAGE_PREFIX = (window.__RUN_STORAGE_NAMESPACE__ || 'facebook-spreadsheet') + ':sheet:';
  const HISTORY_LIMIT = 50;

  const state = {
    cells: {},
    selected: 'A1',
    rangeAnchor: 'A1',
    rangeEnd: 'A1',
    editing: null,
    editorValue: '',
    dragging: false,
    engine: formulaApi.createFormulaEngine({}),
    undoStack: [],
    redoStack: [],
    clipboard: null,
    headerMenu: null,
  };

  const dom = {
    grid: document.getElementById('grid-container'),
    formulaInput: document.getElementById('formula-input'),
    positionIndicator: document.getElementById('position-indicator'),
    statusbar: document.getElementById('statusbar'),
    headerMenu: null,
  };

  function init() {
    loadState();
    rebuildEngine();
    createHeaderMenu();
    renderGrid();
    renderAllCells();
    bindGlobalEvents();
    syncFormulaBar();
    focusSelectedCell();
  }

  function renderGrid() {
    const table = document.createElement('table');
    table.className = 'sheet';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);

    for (let column = 0; column < COLS; column += 1) {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.appendChild(createHeaderContent('column', column, formulaApi.columnIndexToName(column)));
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 1; row <= ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.appendChild(createHeaderContent('row', row - 1, String(row)));
      tr.appendChild(rowHeader);

      for (let column = 0; column < COLS; column += 1) {
        const cellId = formulaApi.columnIndexToName(column) + row;
        const td = document.createElement('td');
        td.className = 'cell';
        td.tabIndex = -1;
        td.dataset.cellId = cellId;
        const content = document.createElement('div');
        content.className = 'cell-content';
        td.appendChild(content);
        attachCellEvents(td);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    dom.grid.innerHTML = '';
    dom.grid.appendChild(table);
  }

  function createHeaderContent(kind, index, label) {
    const shell = document.createElement('div');
    shell.className = 'header-shell';

    const text = document.createElement('span');
    text.className = 'header-text';
    text.textContent = label;
    shell.appendChild(text);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'header-action-toggle';
    button.setAttribute('aria-label', (kind === 'column' ? 'Column ' : 'Row ') + label + ' actions');
    button.textContent = '...';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openHeaderMenu(kind, index, button);
    });
    shell.appendChild(button);

    return shell;
  }

  function createHeaderMenu() {
    const menu = document.createElement('div');
    menu.className = 'header-menu hidden';
    menu.innerHTML = [
      '<button type="button" data-action="insert-before"></button>',
      '<button type="button" data-action="insert-after"></button>',
      '<button type="button" data-action="delete"></button>',
    ].join('');
    menu.addEventListener('click', function (event) {
      const action = event.target.dataset.action;
      if (!action || !state.headerMenu) {
        return;
      }
      const menuState = state.headerMenu;
      closeHeaderMenu();
      if (action === 'insert-before') {
        applyStructuralChange(menuState.kind, menuState.index, 'insert');
      } else if (action === 'insert-after') {
        applyStructuralChange(menuState.kind, menuState.index + 1, 'insert');
      } else if (action === 'delete') {
        applyStructuralChange(menuState.kind, menuState.index, 'delete');
      }
    });
    document.body.appendChild(menu);
    dom.headerMenu = menu;
  }

  function openHeaderMenu(kind, index, button) {
    if (!dom.headerMenu) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const isColumn = kind === 'column';
    const buttons = dom.headerMenu.querySelectorAll('button');
    buttons[0].textContent = isColumn ? 'Insert column left' : 'Insert row above';
    buttons[1].textContent = isColumn ? 'Insert column right' : 'Insert row below';
    buttons[2].textContent = isColumn ? 'Delete column' : 'Delete row';
    dom.headerMenu.style.top = String(window.scrollY + rect.bottom + 6) + 'px';
    dom.headerMenu.style.left = String(window.scrollX + rect.left - 8) + 'px';
    dom.headerMenu.classList.remove('hidden');
    state.headerMenu = { kind: kind, index: index };
  }

  function closeHeaderMenu() {
    state.headerMenu = null;
    if (dom.headerMenu) {
      dom.headerMenu.classList.add('hidden');
    }
  }

  function attachCellEvents(cellEl) {
    cellEl.addEventListener('mousedown', function (event) {
      if (event.button !== 0) return;
      if (state.editing) {
        commitEdit(false);
      }
      const cellId = cellEl.dataset.cellId;
      state.dragging = true;
      if (event.shiftKey) {
        setRange(state.rangeAnchor, cellId, false);
      } else {
        setSelection(cellId, false);
      }
      renderSelection();
    });

    cellEl.addEventListener('mouseenter', function () {
      if (!state.dragging) return;
      setRange(state.rangeAnchor, cellEl.dataset.cellId, false);
      renderSelection();
    });

    cellEl.addEventListener('dblclick', function () {
      beginEdit(cellEl.dataset.cellId, getRaw(cellEl.dataset.cellId), 'cell', true);
    });
  }

  function bindGlobalEvents() {
    document.addEventListener('mouseup', function () {
      state.dragging = false;
    });

    document.addEventListener('click', function (event) {
      if (!dom.headerMenu || dom.headerMenu.classList.contains('hidden')) {
        return;
      }
      if (!dom.headerMenu.contains(event.target)) {
        closeHeaderMenu();
      }
    });

    document.addEventListener('keydown', handleKeydown);

    dom.formulaInput.addEventListener('focus', function () {
      beginEdit(state.selected, getRaw(state.selected), 'formula', true);
    });

    dom.formulaInput.addEventListener('input', function () {
      if (!state.editing) {
        beginEdit(state.selected, getRaw(state.selected), 'formula', true);
      }
      state.editorValue = dom.formulaInput.value;
      syncEditorInput();
    });

    dom.formulaInput.addEventListener('keydown', function (event) {
      const move = editingUx.getCommitMoveForKey(event.key);
      if (move) {
        event.preventDefault();
        commitEdit(true, move.dx, move.dy);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    document.addEventListener('copy', handleCopyCut.bind(null, false));
    document.addEventListener('cut', handleCopyCut.bind(null, true));
    document.addEventListener('paste', handlePaste);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && state.headerMenu) {
      closeHeaderMenu();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !state.editing) {
      const lower = event.key.toLowerCase();
      if (lower === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (lower === 'y') {
        event.preventDefault();
        redo();
        return;
      }
    }

    if (state.editing && state.editing.mode === 'cell') {
      const input = state.editing.input;
      if (document.activeElement !== input) return;
      const move = editingUx.getCommitMoveForKey(event.key);
      if (move) {
        event.preventDefault();
        commitEdit(true, move.dx, move.dy);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
      return;
    }

    if (state.editing && state.editing.mode === 'formula' && document.activeElement === dom.formulaInput) {
      return;
    }

    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      beginEdit(state.selected, getRaw(state.selected), 'cell', true);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelection();
      return;
    }

    const move = keyToOffset(event.key);
    if (move) {
      event.preventDefault();
      moveSelection(move.dx, move.dy, event.shiftKey);
      return;
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      beginEdit(state.selected, event.key, 'cell', false);
    }
  }

  function beginEdit(cellId, initialValue, mode, preserveValue) {
    state.selected = cellId;
    state.rangeAnchor = cellId;
    state.rangeEnd = cellId;
    state.editorValue = preserveValue ? initialValue : initialValue;
    destroyCellEditor();

    if (mode === 'cell') {
      const cellEl = getCellElement(cellId);
      const input = document.createElement('input');
      input.className = 'cell-editor';
      input.type = 'text';
      input.spellcheck = false;
      input.value = preserveValue ? getRaw(cellId) : initialValue;
      state.editorValue = input.value;
      cellEl.innerHTML = '';
      cellEl.appendChild(input);
      state.editing = { cellId: cellId, mode: 'cell', input: input, original: getRaw(cellId) };
      syncFormulaBar();
      renderSelection();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('input', function () {
        state.editorValue = input.value;
        syncFormulaBar();
      });
      return;
    }

    state.editing = { cellId: cellId, mode: 'formula', input: dom.formulaInput, original: getRaw(cellId) };
    dom.formulaInput.value = preserveValue ? getRaw(cellId) : initialValue;
    state.editorValue = dom.formulaInput.value;
    dom.formulaInput.focus();
    dom.formulaInput.setSelectionRange(dom.formulaInput.value.length, dom.formulaInput.value.length);
    renderSelection();
  }

  function commitEdit(moveAfter, dx, dy) {
    if (!state.editing) return;
    const cellId = state.editing.cellId;
    const previous = cloneCells(state.cells);
    const nextValue = state.editorValue;
    if (nextValue) {
      state.cells[cellId] = nextValue;
    } else {
      delete state.cells[cellId];
    }
    pushHistory(previous, cloneCells(state.cells));
    state.editing = null;
    rebuildEngine();
    saveState();
    renderAllCells();
    if (moveAfter) {
      moveSelection(dx, dy, false);
    } else {
      setSelection(cellId, false);
    }
  }

  function cancelEdit() {
    if (!state.editing) return;
    state.editing = null;
    renderCell(state.selected);
    syncFormulaBar();
    renderSelection();
    focusSelectedCell();
  }

  function destroyCellEditor() {
    if (state.editing && state.editing.mode === 'cell') {
      renderCell(state.editing.cellId);
    }
  }

  function syncEditorInput() {
    if (state.editing && state.editing.mode === 'cell' && state.editing.input.value !== state.editorValue) {
      state.editing.input.value = state.editorValue;
    }
  }

  function rebuildEngine() {
    state.engine = formulaApi.createFormulaEngine(state.cells);
  }

  function renderAllCells() {
    for (let row = 1; row <= ROWS; row += 1) {
      for (let column = 0; column < COLS; column += 1) {
        renderCell(formulaApi.columnIndexToName(column) + row);
      }
    }
    renderSelection();
    syncFormulaBar();
  }

  function renderCell(cellId) {
    const cellEl = getCellElement(cellId);
    if (!cellEl) return;
    if (state.editing && state.editing.mode === 'cell' && state.editing.cellId === cellId) {
      return;
    }

    cellEl.innerHTML = '';
    const content = document.createElement('div');
    content.className = 'cell-content';
    const computed = state.engine.getComputedCell(cellId);
    const displayValue = state.engine.getDisplayValue(cellId);
    content.textContent = displayValue;
    cellEl.appendChild(content);

    cellEl.classList.toggle('numeric', computed.type === 'number');
    cellEl.classList.toggle('error', computed.type === 'error');
  }

  function renderSelection() {
    const selectedRange = getSelectedRange();
    const allCells = dom.grid.querySelectorAll('.cell');
    allCells.forEach(function (cellEl) {
      const cellId = cellEl.dataset.cellId;
      cellEl.classList.toggle('active', cellId === state.selected);
      cellEl.classList.toggle('range', selectedRange.has(cellId));
    });
    dom.positionIndicator.textContent = state.selected;
  }

  function syncFormulaBar() {
    if (state.editing) {
      dom.formulaInput.value = state.editorValue;
    } else {
      dom.formulaInput.value = getRaw(state.selected);
    }
  }

  function focusSelectedCell() {
    const cellEl = getCellElement(state.selected);
    if (!cellEl) return;
    cellEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function moveSelection(dx, dy, extendRange) {
    const next = offsetCell(state.selected, dx, dy);
    if (extendRange) {
      setRange(state.rangeAnchor, next, false);
    } else {
      setSelection(next, false);
    }
    renderSelection();
    syncFormulaBar();
    focusSelectedCell();
    saveState();
  }

  function setSelection(cellId) {
    state.selected = cellId;
    state.rangeAnchor = cellId;
    state.rangeEnd = cellId;
    renderSelection();
    saveState();
  }

  function setRange(anchor, end) {
    state.rangeAnchor = anchor;
    state.rangeEnd = end;
    state.selected = end;
    saveState();
  }

  function getSelectedRange() {
    const anchor = formulaApi.parseCellId(state.rangeAnchor);
    const end = formulaApi.parseCellId(state.rangeEnd);
    const minColumn = Math.min(anchor.columnIndex, end.columnIndex);
    const maxColumn = Math.max(anchor.columnIndex, end.columnIndex);
    const minRow = Math.min(anchor.row, end.row);
    const maxRow = Math.max(anchor.row, end.row);
    const cells = new Set();
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        cells.add(formulaApi.columnIndexToName(column) + row);
      }
    }
    return cells;
  }

  function clearSelection() {
    const previous = cloneCells(state.cells);
    getSelectedRange().forEach(function (cellId) {
      delete state.cells[cellId];
    });
    pushHistory(previous, cloneCells(state.cells));
    rebuildEngine();
    saveState();
    renderAllCells();
  }

  function applyStructuralChange(kind, index, mode) {
    if (state.editing) {
      commitEdit(false);
    }
    closeHeaderMenu();
    const previous = cloneCells(state.cells);
    state.cells = rewriteCellsForStructure(state.cells, kind, index, mode);
    shiftSelectionForStructure(kind, index, mode);
    pushHistory(previous, cloneCells(state.cells));
    rebuildEngine();
    renderGrid();
    renderAllCells();
    saveState();
    focusSelectedCell();
    dom.statusbar.textContent = describeStructuralChange(kind, index, mode);
  }

  function rewriteCellsForStructure(cells, kind, index, mode) {
    const next = {};
    Object.entries(cells).forEach(function (entry) {
      const cellId = entry[0];
      const raw = entry[1];
      const parsed = formulaApi.parseCellId(cellId);

      if (kind === 'column') {
        if (mode === 'delete' && parsed.columnIndex === index && (typeof raw !== 'string' || raw.charAt(0) !== '=')) {
          return;
        }
        const nextColumn = mode === 'insert'
          ? (parsed.columnIndex >= index ? parsed.columnIndex + 1 : parsed.columnIndex)
          : (parsed.columnIndex > index ? parsed.columnIndex - 1 : parsed.columnIndex);
        if (nextColumn < 0 || nextColumn >= COLS) {
          return;
        }
        next[formulaApi.columnIndexToName(nextColumn) + parsed.row] = rewriteFormulaColumns(raw, index, mode);
        return;
      }

      const currentRow = parsed.row - 1;
      if (mode === 'delete' && currentRow === index && (typeof raw !== 'string' || raw.charAt(0) !== '=')) {
        return;
      }
      const nextRow = mode === 'insert'
        ? (currentRow >= index ? currentRow + 1 : currentRow)
        : (currentRow > index ? currentRow - 1 : currentRow);
      if (nextRow < 0 || nextRow >= ROWS) {
        return;
      }
      next[formulaApi.columnIndexToName(parsed.columnIndex) + String(nextRow + 1)] = rewriteFormulaRows(raw, index, mode);
    });
    return next;
  }

  function rewriteFormulaRows(raw, rowIndex, mode) {
    if (typeof raw !== 'string' || raw.charAt(0) !== '=') {
      return raw;
    }
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, absCol, colName, absRow, rowText) {
      if (absRow) {
        return match;
      }
      const currentRow = Number(rowText) - 1;
      if (mode === 'insert') {
        const nextRow = currentRow >= rowIndex ? currentRow + 1 : currentRow;
        return (absCol ? '$' : '') + colName + (absRow ? '$' : '') + String(nextRow + 1);
      }
      if (currentRow === rowIndex) {
        return '#REF!';
      }
      const nextRow = currentRow > rowIndex ? currentRow - 1 : currentRow;
      return (absCol ? '$' : '') + colName + (absRow ? '$' : '') + String(nextRow + 1);
    });
  }

  function rewriteFormulaColumns(raw, colIndex, mode) {
    if (typeof raw !== 'string' || raw.charAt(0) !== '=') {
      return raw;
    }
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, absCol, colName, absRow, rowText) {
      if (absCol) {
        return match;
      }
      const currentCol = formulaApi.columnNameToIndex(colName);
      if (mode === 'insert') {
        const nextCol = currentCol >= colIndex ? currentCol + 1 : currentCol;
        return (absCol ? '$' : '') + formulaApi.columnIndexToName(nextCol) + (absRow ? '$' : '') + rowText;
      }
      if (currentCol === colIndex) {
        return '#REF!';
      }
      const nextCol = currentCol > colIndex ? currentCol - 1 : currentCol;
      return (absCol ? '$' : '') + formulaApi.columnIndexToName(nextCol) + (absRow ? '$' : '') + rowText;
    });
  }

  function shiftSelectionForStructure(kind, index, mode) {
    state.selected = shiftCellId(state.selected, kind, index, mode);
    state.rangeAnchor = shiftCellId(state.rangeAnchor, kind, index, mode);
    state.rangeEnd = shiftCellId(state.rangeEnd, kind, index, mode);
  }

  function shiftCellId(cellId, kind, index, mode) {
    const parsed = formulaApi.parseCellId(cellId);
    let columnIndex = parsed.columnIndex;
    let rowIndex = parsed.row - 1;

    if (kind === 'column') {
      if (mode === 'insert' && columnIndex >= index) {
        columnIndex += 1;
      } else if (mode === 'delete') {
        if (columnIndex > index) {
          columnIndex -= 1;
        } else if (columnIndex === index) {
          columnIndex = Math.max(0, columnIndex - 1);
        }
      }
    } else if (mode === 'insert' && rowIndex >= index) {
      rowIndex += 1;
    } else if (mode === 'delete') {
      if (rowIndex > index) {
        rowIndex -= 1;
      } else if (rowIndex === index) {
        rowIndex = Math.max(0, rowIndex - 1);
      }
    }

    return formulaApi.columnIndexToName(clamp(columnIndex, 0, COLS - 1)) + String(clamp(rowIndex + 1, 1, ROWS));
  }

  function describeStructuralChange(kind, index, mode) {
    if (kind === 'column') {
      const label = formulaApi.columnIndexToName(clamp(index, 0, COLS - 1));
      return mode === 'insert' ? 'Inserted column near ' + label + '.' : 'Deleted column ' + label + '.';
    }
    return mode === 'insert' ? 'Inserted row near ' + String(index + 1) + '.' : 'Deleted row ' + String(index + 1) + '.';
  }

  function handleCopyCut(isCut, event) {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && state.editing) {
      return;
    }
    const grid = rangeToMatrix(getSelectedRange(), false);
    const text = grid.map(function (row) { return row.join('\t'); }).join('\n');
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    if (isCut) {
      state.lastCut = Array.from(getSelectedRange());
      clearSelection();
    } else {
      state.lastCut = null;
    }
  }

  function handlePaste(event) {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && state.editing) {
      return;
    }

    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const sourceRows = text.split(/\r?\n/).map(function (line) { return line.split('\t'); });
    const previous = cloneCells(state.cells);
    const targetRange = Array.from(getSelectedRange());
    const anchor = formulaApi.parseCellId(state.selected);
    const useMatchingRange = targetRange.length === sourceRows.length * sourceRows[0].length;
    const destinationStart = useMatchingRange ? formulaApi.parseCellId(state.rangeAnchor) : anchor;
    for (let rowOffset = 0; rowOffset < sourceRows.length; rowOffset += 1) {
      for (let colOffset = 0; colOffset < sourceRows[rowOffset].length; colOffset += 1) {
        const destinationId = formulaApi.columnIndexToName(clamp(destinationStart.columnIndex + colOffset, 0, COLS - 1)) + clamp(destinationStart.row + rowOffset, 1, ROWS);
        const sourceValue = sourceRows[rowOffset][colOffset] || '';
        state.cells[destinationId] = appHelpers.shiftFormulaForPaste(
          sourceValue,
          { row: anchor.row + rowOffset, col: anchor.columnIndex + colOffset },
          { row: destinationStart.row + rowOffset, col: destinationStart.columnIndex + colOffset },
          { maxCol: COLS - 1, maxRow: ROWS }
        );
      }
    }
    pushHistory(previous, cloneCells(state.cells));
    rebuildEngine();
    saveState();
    renderAllCells();
    state.lastCut = null;
  }

  function rangeToMatrix(rangeSet) {
    const cells = Array.from(rangeSet);
    const anchor = formulaApi.parseCellId(state.rangeAnchor);
    const end = formulaApi.parseCellId(state.rangeEnd);
    const minColumn = Math.min(anchor.columnIndex, end.columnIndex);
    const minRow = Math.min(anchor.row, end.row);
    const maxColumn = Math.max(anchor.columnIndex, end.columnIndex);
    const maxRow = Math.max(anchor.row, end.row);
    const matrix = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      const outputRow = [];
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const cellId = formulaApi.columnIndexToName(column) + row;
        outputRow.push(getRaw(cellId));
      }
      matrix.push(outputRow);
    }
    return matrix;
  }

  function undo() {
    const next = appHelpers.applyUndo(state.cells, state.undoStack, state.redoStack);
    if (next.cells === state.cells) return;
    state.cells = next.cells;
    state.undoStack = next.undoStack;
    state.redoStack = next.redoStack;
    rebuildEngine();
    saveState();
    renderAllCells();
  }

  function redo() {
    const next = appHelpers.applyRedo(state.cells, state.undoStack, state.redoStack);
    if (next.cells === state.cells) return;
    state.cells = next.cells;
    state.undoStack = next.undoStack;
    state.redoStack = next.redoStack;
    rebuildEngine();
    saveState();
    renderAllCells();
  }

  function pushHistory(before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    state.undoStack.push({ before: before, after: after });
    if (state.undoStack.length > HISTORY_LIMIT) {
      state.undoStack.shift();
    }
    state.redoStack = [];
  }

  function loadState() {
    try {
      const savedCells = localStorage.getItem(STORAGE_PREFIX + 'cells');
      const savedSelected = localStorage.getItem(STORAGE_PREFIX + 'selected');
      state.cells = savedCells ? JSON.parse(savedCells) : {};
      if (savedSelected) {
        state.selected = savedSelected;
        state.rangeAnchor = savedSelected;
        state.rangeEnd = savedSelected;
      }
    } catch (error) {
      state.cells = {};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_PREFIX + 'cells', JSON.stringify(state.cells));
    localStorage.setItem(STORAGE_PREFIX + 'selected', state.selected);
  }

  function getCellElement(cellId) {
    return dom.grid.querySelector('[data-cell-id="' + cellId + '"]');
  }

  function getRaw(cellId) {
    return Object.prototype.hasOwnProperty.call(state.cells, cellId) ? state.cells[cellId] : '';
  }

  function offsetCell(cellId, dx, dy) {
    const parsed = formulaApi.parseCellId(cellId);
    return formulaApi.columnIndexToName(clamp(parsed.columnIndex + dx, 0, COLS - 1)) + clamp(parsed.row + dy, 1, ROWS);
  }

  function keyToOffset(key) {
    if (key === 'ArrowUp') return { dx: 0, dy: -1 };
    if (key === 'ArrowDown') return { dx: 0, dy: 1 };
    if (key === 'ArrowLeft') return { dx: -1, dy: 0 };
    if (key === 'ArrowRight') return { dx: 1, dy: 0 };
    if (key === 'Tab') return { dx: 1, dy: 0 };
    return null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cloneCells(cells) {
    return appHelpers.cloneCells(cells);
  }

  init();
})();
