(function () {
  const ROWS = 100;
  const COLS = 26;
  const root = document.getElementById('app');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const selectionInfo = document.getElementById('selection-info');

  function getStorageNamespace() {
    return window.__BENCHMARK_STORAGE_NAMESPACE__ || window.BENCHMARK_STORAGE_NAMESPACE || window.STORAGE_NAMESPACE || 'facebook-spreadsheet';
  }

  function getStorageKey() {
    return getStorageNamespace() + ':spreadsheet-state';
  }

  function loadSnapshot() {
    try {
      const raw = window.localStorage.getItem(getStorageKey());
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveSnapshot() {
    try {
      window.localStorage.setItem(getStorageKey(), JSON.stringify(model.serialize()));
    } catch (error) {
      // Ignore quota and privacy-mode failures.
    }
  }

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function cellName(row, col) {
    return columnLabel(col) + String(row + 1);
  }

  function normalizeRange(range) {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endRow: Math.max(range.startRow, range.endRow),
      endCol: Math.max(range.startCol, range.endCol),
    };
  }

  function isInsideRange(row, col, range) {
    const normalized = normalizeRange(range);
    return row >= normalized.startRow && row <= normalized.endRow && col >= normalized.startCol && col <= normalized.endCol;
  }

  const model = window.SpreadsheetModel.createSpreadsheetModel({ rows: ROWS, cols: COLS, snapshot: loadSnapshot() });
  let anchorCell = model.getSelectedCell();
  let activeRange = null;
  let isDragging = false;
  let editingCell = null;
  let cellEditStartValue = '';
  let formulaEditStartValue = '';

  const elements = [];
  const table = document.createElement('table');
  table.className = 'sheet';

  const headRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'corner';
  headRow.appendChild(corner);

  for (let col = 0; col < COLS; col += 1) {
    const header = document.createElement('th');
    header.className = 'column-header';
    header.textContent = columnLabel(col);
    headRow.appendChild(header);
  }

  const thead = document.createElement('thead');
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let row = 0; row < ROWS; row += 1) {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('th');
    rowHeader.className = 'row-header';
    rowHeader.textContent = String(row + 1);
    tr.appendChild(rowHeader);

    const cells = [];
    for (let col = 0; col < COLS; col += 1) {
      const td = document.createElement('td');
      td.className = 'cell';
      td.dataset.row = String(row);
      td.dataset.col = String(col);
      td.tabIndex = -1;
      tr.appendChild(td);
      cells.push(td);
    }

    elements.push(cells);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  root.appendChild(table);

  function getSelectedRange() {
    return activeRange ? normalizeRange(activeRange) : null;
  }

  function clearEditingCell() {
    if (!editingCell) {
      return;
    }

    const td = elements[editingCell.row][editingCell.col];
    td.classList.remove('editing');
    editingCell = null;
  }

  function render() {
    const selected = model.getSelectedCell();
    const range = getSelectedRange();

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const td = elements[row][col];
        td.textContent = model.getCellRaw(row, col);
        td.classList.toggle('selected', row === selected.row && col === selected.col);
        td.classList.toggle('in-range', !!range && isInsideRange(row, col, range));
      }
    }

    if (!editingCell && document.activeElement !== formulaInput) {
      formulaInput.value = model.getCellRaw(selected.row, selected.col);
    }

    nameBox.textContent = cellName(selected.row, selected.col);
    selectionInfo.textContent = range
      ? cellName(range.startRow, range.startCol) + ' - ' + cellName(range.endRow, range.endCol)
      : 'Single cell';

    elements[selected.row][selected.col].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function commitSelectionValue(value) {
    const selected = model.getSelectedCell();
    model.setCell(selected.row, selected.col, value);
    saveSnapshot();
    render();
  }

  function beginCellEdit(replaceValue) {
    const selected = model.getSelectedCell();
    editingCell = { row: selected.row, col: selected.col };
    cellEditStartValue = model.getCellRaw(selected.row, selected.col);
    const td = elements[selected.row][selected.col];
    td.classList.add('editing');

    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = replaceValue == null ? cellEditStartValue : replaceValue;
    td.textContent = '';
    td.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitCellEdit(input.value, 1, 0);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitCellEdit(input.value, 0, event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelCellEdit();
      }
    });

    input.addEventListener('blur', function () {
      if (editingCell) {
        commitCellEdit(input.value, 0, 0);
      }
    });
  }

  function cancelCellEdit() {
    if (!editingCell) {
      return;
    }

    const cell = editingCell;
    clearEditingCell();
    model.setCell(cell.row, cell.col, cellEditStartValue);
    render();
  }

  function commitCellEdit(value, rowDelta, colDelta) {
    if (!editingCell) {
      return;
    }

    const cell = editingCell;
    clearEditingCell();
    model.setCell(cell.row, cell.col, value);
    model.selectCell(cell.row, cell.col);
    anchorCell = model.getSelectedCell();
    activeRange = null;
    model.moveSelection(rowDelta, colDelta);
    anchorCell = model.getSelectedCell();
    saveSnapshot();
    render();
  }

  function beginFormulaEdit() {
    const selected = model.getSelectedCell();
    formulaEditStartValue = model.getCellRaw(selected.row, selected.col);
    formulaInput.value = formulaEditStartValue;
  }

  function commitFormulaEdit(shouldMoveDown) {
    commitSelectionValue(formulaInput.value);
    if (shouldMoveDown) {
      model.moveSelection(1, 0);
      anchorCell = model.getSelectedCell();
      activeRange = null;
      saveSnapshot();
      render();
    }
  }

  function cancelFormulaEdit() {
    formulaInput.value = formulaEditStartValue;
    render();
  }

  function selectCell(row, col, extendRange) {
    model.selectCell(row, col);
    const selected = model.getSelectedCell();
    if (extendRange) {
      activeRange = {
        startRow: anchorCell.row,
        startCol: anchorCell.col,
        endRow: selected.row,
        endCol: selected.col,
      };
    } else {
      anchorCell = selected;
      activeRange = null;
    }

    saveSnapshot();
    render();
  }

  function clearCurrentSelection() {
    const range = getSelectedRange();
    if (range) {
      model.clearRange(range);
    } else {
      const selected = model.getSelectedCell();
      model.setCell(selected.row, selected.col, '');
    }

    saveSnapshot();
    render();
  }

  table.addEventListener('mousedown', function (event) {
    const td = event.target.closest('td.cell');
    if (!td) {
      return;
    }

    event.preventDefault();
    const row = Number(td.dataset.row);
    const col = Number(td.dataset.col);
    isDragging = true;
    selectCell(row, col, event.shiftKey);
    if (!event.shiftKey) {
      anchorCell = { row: row, col: col };
      activeRange = { startRow: row, startCol: col, endRow: row, endCol: col };
      render();
    }
  });

  table.addEventListener('mouseover', function (event) {
    if (!isDragging) {
      return;
    }

    const td = event.target.closest('td.cell');
    if (!td) {
      return;
    }

    const row = Number(td.dataset.row);
    const col = Number(td.dataset.col);
    model.selectCell(row, col);
    activeRange = { startRow: anchorCell.row, startCol: anchorCell.col, endRow: row, endCol: col };
    render();
  });

  window.addEventListener('mouseup', function () {
    isDragging = false;
    if (activeRange) {
      const normalized = normalizeRange(activeRange);
      const isSingleCell = normalized.startRow === normalized.endRow && normalized.startCol === normalized.endCol;
      if (isSingleCell) {
        activeRange = null;
        render();
      }
    }
  });

  table.addEventListener('click', function (event) {
    const td = event.target.closest('td.cell');
    if (!td) {
      return;
    }

    selectCell(Number(td.dataset.row), Number(td.dataset.col), event.shiftKey);
  });

  table.addEventListener('dblclick', function (event) {
    const td = event.target.closest('td.cell');
    if (!td) {
      return;
    }

    selectCell(Number(td.dataset.row), Number(td.dataset.col), false);
    beginCellEdit();
  });

  formulaInput.addEventListener('focus', beginFormulaEdit);
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitFormulaEdit(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelFormulaEdit();
      formulaInput.blur();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitFormulaEdit(false);
      model.moveSelection(0, event.shiftKey ? -1 : 1);
      anchorCell = model.getSelectedCell();
      activeRange = null;
      saveSnapshot();
      render();
    }
  });
  formulaInput.addEventListener('blur', function () {
    commitFormulaEdit(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (document.activeElement === formulaInput) {
      return;
    }

    if (editingCell) {
      return;
    }

    const moveByKey = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };

    if (moveByKey[event.key]) {
      event.preventDefault();
      const delta = moveByKey[event.key];
      model.moveSelection(delta[0], delta[1]);
      if (event.shiftKey) {
        const selected = model.getSelectedCell();
        activeRange = {
          startRow: anchorCell.row,
          startCol: anchorCell.col,
          endRow: selected.row,
          endCol: selected.col,
        };
      } else {
        anchorCell = model.getSelectedCell();
        activeRange = null;
      }
      saveSnapshot();
      render();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginCellEdit();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearCurrentSelection();
      return;
    }

    if (event.key.length === 1 && !event.repeat) {
      event.preventDefault();
      beginCellEdit(event.key);
    }
  });

  render();
})();
