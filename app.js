(function () {
  const core = window.SpreadsheetCore;
  const formulaInput = document.getElementById('formula-input');
  const selectionLabel = document.getElementById('selection-label');
  const statusLabel = document.getElementById('status-label');
  const table = document.getElementById('sheet');
  const gridScroll = document.getElementById('grid-scroll');
  const editor = document.getElementById('cell-editor');

  const storageNamespace = resolveStorageNamespace();
  let state = loadState();
  let editSession = null;

  renderGrid();
  renderSelection();
  bindEvents();

  function resolveStorageNamespace() {
    return (
      window.__BENCHMARK_STORAGE_NAMESPACE__ ||
      window.BENCHMARK_STORAGE_NAMESPACE ||
      document.documentElement.dataset.storageNamespace ||
      'local:'
    );
  }

  function loadState() {
    const entries = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      entries[key] = localStorage.getItem(key);
    }

    return core.deserializeState(entries, storageNamespace);
  }

  function saveState() {
    const entries = core.serializeState(state, storageNamespace);
    Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
  }

  function renderGrid() {
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);

    for (let col = 0; col < core.COLS; col += 1) {
      const th = document.createElement('th');
      th.textContent = String.fromCharCode(65 + col);
      headRow.appendChild(th);
    }

    const thead = document.createElement('thead');
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < core.ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (let col = 0; col < core.COLS; col += 1) {
        const td = document.createElement('td');
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.tabIndex = -1;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        td.appendChild(cell);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.replaceChildren(thead, tbody);
    renderCells();
  }

  function renderCells() {
    table.querySelectorAll('.cell').forEach((cellNode) => {
      const row = Number(cellNode.dataset.row);
      const col = Number(cellNode.dataset.col);
      const cell = state.cells.get(core.cellKey(row, col));
      cellNode.textContent = cell ? cell.display : '';
      cellNode.classList.toggle('number', !!cell && cell.kind === 'number');
    });
  }

  function renderSelection() {
    table.querySelectorAll('.cell.selected').forEach((node) => node.classList.remove('selected'));

    const selected = getCellNode(state.selection.row, state.selection.col);
    if (selected) {
      selected.classList.add('selected');
      selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    const key = core.cellKey(state.selection.row, state.selection.col);
    const cell = state.cells.get(key);
    if (!editSession || editSession.source !== 'formula') {
      formulaInput.value = cell ? cell.raw : '';
    }

    selectionLabel.textContent = key;
    statusLabel.textContent = editSession ? 'Editing' : 'Ready';
    saveState();
  }

  function bindEvents() {
    table.addEventListener('click', onCellClick);
    table.addEventListener('dblclick', onCellDoubleClick);
    document.addEventListener('keydown', onDocumentKeyDown);
    formulaInput.addEventListener('focus', () => beginFormulaEdit());
    formulaInput.addEventListener('input', () => {
      if (editSession && editSession.source === 'formula') {
        editSession.draft = formulaInput.value;
      }
    });
    formulaInput.addEventListener('keydown', onFormulaKeyDown);
    editor.addEventListener('input', () => {
      if (editSession && editSession.source === 'grid') {
        editSession.draft = editor.value;
      }
    });
    editor.addEventListener('keydown', onEditorKeyDown);
    window.addEventListener('resize', positionEditor);
    gridScroll.addEventListener('scroll', positionEditor);
  }

  function onCellClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }

    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
  }

  function onCellDoubleClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }

    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    beginGridEdit(getCurrentRawValue());
  }

  function onDocumentKeyDown(event) {
    if (event.target === formulaInput || event.target === editor) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redoChange();
      } else {
        undoChange();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoChange();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1);
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginGridEdit(getCurrentRawValue());
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      commitToSelection('');
      return;
    }

    if (isPrintableKey(event)) {
      event.preventDefault();
      beginGridEdit(event.key);
    }
  }

  function onFormulaKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      formulaInput.blur();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!editSession || editSession.source !== 'formula') {
        beginFormulaEdit();
      }

      commitEdit({ rowDelta: 1, colDelta: 0 });
    }
  }

  function onEditorKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ rowDelta: 1, colDelta: 0 });
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit({ rowDelta: 0, colDelta: 1 });
    }
  }

  function isPrintableKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  function selectCell(row, col) {
    if (editSession) {
      cancelEdit();
    }

    state.selection = { row, col };
    renderSelection();
  }

  function moveSelection(rowDelta, colDelta) {
    if (editSession) {
      cancelEdit();
    }

    core.moveSelection(state, rowDelta, colDelta);
    renderSelection();
  }

  function commitToSelection(raw) {
    core.applyCellEdit(state, state.selection.row, state.selection.col, raw);
    renderCells();
    renderSelection();
  }

  function undoChange() {
    if (editSession) {
      cancelEdit();
    }

    if (core.undo(state)) {
      renderCells();
      renderSelection();
    }
  }

  function redoChange() {
    if (editSession) {
      cancelEdit();
    }

    if (core.redo(state)) {
      renderCells();
      renderSelection();
    }
  }

  function beginFormulaEdit() {
    editSession = {
      source: 'formula',
      original: getCurrentRawValue(),
      draft: formulaInput.value,
    };
    statusLabel.textContent = 'Editing';
  }

  function beginGridEdit(initialValue) {
    editSession = {
      source: 'grid',
      original: getCurrentRawValue(),
      draft: initialValue,
    };

    editor.style.display = 'block';
    editor.value = initialValue;
    formulaInput.value = initialValue;
    positionEditor();
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    statusLabel.textContent = 'Editing';
  }

  function positionEditor() {
    if (!editSession || editSession.source !== 'grid') {
      return;
    }

    const cell = getCellNode(state.selection.row, state.selection.col);
    if (!cell) {
      return;
    }

    const scrollRect = gridScroll.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();

    editor.style.left = `${cellRect.left - scrollRect.left + gridScroll.scrollLeft}px`;
    editor.style.top = `${cellRect.top - scrollRect.top + gridScroll.scrollTop}px`;
    editor.style.width = `${cellRect.width + 1}px`;
    editor.style.height = `${cellRect.height + 1}px`;
  }

  function commitEdit(move) {
    if (!editSession) {
      return;
    }

    const raw = editSession.source === 'grid' ? editor.value : formulaInput.value;
    finishEdit();
    commitToSelection(raw);
    if (move) {
      core.moveSelection(state, move.rowDelta, move.colDelta);
      renderSelection();
    }
  }

  function cancelEdit() {
    if (!editSession) {
      return;
    }

    const original = editSession.original;
    finishEdit();
    formulaInput.value = original;
    renderSelection();
  }

  function finishEdit() {
    editSession = null;
    editor.blur();
    editor.style.display = 'none';
    statusLabel.textContent = 'Ready';
  }

  function getCurrentRawValue() {
    const cell = state.cells.get(core.cellKey(state.selection.row, state.selection.col));
    return cell ? cell.raw : '';
  }

  function getCellNode(row, col) {
    return table.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  }
})();
