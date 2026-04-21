(function () {
  const engine = window.SpreadsheetFormulaEngine;
  const clipboardUtils = window.SpreadsheetClipboardUtils;
  const structuralUtils = window.SpreadsheetStructuralUtils;
  const COLS = 26;
  const ROWS = 100;
  const MAX_HISTORY = 50;
  const STORAGE_PREFIX = getStorageNamespace();
  const STORAGE_KEY = STORAGE_PREFIX + ':apple-sheet:v1';

  const state = {
    cells: {},
    selection: { anchorRow: 0, anchorCol: 0, focusRow: 0, focusCol: 0 },
    editing: null,
    dragActive: false,
    clipboardPayload: null,
    undoStack: [],
    redoStack: [],
    pendingCut: null,
  };

  const spreadsheet = document.getElementById('spreadsheet');
  const formulaBar = document.getElementById('formula-bar');
  const headerMenu = document.getElementById('header-menu');
  const nameBox = document.getElementById('name-box');
  const table = buildTable();
  spreadsheet.appendChild(table);

  restoreState();
  bindEvents();
  render();

  function getStorageNamespace() {
    const candidates = [
      window.__RUN_STORAGE_NAMESPACE__,
      window.RUN_STORAGE_NAMESPACE,
      window.__BENCHMARK_STORAGE_NAMESPACE__,
      window.BENCHMARK_STORAGE_NAMESPACE,
      document.body && document.body.dataset && document.body.dataset.storageNamespace,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      if (typeof candidates[i] === 'string' && candidates[i].trim()) {
        return candidates[i].trim();
      }
    }

    return 'apple-sheet-local';
  }

  function buildTable() {
    const tableEl = document.createElement('table');
    tableEl.className = 'spreadsheet-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner-cell';
    headerRow.appendChild(corner);

    for (let col = 0; col < COLS; col += 1) {
      const th = document.createElement('th');
      th.className = 'column-header';
      th.textContent = engine.indexToColumn(col);
      th.dataset.col = String(col);
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      rowHeader.dataset.row = String(row);
      tr.appendChild(rowHeader);

      for (let col = 0; col < COLS; col += 1) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        const content = document.createElement('div');
        content.className = 'cell-content';
        td.appendChild(content);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    tableEl.appendChild(tbody);
    return tableEl;
  }

  function bindEvents() {
    table.addEventListener('mousedown', handleTableMouseDown);
    table.addEventListener('dblclick', handleTableDoubleClick);
    table.addEventListener('click', handleTableClick);
    table.addEventListener('contextmenu', handleHeaderContextMenu);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);
    formulaBar.addEventListener('focus', syncFormulaBar);
    formulaBar.addEventListener('input', function () {
      if (!state.editing) {
        state.editing = { row: state.selection.focusRow, col: state.selection.focusCol, draft: formulaBar.value, original: getRaw(state.selection.focusRow, state.selection.focusCol), viaFormulaBar: true };
      } else {
        state.editing.draft = formulaBar.value;
      }
      render();
    });
    formulaBar.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEditing('down');
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
    window.addEventListener('beforeunload', persistState);
  }

  function handleTableClick(event) {
    const columnHeader = event.target.closest('.column-header');
    if (columnHeader) {
      event.preventDefault();
      openHeaderMenu('col', Number(columnHeader.dataset.col), columnHeader.getBoundingClientRect());
      return;
    }
    const rowHeader = event.target.closest('.row-header');
    if (rowHeader) {
      event.preventDefault();
      openHeaderMenu('row', Number(rowHeader.dataset.row), rowHeader.getBoundingClientRect());
      return;
    }

    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!event.shiftKey) {
      selectSingleCell(row, col);
    }
  }

  function handleHeaderContextMenu(event) {
    const columnHeader = event.target.closest('.column-header');
    const rowHeader = event.target.closest('.row-header');
    if (!columnHeader && !rowHeader) {
      return;
    }
    event.preventDefault();
    if (columnHeader) {
      openHeaderMenu('col', Number(columnHeader.dataset.col), columnHeader.getBoundingClientRect());
      return;
    }
    openHeaderMenu('row', Number(rowHeader.dataset.row), rowHeader.getBoundingClientRect());
  }

  function handleDocumentClick(event) {
    if (!headerMenu.hidden && !headerMenu.contains(event.target) && !event.target.closest('.row-header') && !event.target.closest('.column-header')) {
      closeHeaderMenu();
    }
  }

  function handleTableMouseDown(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }

    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (event.shiftKey) {
      extendSelection(row, col);
    } else {
      selectSingleCell(row, col);
    }
    state.dragActive = true;
  }

  function handleDocumentMouseMove(event) {
    if (!state.dragActive || state.editing) {
      return;
    }
    const cell = event.target.closest && event.target.closest('.cell');
    if (!cell) {
      return;
    }
    extendSelection(Number(cell.dataset.row), Number(cell.dataset.col));
  }

  function handleDocumentMouseUp() {
    state.dragActive = false;
  }

  function handleTableDoubleClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    startEditing(Number(cell.dataset.row), Number(cell.dataset.col), getRaw(Number(cell.dataset.row), Number(cell.dataset.col)));
  }

  function handleKeyDown(event) {
    if (isEditingCell()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
      return;
    }

    if (isPlatformShortcut(event, 'z')) {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if (isPlatformShortcut(event, 'y')) {
      event.preventDefault();
      redo();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      startEditing(state.selection.focusRow, state.selection.focusCol, getRaw(state.selection.focusRow, state.selection.focusCol));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      startEditing(state.selection.focusRow, state.selection.focusCol, getRaw(state.selection.focusRow, state.selection.focusCol));
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      moveSelection(0, event.shiftKey ? -1 : 1, false);
      return;
    }

    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const delta = arrowDelta(event.key);
      moveSelection(delta.row, delta.col, event.shiftKey);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      startEditing(state.selection.focusRow, state.selection.focusCol, event.key, true);
    }
  }

  function handleCopy(event) {
    if (isEditingCell()) {
      return;
    }
    const payload = buildClipboardPayload();
    event.preventDefault();
    event.clipboardData.setData('text/plain', payload.text);
    state.clipboardPayload = payload;
    state.pendingCut = null;
  }

  function handleCut(event) {
    if (isEditingCell()) {
      return;
    }
    const payload = buildClipboardPayload();
    event.preventDefault();
    event.clipboardData.setData('text/plain', payload.text);
    state.clipboardPayload = payload;
    state.pendingCut = payload;
  }

  function handlePaste(event) {
    if (isEditingCell()) {
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    event.preventDefault();
    applyPastedText(text);
  }

  function buildClipboardPayload() {
    return clipboardUtils.buildClipboardPayload(selectionBounds(), getRaw);
  }

  function applyPastedText(text) {
    const translated = clipboardUtils.translatePaste({
      text: text,
      targetRow: state.selection.focusRow,
      targetCol: state.selection.focusCol,
      selection: selectionBounds(),
      sourcePayload: state.clipboardPayload,
      pendingCut: state.pendingCut,
    });

    if (!translated.writes.length) {
      return;
    }

    pushHistory();

    translated.writes.forEach(function (cell) {
      if (isInsideGrid(cell.row, cell.col)) {
        setRaw(cell.row, cell.col, cell.raw);
      }
    });

    translated.clears.forEach(function (cell) {
      if (isInsideGrid(cell.row, cell.col)) {
        setRaw(cell.row, cell.col, '');
      }
    });

    if (state.pendingCut && state.pendingCut.text === text) {
      state.pendingCut = null;
    }

    state.selection = {
      anchorRow: Math.max(0, Math.min(ROWS - 1, translated.selection.minRow)),
      anchorCol: Math.max(0, Math.min(COLS - 1, translated.selection.minCol)),
      focusRow: Math.max(0, Math.min(ROWS - 1, translated.selection.maxRow)),
      focusCol: Math.max(0, Math.min(COLS - 1, translated.selection.maxCol)),
    };
    persistState();
    render();
  }

  function selectSingleCell(row, col) {
    if (!isInsideGrid(row, col)) {
      return;
    }
    if (state.editing && (state.editing.row !== row || state.editing.col !== col)) {
      commitEditing();
    }
    state.selection = { anchorRow: row, anchorCol: col, focusRow: row, focusCol: col };
    syncFormulaBar();
    render();
  }

  function extendSelection(row, col) {
    if (state.editing) {
      commitEditing();
    }
    state.selection.focusRow = clamp(row, 0, ROWS - 1);
    state.selection.focusCol = clamp(col, 0, COLS - 1);
    syncFormulaBar();
    render();
  }

  function moveSelection(rowDelta, colDelta, extend) {
    const nextRow = clamp(state.selection.focusRow + rowDelta, 0, ROWS - 1);
    const nextCol = clamp(state.selection.focusCol + colDelta, 0, COLS - 1);
    if (extend) {
      extendSelection(nextRow, nextCol);
      return;
    }
    selectSingleCell(nextRow, nextCol);
  }

  function startEditing(row, col, initialValue, replace) {
    const original = getRaw(row, col);
    state.selection = { anchorRow: row, anchorCol: col, focusRow: row, focusCol: col };
    state.editing = {
      row: row,
      col: col,
      draft: replace ? initialValue : (initialValue != null ? initialValue : original),
      original: original,
      viaFormulaBar: false,
    };
    render();
    focusEditor();
  }

  function isEditingCell() {
    return Boolean(state.editing);
  }

  function commitEditing(direction) {
    if (!state.editing) {
      return;
    }

    pushHistory();
    setRaw(state.editing.row, state.editing.col, state.editing.draft);
    state.editing = null;
    if (direction === 'down') {
      moveSelection(1, 0, false);
    } else if (direction === 'right') {
      moveSelection(0, 1, false);
    } else {
      render();
    }
    persistState();
  }

  function cancelEditing() {
    state.editing = null;
    syncFormulaBar();
    render();
  }

  function clearSelection() {
    const bounds = selectionBounds();
    pushHistory();
    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
        setRaw(row, col, '');
      }
    }
    persistState();
    render();
  }

  function selectionBounds() {
    return {
      minRow: Math.min(state.selection.anchorRow, state.selection.focusRow),
      maxRow: Math.max(state.selection.anchorRow, state.selection.focusRow),
      minCol: Math.min(state.selection.anchorCol, state.selection.focusCol),
      maxCol: Math.max(state.selection.anchorCol, state.selection.focusCol),
    };
  }

  function getRaw(row, col) {
    return state.cells[engine.createCellId(col, row)] || '';
  }

  function setRaw(row, col, raw) {
    const cellId = engine.createCellId(col, row);
    if (!raw) {
      delete state.cells[cellId];
      return;
    }
    state.cells[cellId] = raw;
  }

  function getComputedCell(row, col) {
    const raw = getRaw(row, col);
    if (!raw) {
      return { raw: '', display: '', kind: 'empty' };
    }
    if (raw.charAt(0) !== '=') {
      const numeric = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(numeric)) {
        return { raw: raw, display: String(numeric), kind: 'number' };
      }
      return { raw: raw, display: raw, kind: 'text' };
    }

    if (raw.indexOf('#REF!') !== -1) {
      return { raw: raw, display: '#REF!', kind: 'error' };
    }

    const evaluated = engine.evaluateFormula(raw, {
      getCellRaw: function (cellId) {
        return state.cells[cellId] || '';
      },
    });
    return {
      raw: raw,
      display: evaluated.display,
      kind: evaluated.error ? 'error' : typeof evaluated.value === 'number' ? 'number' : 'text',
    };
  }

  function render() {
    const bounds = selectionBounds();
    const cells = table.querySelectorAll('.cell');
    cells.forEach(function (cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const computed = getComputedCell(row, col);
      const isSelected = row >= bounds.minRow && row <= bounds.maxRow && col >= bounds.minCol && col <= bounds.maxCol;
      const isActive = row === state.selection.focusRow && col === state.selection.focusCol;
      cell.classList.toggle('is-selected', isSelected);
      cell.classList.toggle('is-active', isActive);
      cell.classList.toggle('is-number', computed.kind === 'number');
      cell.classList.toggle('has-error', computed.kind === 'error');

      const isEditing = state.editing && state.editing.row === row && state.editing.col === col && !state.editing.viaFormulaBar;
      if (isEditing) {
        cell.innerHTML = '';
        const input = document.createElement('input');
        input.className = 'cell-editor';
        input.type = 'text';
        input.spellcheck = false;
        input.value = state.editing.draft;
        input.addEventListener('input', function () {
          state.editing.draft = input.value;
          formulaBar.value = input.value;
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitEditing('down');
          } else if (event.key === 'Tab') {
            event.preventDefault();
            commitEditing('right');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditing();
          }
        });
        input.addEventListener('blur', function () {
          if (state.editing) {
            commitEditing();
          }
        });
        cell.appendChild(input);
      } else {
        let content = cell.querySelector('.cell-content');
        if (!content) {
          cell.innerHTML = '<div class="cell-content"></div>';
          content = cell.querySelector('.cell-content');
        }
        content.textContent = computed.display;
      }
    });

    nameBox.value = engine.createCellId(state.selection.focusCol, state.selection.focusRow);
    syncFormulaBar();
  }

  function openHeaderMenu(type, index, rect) {
    const items = type === 'row'
      ? [
          { action: 'insert-before', label: 'Insert Row Above' },
          { action: 'insert-after', label: 'Insert Row Below' },
          { action: 'delete', label: 'Delete Row', danger: true },
        ]
      : [
          { action: 'insert-before', label: 'Insert Column Left' },
          { action: 'insert-after', label: 'Insert Column Right' },
          { action: 'delete', label: 'Delete Column', danger: true },
        ];

    headerMenu.innerHTML = '';
    items.forEach(function (item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.dataset.type = type;
      button.dataset.index = String(index);
      button.dataset.action = item.action;
      if (item.danger) {
        button.className = 'danger';
      }
      button.addEventListener('click', handleHeaderMenuAction);
      headerMenu.appendChild(button);
    });

    headerMenu.hidden = false;
    headerMenu.style.top = `${Math.min(window.innerHeight - 160, rect.bottom + 8)}px`;
    headerMenu.style.left = `${Math.min(window.innerWidth - 200, rect.left)}px`;
  }

  function closeHeaderMenu() {
    headerMenu.hidden = true;
    headerMenu.innerHTML = '';
  }

  function handleHeaderMenuAction(event) {
    const button = event.currentTarget;
    const type = button.dataset.type;
    const index = Number(button.dataset.index);
    const action = button.dataset.action;
    closeHeaderMenu();
    applyStructuralEdit(type, action, index);
  }

  function applyStructuralEdit(type, action, index) {
    pushHistory();
    if (type === 'row') {
      if (action === 'insert-before') {
        state.cells = clipCellsToGrid(structuralUtils.insertRow(state.cells, index));
        state.selection = { anchorRow: index, anchorCol: 0, focusRow: index, focusCol: state.selection.focusCol };
      } else if (action === 'insert-after') {
        state.cells = clipCellsToGrid(structuralUtils.insertRow(state.cells, index + 1));
        state.selection = { anchorRow: Math.min(ROWS - 1, index + 1), anchorCol: 0, focusRow: Math.min(ROWS - 1, index + 1), focusCol: state.selection.focusCol };
      } else {
        state.cells = clipCellsToGrid(structuralUtils.deleteRow(state.cells, index));
        state.selection = { anchorRow: Math.max(0, Math.min(index, ROWS - 1)), anchorCol: 0, focusRow: Math.max(0, Math.min(index, ROWS - 1)), focusCol: state.selection.focusCol };
      }
    } else {
      if (action === 'insert-before') {
        state.cells = clipCellsToGrid(structuralUtils.insertColumn(state.cells, index));
        state.selection = { anchorRow: state.selection.focusRow, anchorCol: index, focusRow: state.selection.focusRow, focusCol: index };
      } else if (action === 'insert-after') {
        state.cells = clipCellsToGrid(structuralUtils.insertColumn(state.cells, index + 1));
        state.selection = { anchorRow: state.selection.focusRow, anchorCol: Math.min(COLS - 1, index + 1), focusRow: state.selection.focusRow, focusCol: Math.min(COLS - 1, index + 1) };
      } else {
        state.cells = clipCellsToGrid(structuralUtils.deleteColumn(state.cells, index));
        state.selection = { anchorRow: state.selection.focusRow, anchorCol: Math.max(0, Math.min(index, COLS - 1)), focusRow: state.selection.focusRow, focusCol: Math.max(0, Math.min(index, COLS - 1)) };
      }
    }
    state.pendingCut = null;
    state.clipboardPayload = null;
    persistState();
    render();
  }

  function clipCellsToGrid(cells) {
    const clipped = {};
    Object.keys(cells).forEach(function (cellId) {
      const ref = engine.parseCellReference(cellId);
      if (ref.row < ROWS && ref.col < COLS) {
        clipped[cellId] = cells[cellId];
      }
    });
    return clipped;
  }

  function syncFormulaBar() {
    if (state.editing) {
      formulaBar.value = state.editing.draft;
      return;
    }
    formulaBar.value = getRaw(state.selection.focusRow, state.selection.focusCol);
  }

  function focusEditor() {
    const editor = table.querySelector('.cell-editor');
    if (!editor) {
      return;
    }
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  function pushHistory() {
    state.undoStack.push(snapshotState());
    if (state.undoStack.length > MAX_HISTORY) {
      state.undoStack.shift();
    }
    state.redoStack.length = 0;
  }

  function undo() {
    if (!state.undoStack.length) {
      return;
    }
    state.redoStack.push(snapshotState());
    restoreSnapshot(state.undoStack.pop());
    persistState();
    render();
  }

  function redo() {
    if (!state.redoStack.length) {
      return;
    }
    state.undoStack.push(snapshotState());
    restoreSnapshot(state.redoStack.pop());
    persistState();
    render();
  }

  function snapshotState() {
    return {
      cells: Object.assign({}, state.cells),
      selection: Object.assign({}, state.selection),
    };
  }

  function restoreSnapshot(snapshot) {
    state.cells = Object.assign({}, snapshot.cells);
    state.selection = Object.assign({}, snapshot.selection);
    state.editing = null;
  }

  function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cells: state.cells,
      selection: state.selection,
    }));
  }

  function restoreState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.cells && parsed.selection) {
        state.cells = parsed.cells;
        state.selection = parsed.selection;
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function isInsideGrid(row, col) {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function arrowDelta(key) {
    switch (key) {
      case 'ArrowUp':
        return { row: -1, col: 0 };
      case 'ArrowDown':
        return { row: 1, col: 0 };
      case 'ArrowLeft':
        return { row: 0, col: -1 };
      case 'ArrowRight':
        return { row: 0, col: 1 };
      default:
        return { row: 0, col: 0 };
    }
  }

  function isPlatformShortcut(event, key) {
    return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === key;
  }
})();
