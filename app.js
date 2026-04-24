(function () {
  if (window.__GRID_SHELL_LOADED__) return;
  window.__GRID_SHELL_LOADED__ = true;

  const ROWS = 100;
  const COLS = 26;
  const columns = Array.from({ length: COLS }, (_, index) => String.fromCharCode(65 + index));
  const values = new Map();
  const sheet = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const cellName = document.getElementById('cell-name');

  if (!sheet || !formulaInput || !cellName) return;

  let activeRow = 0;
  let activeCol = 0;
  let editing = null;

  function address(row, col) {
    return columns[col] + String(row + 1);
  }

  function keyFor(row, col) {
    return row + ':' + col;
  }

  function getValue(row, col) {
    return values.get(keyFor(row, col)) || '';
  }

  function cellAt(row, col) {
    return sheet.querySelector('[data-row="' + row + '"][data-col="' + col + '"]');
  }

  function headerAt(kind, index) {
    return sheet.querySelector('[data-' + kind + '-header="' + index + '"]');
  }

  function setValue(row, col, value) {
    const key = keyFor(row, col);
    if (value) values.set(key, value);
    else values.delete(key);
    cellAt(row, col).textContent = value;
    if (row === activeRow && col === activeCol) formulaInput.value = value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function commitEdit(cancel) {
    if (!editing) return;
    const state = editing;
    const cell = cellAt(state.row, state.col);
    const nextValue = cancel ? state.original : state.input.value;
    editing = null;
    cell.classList.remove('editing');
    cell.textContent = '';
    setValue(state.row, state.col, nextValue);
  }

  function selectCell(row, col) {
    if (editing) commitEdit(false);

    const previousCell = cellAt(activeRow, activeCol);
    const previousColHeader = headerAt('col', activeCol);
    const previousRowHeader = headerAt('row', activeRow);
    if (previousCell) previousCell.classList.remove('active');
    if (previousColHeader) previousColHeader.classList.remove('active-header');
    if (previousRowHeader) previousRowHeader.classList.remove('active-header');

    activeRow = clamp(row, 0, ROWS - 1);
    activeCol = clamp(col, 0, COLS - 1);

    const currentCell = cellAt(activeRow, activeCol);
    currentCell.classList.add('active');
    headerAt('col', activeCol).classList.add('active-header');
    headerAt('row', activeRow).classList.add('active-header');
    cellName.textContent = address(activeRow, activeCol);
    formulaInput.value = getValue(activeRow, activeCol);
    currentCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function beginEdit(options) {
    if (editing) return;
    const cell = cellAt(activeRow, activeCol);
    const original = getValue(activeRow, activeCol);
    const input = document.createElement('input');
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = options && options.replaceWith !== undefined ? options.replaceWith : original;
    cell.classList.add('editing');
    cell.textContent = '';
    cell.appendChild(input);
    editing = { row: activeRow, col: activeCol, original, input };
    formulaInput.value = input.value;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('input', () => {
      formulaInput.value = input.value;
    });
  }

  function move(rowDelta, colDelta) {
    selectCell(activeRow + rowDelta, activeCol + colDelta);
  }

  function handleDocumentKeydown(event) {
    if (event.target === formulaInput) return;

    if (editing) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(false);
        move(1, 0);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(false);
        move(0, 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        commitEdit(true);
      }
      return;
    }

    if (event.key === 'ArrowUp') { event.preventDefault(); move(-1, 0); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1, 0); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(0, -1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(0, 1); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); beginEdit(); return; }
    if (event.key === 'Tab') { event.preventDefault(); move(0, 1); return; }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginEdit({ replaceWith: event.key });
    }
  }

  function handleFormulaKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      setValue(activeRow, activeCol, formulaInput.value);
      move(1, 0);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setValue(activeRow, activeCol, formulaInput.value);
      move(0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      formulaInput.value = getValue(activeRow, activeCol);
      cellAt(activeRow, activeCol).focus();
    }
  }

  function buildGrid() {
    const corner = document.createElement('div');
    corner.className = 'corner';
    sheet.appendChild(corner);

    columns.forEach((label, col) => {
      const header = document.createElement('div');
      header.className = 'column-header';
      header.dataset.colHeader = col;
      header.textContent = label;
      sheet.appendChild(header);
    });

    for (let row = 0; row < ROWS; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.dataset.rowHeader = row;
      rowHeader.textContent = String(row + 1);
      sheet.appendChild(rowHeader);

      for (let col = 0; col < COLS; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.role = 'gridcell';
        cell.tabIndex = -1;
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.dataset.cell = address(row, col);
        cell.addEventListener('mousedown', event => {
          event.preventDefault();
          selectCell(row, col);
        });
        cell.addEventListener('dblclick', event => {
          event.preventDefault();
          beginEdit();
        });
        sheet.appendChild(cell);
      }
    }
  }

  formulaInput.addEventListener('input', () => {
    if (editing) {
      editing.input.value = formulaInput.value;
      return;
    }
    setValue(activeRow, activeCol, formulaInput.value);
  });
  formulaInput.addEventListener('keydown', handleFormulaKeydown);
  document.addEventListener('keydown', handleDocumentKeydown);

  buildGrid();
  selectCell(0, 0);
}());
