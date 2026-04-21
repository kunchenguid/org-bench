(function () {
  const engine = window.SpreadsheetEngine;
  const interaction = window.SpreadsheetInteraction;
  const grid = document.getElementById('sheet-grid');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const gridWrap = document.getElementById('grid-wrap');
  const cellEditor = document.getElementById('cell-editor');
  const headerMenu = document.getElementById('header-menu');
  const storagePrefix = detectStoragePrefix();
  const storageKey = storagePrefix + ':sheet-state';

  const state = {
    sheet: engine.createSheet(),
    selection: makeCellSelection(0, 0),
    editing: null,
    dragAnchor: null,
    headerMenu: null,
    undoStack: [],
    redoStack: [],
    clipboard: null,
  };

  buildGrid();
  loadState();
  render();

  formulaInput.addEventListener('focus', function () {
    beginEdit('formula', getActiveRaw(), true);
  });

  formulaInput.addEventListener('input', function () {
    if (!state.editing || state.editing.mode !== 'formula') {
      beginEdit('formula', formulaInput.value, false);
      return;
    }
    state.editing.value = formulaInput.value;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(1, 0);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      gridWrap.focus();
    }
  });

  formulaInput.addEventListener('blur', function () {
    if (state.editing && state.editing.mode === 'formula') {
      commitPendingEdit(0, 0);
    }
  });

  cellEditor.addEventListener('input', function () {
    if (state.editing) {
      state.editing.value = cellEditor.value;
      formulaInput.value = cellEditor.value;
    }
  });

  cellEditor.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(1, 0);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  cellEditor.addEventListener('blur', function () {
    if (state.editing && state.editing.mode === 'cell') {
      commitPendingEdit(0, 0);
    }
  });

  grid.addEventListener('mousedown', function (event) {
    const cell = event.target.closest('td[data-row]');
    if (!cell) {
      return;
    }
    if (state.editing) {
      commitPendingEdit(0, 0);
    }
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (event.shiftKey) {
      setSelection(state.selection.anchor, { row, col });
    } else {
      setSelection({ row, col }, { row, col });
    }
    state.dragAnchor = state.selection.anchor;
    render();
    event.preventDefault();
  });

  grid.addEventListener('mouseover', function (event) {
    if (!state.dragAnchor || event.buttons !== 1) {
      return;
    }
    const cell = event.target.closest('td[data-row]');
    if (!cell) {
      return;
    }
    setSelection(state.dragAnchor, { row: Number(cell.dataset.row), col: Number(cell.dataset.col) });
    render();
  });

  document.addEventListener('mouseup', function () {
    state.dragAnchor = null;
  });

  grid.addEventListener('contextmenu', function (event) {
    const rowHeader = event.target.closest('th.row-header');
    const colHeader = event.target.closest('th.col-header');
    if (!rowHeader && !colHeader) {
      return;
    }
    event.preventDefault();
    if (state.editing) {
      commitPendingEdit(0, 0);
    }
    if (rowHeader) {
      showHeaderMenu('row', Number(rowHeader.dataset.rowHeader), event.clientX, event.clientY);
      return;
    }
    showHeaderMenu('col', Number(colHeader.dataset.colHeader), event.clientX, event.clientY);
  });

  headerMenu.addEventListener('click', function (event) {
    const action = event.target.closest('button[data-action]');
    if (!action || !state.headerMenu) {
      return;
    }
    applyStructuralAction(state.headerMenu.axis, state.headerMenu.index, action.dataset.action);
    hideHeaderMenu();
  });

  document.addEventListener('mousedown', function (event) {
    if (!event.target.closest('#header-menu')) {
      hideHeaderMenu();
    }
  });

  gridWrap.addEventListener('scroll', hideHeaderMenu);

  grid.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('td[data-row]');
    if (!cell) {
      return;
    }
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    setSelection({ row, col }, { row, col });
    beginEdit('cell', getActiveRaw(), true);
  });

  document.addEventListener('keydown', function (event) {
    if (state.editing && (document.activeElement === formulaInput || document.activeElement === cellEditor)) {
      return;
    }
    if (handleUndoRedo(event)) {
      return;
    }
    if (handleClipboard(event)) {
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit('cell', getActiveRaw(), true);
      return;
    }
    if (isArrowKey(event.key)) {
      event.preventDefault();
      moveSelection(event.key, event.shiftKey);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      moveSelection(event.shiftKey ? 'ArrowLeft' : 'ArrowRight', false);
      return;
    }
    if (shouldStartTyping(event)) {
      event.preventDefault();
      beginEdit('cell', event.key, true);
    }
  });

  document.addEventListener('copy', function (event) {
    if (state.editing) {
      return;
    }
    const payload = selectionToClipboard();
    state.clipboard = payload;
    event.clipboardData.setData('text/plain', payload.text);
    event.preventDefault();
  });

  document.addEventListener('cut', function (event) {
    if (state.editing) {
      return;
    }
    const payload = selectionToClipboard();
    payload.cut = true;
    state.clipboard = payload;
    event.clipboardData.setData('text/plain', payload.text);
    event.preventDefault();
  });

  document.addEventListener('paste', function (event) {
    if (state.editing && document.activeElement === formulaInput) {
      return;
    }
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    pasteText(text);
  });

  window.addEventListener('beforeunload', persist);

  function detectStoragePrefix() {
    const candidates = [
      window.BENCHMARK_STORAGE_NAMESPACE,
      window.__BENCHMARK_STORAGE_NAMESPACE__,
      window.RUN_STORAGE_NAMESPACE,
      window.__RUN_STORAGE_NAMESPACE__,
      document.documentElement.dataset.storageNamespace,
    ];
    return candidates.find(Boolean) || 'apple-sheet';
  }

  function buildGrid() {
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);
    for (let col = 0; col < engine.COLS; col += 1) {
      const header = document.createElement('th');
      header.className = 'col-header';
      header.dataset.colHeader = String(col);
      header.textContent = engine.columnToLetters(col);
      headRow.appendChild(header);
    }
    const thead = document.createElement('thead');
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < engine.ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.dataset.rowHeader = String(row);
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);
      for (let col = 0; col < engine.COLS; col += 1) {
        const td = document.createElement('td');
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    grid.replaceChildren(thead, tbody);
    gridWrap.tabIndex = 0;
  }

  function render() {
    const bounds = selectionBounds();
    const cells = grid.querySelectorAll('td[data-row]');
    for (const cell of cells) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const computed = engine.getCellComputed(state.sheet, row, col);
      cell.textContent = computed.display;
      cell.className = '';
      if (typeof computed.value === 'number') {
        cell.classList.add('numeric');
      }
      if (computed.display.startsWith('#')) {
        cell.classList.add('error');
      }
      if (row >= bounds.top && row <= bounds.bottom && col >= bounds.left && col <= bounds.right) {
        cell.classList.add('in-selection');
      }
      if (row === state.selection.focus.row && col === state.selection.focus.col) {
        cell.classList.add('active');
      }
    }
    nameBox.textContent = toRef(state.selection.focus.row, state.selection.focus.col);
    if (!state.editing || state.editing.mode !== 'formula') {
      formulaInput.value = getActiveRaw();
    }
    renderEditor();
    syncHeaderMenu();
    persist();
  }

  function renderEditor() {
    if (!state.editing || state.editing.mode !== 'cell') {
      cellEditor.classList.add('hidden');
      return;
    }
    const activeCell = getCellNode(state.selection.focus.row, state.selection.focus.col);
    const cellRect = activeCell.getBoundingClientRect();
    const wrapRect = gridWrap.getBoundingClientRect();
    cellEditor.classList.remove('hidden');
    cellEditor.value = state.editing.value;
    cellEditor.style.top = gridWrap.scrollTop + cellRect.top - wrapRect.top - 1 + 'px';
    cellEditor.style.left = gridWrap.scrollLeft + cellRect.left - wrapRect.left - 1 + 'px';
    cellEditor.style.width = cellRect.width + 2 + 'px';
    cellEditor.style.height = cellRect.height + 2 + 'px';
    requestAnimationFrame(function () {
      cellEditor.focus();
      cellEditor.setSelectionRange(cellEditor.value.length, cellEditor.value.length);
    });
  }

  function beginEdit(mode, value, focus) {
    state.editing = {
      mode,
      value,
      original: getActiveRaw(),
    };
    formulaInput.value = value;
    if (mode === 'formula') {
      cellEditor.classList.add('hidden');
      if (focus) {
        requestAnimationFrame(function () {
          formulaInput.focus();
          formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
        });
      }
      return;
    }
    renderEditor();
  }

  function cancelEdit() {
    state.editing = null;
    render();
  }

  function commitEdit(rowDelta, colDelta) {
    if (!state.editing) {
      return;
    }
    const changed = state.editing.value !== state.editing.original;
    if (changed) {
      pushHistory();
    }
    const focus = state.selection.focus;
    engine.setCellRaw(state.sheet, focus.row, focus.col, state.editing.value);
    state.editing = null;
    moveSelectionBy(rowDelta, colDelta);
    if (changed) {
      state.redoStack = [];
    }
    render();
  }

  function commitPendingEdit(rowDelta, colDelta) {
    if (!state.editing) {
      return;
    }
    commitEdit(rowDelta, colDelta);
  }

  function clearSelection() {
    pushHistory();
    const bounds = selectionBounds();
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        engine.setCellRaw(state.sheet, row, col, '');
      }
    }
    state.redoStack = [];
    render();
  }

  function selectionToClipboard() {
    const bounds = selectionBounds();
    const rows = [];
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      const values = [];
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        values.push(engine.getCellRaw(state.sheet, row, col));
      }
      rows.push(values.join('\t'));
    }
    return {
      text: rows.join('\n'),
      source: bounds,
      cut: false,
    };
  }

  function pasteText(text) {
    if (!text) {
      return;
    }
    const matrix = text.split(/\r?\n/).map(function (line) {
      return line.split('\t');
    });
    const height = matrix.length;
    const width = Math.max.apply(null, matrix.map(function (row) { return row.length; }));
    const destination = selectionBounds();
    const target = interaction.resolvePasteTarget(destination, { height, width });

    pushHistory();
    const snapshot = matrix.map(function (row) { return row.slice(); });

    if (state.clipboard && state.clipboard.cut && state.clipboard.text === text) {
      clearRange(state.clipboard.source);
    }

    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const destRow = target.top + row;
        const destCol = target.left + col;
        if (destRow >= engine.ROWS || destCol >= engine.COLS) {
          continue;
        }
        let value = snapshot[row][col] ?? '';
        if (state.clipboard && value.startsWith('=') && state.clipboard.text === text) {
          value = engine.shiftFormula(value, destRow - (state.clipboard.source.top + row), destCol - (state.clipboard.source.left + col));
        }
        engine.setCellRaw(state.sheet, destRow, destCol, value);
      }
    }

    state.redoStack = [];
    state.clipboard = state.clipboard && state.clipboard.cut && state.clipboard.text === text ? null : state.clipboard;
    setSelection({ row: target.top, col: target.left }, { row: Math.min(engine.ROWS - 1, target.bottom), col: Math.min(engine.COLS - 1, target.right) });
    render();
  }

  function clearRange(bounds) {
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        engine.setCellRaw(state.sheet, row, col, '');
      }
    }
  }

  function applyStructuralAction(axis, index, action) {
    pushHistory();
    if (axis === 'row') {
      if (action === 'insert-before') {
        engine.insertRow(state.sheet, index);
        shiftSelectionAfterStructure(axis, index, 'insert');
      } else if (action === 'insert-after') {
        engine.insertRow(state.sheet, index + 1);
        shiftSelectionAfterStructure(axis, index + 1, 'insert');
      } else {
        engine.deleteRow(state.sheet, index);
        shiftSelectionAfterStructure(axis, index, 'delete');
      }
    } else {
      if (action === 'insert-before') {
        engine.insertColumn(state.sheet, index);
        shiftSelectionAfterStructure(axis, index, 'insert');
      } else if (action === 'insert-after') {
        engine.insertColumn(state.sheet, index + 1);
        shiftSelectionAfterStructure(axis, index + 1, 'insert');
      } else {
        engine.deleteColumn(state.sheet, index);
        shiftSelectionAfterStructure(axis, index, 'delete');
      }
    }
    state.redoStack = [];
    render();
  }

  function shiftSelectionAfterStructure(axis, index, kind) {
    state.selection = {
      anchor: remapSelectionPoint(state.selection.anchor, axis, index, kind),
      focus: remapSelectionPoint(state.selection.focus, axis, index, kind),
    };
  }

  function remapSelectionPoint(point, axis, index, kind) {
    const next = { row: point.row, col: point.col };
    const key = axis === 'row' ? 'row' : 'col';
    if (kind === 'insert') {
      if (next[key] >= index) {
        next[key] += 1;
      }
      return clampCell(next.row, next.col);
    }
    if (next[key] > index) {
      next[key] -= 1;
    }
    return clampCell(next.row, next.col);
  }

  function showHeaderMenu(axis, index, clientX, clientY) {
    const insertBefore = headerMenu.querySelector('button[data-action="insert-before"]');
    const insertAfter = headerMenu.querySelector('button[data-action="insert-after"]');
    const remove = headerMenu.querySelector('button[data-action="delete"]');
    insertBefore.textContent = axis === 'row' ? 'Insert Row Above' : 'Insert Column Left';
    insertAfter.textContent = axis === 'row' ? 'Insert Row Below' : 'Insert Column Right';
    remove.textContent = axis === 'row' ? 'Delete Row' : 'Delete Column';
    state.headerMenu = { axis, index, clientX, clientY };
    syncHeaderMenu();
  }

  function syncHeaderMenu() {
    if (!state.headerMenu) {
      headerMenu.classList.add('hidden');
      return;
    }
    const wrapRect = gridWrap.getBoundingClientRect();
    headerMenu.classList.remove('hidden');
    headerMenu.style.left = gridWrap.scrollLeft + state.headerMenu.clientX - wrapRect.left + 'px';
    headerMenu.style.top = gridWrap.scrollTop + state.headerMenu.clientY - wrapRect.top + 'px';
  }

  function hideHeaderMenu() {
    state.headerMenu = null;
    headerMenu.classList.add('hidden');
  }

  function handleUndoRedo(event) {
    const shortcut = event.metaKey || event.ctrlKey;
    if (!shortcut) {
      return false;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      restoreHistory(state.undoStack, state.redoStack);
      return true;
    }
    if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault();
      restoreHistory(state.redoStack, state.undoStack);
      return true;
    }
    return false;
  }

  function handleClipboard(event) {
    if (!(event.metaKey || event.ctrlKey)) {
      return false;
    }
    const key = event.key.toLowerCase();
    if (key === 'c' || key === 'x') {
      return false;
    }
    if (key === 'v') {
      return false;
    }
    return false;
  }

  function restoreHistory(source, destination) {
    if (!source.length) {
      return;
    }
    destination.push(snapshotState());
    const snapshot = source.pop();
    state.sheet.cells = structuredClone(snapshot.cells);
    state.selection = structuredClone(snapshot.selection);
    state.editing = null;
    render();
  }

  function pushHistory() {
    state.undoStack.push(snapshotState());
    if (state.undoStack.length > 50) {
      state.undoStack.shift();
    }
  }

  function snapshotState() {
    return {
      cells: structuredClone(state.sheet.cells),
      selection: structuredClone(state.selection),
    };
  }

  function moveSelection(key, extend) {
    const delta = arrowDelta(key);
    if (extend) {
      setSelection(state.selection.anchor, clampCell(state.selection.focus.row + delta.row, state.selection.focus.col + delta.col));
    } else {
      const next = clampCell(state.selection.focus.row + delta.row, state.selection.focus.col + delta.col);
      setSelection(next, next);
    }
    render();
    scrollIntoView();
  }

  function moveSelectionBy(rowDelta, colDelta) {
    const next = clampCell(state.selection.focus.row + rowDelta, state.selection.focus.col + colDelta);
    setSelection(next, next);
    scrollIntoView();
  }

  function scrollIntoView() {
    const cell = getCellNode(state.selection.focus.row, state.selection.focus.col);
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function getCellNode(row, col) {
    return grid.querySelector('td[data-row="' + row + '"][data-col="' + col + '"]');
  }

  function getActiveRaw() {
    return engine.getCellRaw(state.sheet, state.selection.focus.row, state.selection.focus.col);
  }

  function setSelection(anchor, focus) {
    state.selection = { anchor, focus };
  }

  function makeCellSelection(row, col) {
    return { anchor: { row, col }, focus: { row, col } };
  }

  function selectionBounds() {
    const { anchor, focus } = state.selection;
    return {
      top: Math.min(anchor.row, focus.row),
      bottom: Math.max(anchor.row, focus.row),
      left: Math.min(anchor.col, focus.col),
      right: Math.max(anchor.col, focus.col),
    };
  }

  function clampCell(row, col) {
    return {
      row: Math.max(0, Math.min(engine.ROWS - 1, row)),
      col: Math.max(0, Math.min(engine.COLS - 1, col)),
    };
  }

  function arrowDelta(key) {
    switch (key) {
      case 'ArrowUp': return { row: -1, col: 0 };
      case 'ArrowDown': return { row: 1, col: 0 };
      case 'ArrowLeft': return { row: 0, col: -1 };
      default: return { row: 0, col: 1 };
    }
  }

  function isArrowKey(key) {
    return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
  }

  function shouldStartTyping(event) {
    return !event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1;
  }

  function toRef(row, col) {
    return engine.columnToLetters(col) + String(row + 1);
  }

  function persist() {
    const payload = {
      cells: state.sheet.cells,
      selection: state.selection,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved) {
        return;
      }
      state.sheet.cells = saved.cells || Object.create(null);
      if (saved.selection) {
        state.selection = saved.selection;
      }
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }
})();
