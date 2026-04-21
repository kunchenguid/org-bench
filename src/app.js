(function () {
  const editing = window.SpreadsheetEditing;
  const store = editing.createSpreadsheetStore();
  const namespace = window.__APPLE_BENCH_STORAGE_NS__ || 'apple-spreadsheet:';
  const storageKey = namespace + 'sheet-state';

  const app = document.getElementById('app');
  app.innerHTML = [
    '<div class="shell">',
    '  <div class="formula-bar-row">',
    '    <label class="formula-bar-label" for="formula-bar">fx</label>',
    '    <input id="formula-bar" class="formula-bar-input" type="text" spellcheck="false" aria-label="Formula bar">',
    '  </div>',
    '  <div class="grid-wrap">',
    '    <table class="grid" aria-label="Spreadsheet grid">',
    '      <thead id="grid-head"></thead>',
    '      <tbody id="grid-body"></tbody>',
    '    </table>',
    '  </div>',
    '</div>',
  ].join('');

  const formulaBar = document.getElementById('formula-bar');
  const gridHead = document.getElementById('grid-head');
  const gridBody = document.getElementById('grid-body');
  let activeEditor = null;

  restoreState();
  renderGrid();
  render();

  document.addEventListener('keydown', onDocumentKeyDown);
  formulaBar.addEventListener('focus', onFormulaFocus);
  formulaBar.addEventListener('input', onFormulaInput);
  formulaBar.addEventListener('keydown', onFormulaKeyDown);

  function renderGrid() {
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);

    for (let column = 1; column <= editing.MAX_COLUMNS; column += 1) {
      const header = document.createElement('th');
      header.className = 'column-header';
      header.textContent = String.fromCharCode(64 + column);
      headRow.appendChild(header);
    }

    gridHead.appendChild(headRow);

    for (let row = 1; row <= editing.MAX_ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row);
      tr.appendChild(rowHeader);

      for (let column = 1; column <= editing.MAX_COLUMNS; column += 1) {
        const td = document.createElement('td');
        const cellId = editing.formatCellId({ column: column, row: row });
        td.className = 'cell';
        td.dataset.cellId = cellId;
        td.tabIndex = -1;
        td.addEventListener('click', onCellClick);
        td.addEventListener('dblclick', onCellDoubleClick);
        tr.appendChild(td);
      }

      gridBody.appendChild(tr);
    }
  }

  function render() {
    const cells = gridBody.querySelectorAll('.cell');
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      const cellId = cell.dataset.cellId;
      const isActive = cellId === store.selection.activeCellId;

      cell.classList.toggle('active', isActive);
      cell.textContent = editing.getCellRaw(store, cellId);

      if (store.editing.active && store.editing.cellId === cellId && store.editing.source === 'cell') {
        renderCellEditor(cell);
      }
    }

    formulaBar.value = editing.getFormulaBarText(store);
    persistState();
  }

  function renderCellEditor(cell) {
    if (activeEditor && activeEditor.parentNode && activeEditor.parentNode !== cell) {
      activeEditor.parentNode.removeChild(activeEditor);
    }

    cell.textContent = '';
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.type = 'text';
    input.spellcheck = false;
    input.value = store.editing.draft;
    input.addEventListener('input', onCellEditorInput);
    input.addEventListener('keydown', onCellEditorKeyDown);
    input.addEventListener('blur', onCellEditorBlur);
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    activeEditor = input;
  }

  function onCellClick(event) {
    const cellId = event.currentTarget.dataset.cellId;
    if (store.editing.active) {
      editing.commitEdit(store, { move: 'none' });
    }
    store.selection.activeCellId = cellId;
    render();
  }

  function onCellDoubleClick(event) {
    const cellId = event.currentTarget.dataset.cellId;
    editing.beginEdit(store, { cellId: cellId, source: 'cell' });
    render();
  }

  function onDocumentKeyDown(event) {
    if (event.target === formulaBar || event.target === activeEditor) {
      return;
    }

    const key = event.key;
    if (key === 'F2') {
      event.preventDefault();
      editing.beginEdit(store, { source: 'cell' });
      render();
      return;
    }

    if (key === 'Enter') {
      event.preventDefault();
      editing.beginEdit(store, { source: 'cell' });
      render();
      return;
    }

    if (isPlainTypingKey(event)) {
      event.preventDefault();
      editing.applyTypedInput(store, key);
      render();
      return;
    }

    const move = keyToMove(key);
    if (!move) {
      return;
    }

    event.preventDefault();
    store.selection.activeCellId = editing.moveSelection(store.selection.activeCellId, move);
    render();
  }

  function onCellEditorInput(event) {
    editing.updateEditDraft(store, event.currentTarget.value);
    formulaBar.value = editing.getFormulaBarText(store);
  }

  function onCellEditorKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      editing.cancelEdit(store);
      render();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      editing.commitEdit(store, { move: 'down' });
      render();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      editing.commitEdit(store, { move: 'right' });
      render();
    }
  }

  function onCellEditorBlur() {
    if (!store.editing.active || store.editing.source !== 'cell') {
      return;
    }

    editing.commitEdit(store, { move: 'none' });
    render();
  }

  function onFormulaFocus() {
    if (!store.editing.active) {
      editing.beginEdit(store, { source: 'formula' });
      render();
    }
  }

  function onFormulaInput(event) {
    editing.updateEditDraft(store, event.currentTarget.value);
  }

  function onFormulaKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      editing.cancelEdit(store);
      render();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      editing.commitEdit(store, { move: 'down' });
      render();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      editing.commitEdit(store, { move: 'right' });
      render();
    }
  }

  function keyToMove(key) {
    if (key === 'ArrowUp') {
      return 'up';
    }
    if (key === 'ArrowDown') {
      return 'down';
    }
    if (key === 'ArrowLeft') {
      return 'left';
    }
    if (key === 'ArrowRight') {
      return 'right';
    }
    return null;
  }

  function isPlainTypingKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  function persistState() {
    const data = {
      cells: store.cells,
      selection: store.selection,
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  function restoreState() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed.cells && typeof parsed.cells === 'object') {
        store.cells = parsed.cells;
      }
      if (parsed.selection && parsed.selection.activeCellId) {
        store.selection.activeCellId = parsed.selection.activeCellId;
      }
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }
})();
