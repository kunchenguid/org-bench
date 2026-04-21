(function () {
  const { createSpreadsheetController } = window.SpreadsheetController;
  const rows = 100;
  const cols = 26;
  const spreadsheet = document.getElementById('spreadsheet');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const controller = createSpreadsheetController({ rows, cols });

  const grid = document.createElement('div');
  grid.className = 'sheet-grid';

  const columnHeaders = [];
  const rowHeaders = [];
  const cellElements = [];

  function columnName(index) {
    return String.fromCharCode(65 + index);
  }

  function selectionLabel(selection) {
    return `${columnName(selection.col)}${selection.row + 1}`;
  }

  function getCellElement(row, col) {
    return cellElements[row][col];
  }

  function renderGrid() {
    grid.innerHTML = '';
    columnHeaders.length = 0;
    rowHeaders.length = 0;
    cellElements.length = 0;

    const corner = document.createElement('div');
    corner.className = 'corner';
    grid.appendChild(corner);

    for (let col = 0; col < cols; col += 1) {
      const header = document.createElement('div');
      header.className = 'column-header';
      header.textContent = columnName(col);
      columnHeaders.push(header);
      grid.appendChild(header);
    }

    for (let row = 0; row < rows; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      rowHeaders.push(rowHeader);
      grid.appendChild(rowHeader);

      const rowCells = [];
      for (let col = 0; col < cols; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        rowCells.push(cell);
        grid.appendChild(cell);
      }

      cellElements.push(rowCells);
    }
  }

  function syncStaticValues() {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = getCellElement(row, col);
        if (controller.isEditing()) {
          const editor = controller.getEditorState();
          if (editor && editor.source === 'cell' && editor.row === row && editor.col === col) {
            continue;
          }
        }

        cell.textContent = controller.getCellRaw(row, col);
      }
    }
  }

  function renderEditor() {
    const priorInput = spreadsheet.querySelector('.cell-input');
    if (priorInput) {
      priorInput.remove();
    }

    if (!controller.isEditing()) {
      return;
    }

    const editor = controller.getEditorState();
    if (!editor || editor.source !== 'cell') {
      return;
    }

    const cell = getCellElement(editor.row, editor.col);
    cell.textContent = '';

    const input = document.createElement('input');
    input.className = 'cell-input';
    input.type = 'text';
    input.spellcheck = false;
    input.value = editor.draft;
    input.setAttribute('aria-label', `Edit ${selectionLabel(editor)}`);

    input.addEventListener('input', () => {
      controller.handleEditorInput(input.value);
      syncFormulaBar();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
        event.preventDefault();
        controller.handleEditorKeyDown(event);
        refresh();
        spreadsheet.focus();
      }
    });

    input.addEventListener('blur', () => {
      if (!controller.isEditing()) {
        return;
      }

      const active = document.activeElement;
      if (active === formulaInput) {
        return;
      }

      controller.commitEdit();
      refresh();
    });

    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function syncFormulaBar() {
    const editor = controller.getEditorState();
    if (editor) {
      formulaInput.value = editor.draft;
      return;
    }

    const selection = controller.getSelection();
    formulaInput.value = controller.getCellRaw(selection.row, selection.col);
  }

  function syncSelection() {
    const selection = controller.getSelection();
    nameBox.textContent = selectionLabel(selection);

    columnHeaders.forEach((header, index) => {
      header.classList.toggle('active', index === selection.col);
    });

    rowHeaders.forEach((header, index) => {
      header.classList.toggle('active', index === selection.row);
    });

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        getCellElement(row, col).classList.toggle(
          'active',
          row === selection.row && col === selection.col
        );
      }
    }

    const activeCell = getCellElement(selection.row, selection.col);
    activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function refresh() {
    syncStaticValues();
    syncSelection();
    syncFormulaBar();
    renderEditor();
  }

  spreadsheet.addEventListener('mousedown', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }

    if (controller.isEditing()) {
      controller.commitEdit();
    }

    controller.clickCell(Number(cell.dataset.row), Number(cell.dataset.col));
    refresh();
    spreadsheet.focus();
  });

  spreadsheet.addEventListener('dblclick', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }

    controller.doubleClickCell(Number(cell.dataset.row), Number(cell.dataset.col));
    refresh();
  });

  spreadsheet.addEventListener('keydown', (event) => {
    const navigationKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'F2']);
    const printable = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!navigationKeys.has(event.key) && !printable) {
      return;
    }

    event.preventDefault();
    controller.handleKeyDown(event);
    refresh();
  });

  formulaInput.addEventListener('focus', () => {
    if (!controller.isEditing()) {
      controller.startFormulaBarEdit();
      refresh();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    }
  });

  formulaInput.addEventListener('input', () => {
    if (!controller.isEditing()) {
      controller.startFormulaBarEdit();
    }

    controller.handleEditorInput(formulaInput.value);
  });

  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
      event.preventDefault();
      controller.handleEditorKeyDown(event);
      refresh();
      spreadsheet.focus();
    }
  });

  formulaInput.addEventListener('blur', () => {
    if (!controller.isEditing()) {
      return;
    }

    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('cell-input')) {
      return;
    }

    controller.commitEdit();
    refresh();
  });

  renderGrid();
  spreadsheet.appendChild(grid);
  refresh();
})();
