(function () {
  const COLS = 26;
  const ROWS = 100;
  const engine = window.FormulaEngine;
  const storagePrefix = String(window.__BENCHMARK_STORAGE_NAMESPACE__ || 'spreadsheet-demo');
  const storageKey = storagePrefix + ':sheet-state';

  const formulaInput = document.getElementById('formula-input');
  const grid = document.getElementById('sheet-grid');
  const gridScroll = document.getElementById('grid-scroll');
  const editor = document.getElementById('cell-editor');
  const statusbar = document.getElementById('statusbar');

  let workbook = engine.createWorkbook();
  let activeCell = 'A1';
  let selection = { anchor: 'A1', focus: 'A1' };
  let editState = null;
  let dragAnchor = null;

  function buildGrid() {
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    for (let col = 0; col < COLS; col += 1) {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.textContent = engine.encodeCellId(col, 0).replace(/\d+/g, '');
      headerRow.appendChild(th);
    }
    grid.appendChild(headerRow);

    for (let row = 0; row < ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (let col = 0; col < COLS; col += 1) {
        const cellId = engine.encodeCellId(col, row);
        const td = document.createElement('td');
        td.dataset.cellId = cellId;
        const span = document.createElement('div');
        span.className = 'cell-value';
        td.appendChild(span);
        tr.appendChild(td);
      }

      grid.appendChild(tr);
    }
  }

  function cellElement(cellId) {
    return grid.querySelector('td[data-cell-id="' + cellId + '"]');
  }

  function getRect(selectionState) {
    const anchor = engine.decodeCellId(selectionState.anchor);
    const focus = engine.decodeCellId(selectionState.focus);
    return {
      minCol: Math.min(anchor.col, focus.col),
      maxCol: Math.max(anchor.col, focus.col),
      minRow: Math.min(anchor.row, focus.row),
      maxRow: Math.max(anchor.row, focus.row),
    };
  }

  function eachSelectedCell(selectionState, callback) {
    const rect = getRect(selectionState);
    for (let row = rect.minRow; row <= rect.maxRow; row += 1) {
      for (let col = rect.minCol; col <= rect.maxCol; col += 1) {
        callback(engine.encodeCellId(col, row));
      }
    }
  }

  function isSingleCellSelection() {
    return selection.anchor === selection.focus;
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify({
      cells: engine.serializeWorkbook(workbook),
      activeCell: activeCell,
      selection: selection,
    }));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw);
      workbook = engine.createWorkbook(saved.cells || {});
      activeCell = saved.activeCell || 'A1';
      selection = saved.selection || { anchor: activeCell, focus: activeCell };
    } catch (error) {
      workbook = engine.createWorkbook();
    }
  }

  function render() {
    const rect = getRect(selection);

    Array.prototype.forEach.call(grid.querySelectorAll('td[data-cell-id]'), function (td) {
      const cellId = td.dataset.cellId;
      const valueNode = td.firstChild;
      const display = engine.getCellDisplay(workbook, cellId);
      const raw = engine.getCellRaw(workbook, cellId);

      valueNode.textContent = display;
      valueNode.className = 'cell-value';
      td.classList.remove('active', 'in-range', 'error');

      if (typeof engine.evaluateCell(workbook, cellId).value === 'number') {
        valueNode.classList.add('numeric');
      }
      if (display.charAt(0) === '#') {
        td.classList.add('error');
      }
      if (cellId === activeCell) {
        td.classList.add('active');
      }

      const position = engine.decodeCellId(cellId);
      if (position.col >= rect.minCol && position.col <= rect.maxCol && position.row >= rect.minRow && position.row <= rect.maxRow) {
        td.classList.add('in-range');
      }
      if (!raw) {
        valueNode.textContent = '';
      }
    });

    formulaInput.value = editState && editState.source === 'formula' ? editState.value : engine.getCellRaw(workbook, activeCell);
    statusbar.textContent = activeCell + (isSingleCellSelection() ? '' : ' - range selected');
  }

  function moveSelection(rowDelta, colDelta, extend) {
    const current = engine.decodeCellId(activeCell);
    const nextRow = Math.max(0, Math.min(ROWS - 1, current.row + rowDelta));
    const nextCol = Math.max(0, Math.min(COLS - 1, current.col + colDelta));
    activeCell = engine.encodeCellId(nextCol, nextRow);
    if (extend) {
      selection = { anchor: selection.anchor, focus: activeCell };
    } else {
      selection = { anchor: activeCell, focus: activeCell };
    }
    ensureVisible(activeCell);
    render();
    saveState();
  }

  function ensureVisible(cellId) {
    const element = cellElement(cellId);
    if (!element) {
      return;
    }
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function beginEdit(source, preserve) {
    const target = cellElement(activeCell);
    const raw = preserve ? engine.getCellRaw(workbook, activeCell) : '';
    editState = { cellId: activeCell, previous: engine.getCellRaw(workbook, activeCell), value: raw, source: source };
    if (source === 'formula') {
      formulaInput.focus();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
      return;
    }
    const gridRect = gridScroll.getBoundingClientRect();
    const cellRect = target.getBoundingClientRect();
    editor.classList.remove('hidden');
    editor.style.left = String(cellRect.left - gridRect.left + gridScroll.scrollLeft - 1) + 'px';
    editor.style.top = String(cellRect.top - gridRect.top + gridScroll.scrollTop - 1) + 'px';
    editor.style.width = String(cellRect.width + 2) + 'px';
    editor.value = raw;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  function syncEditValue(nextValue, source) {
    if (!editState) {
      editState = { cellId: activeCell, previous: engine.getCellRaw(workbook, activeCell), value: '', source: source };
    }
    editState.value = nextValue;
    editState.source = source;
    if (source !== 'formula') {
      formulaInput.value = nextValue;
    }
    if (source !== 'cell') {
      editor.value = nextValue;
    }
  }

  function commitEdit(moveRow, moveCol) {
    if (editState) {
      engine.setCellRaw(workbook, editState.cellId, editState.value);
      editState = null;
      editor.classList.add('hidden');
      saveState();
    }
    render();
    if (moveRow || moveCol) {
      moveSelection(moveRow, moveCol, false);
    }
  }

  function cancelEdit() {
    editState = null;
    editor.classList.add('hidden');
    render();
  }

  function clearSelection() {
    eachSelectedCell(selection, function (cellId) {
      engine.setCellRaw(workbook, cellId, '');
    });
    saveState();
    render();
  }

  function bindPointerEvents() {
    grid.addEventListener('mousedown', function (event) {
      const td = event.target.closest('td[data-cell-id]');
      if (!td) {
        return;
      }
      const cellId = td.dataset.cellId;
      activeCell = cellId;
      if (event.shiftKey) {
        selection = { anchor: selection.anchor, focus: cellId };
      } else {
        selection = { anchor: cellId, focus: cellId };
      }
      dragAnchor = selection.anchor;
      render();
    });

    grid.addEventListener('mouseover', function (event) {
      if (!(event.buttons & 1) || !dragAnchor) {
        return;
      }
      const td = event.target.closest('td[data-cell-id]');
      if (!td) {
        return;
      }
      activeCell = td.dataset.cellId;
      selection = { anchor: dragAnchor, focus: activeCell };
      render();
    });

    document.addEventListener('mouseup', function () {
      dragAnchor = null;
    });

    grid.addEventListener('dblclick', function (event) {
      const td = event.target.closest('td[data-cell-id]');
      if (!td) {
        return;
      }
      activeCell = td.dataset.cellId;
      selection = { anchor: activeCell, focus: activeCell };
      render();
      beginEdit('cell', true);
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', function (event) {
      const targetTag = event.target.tagName;

      if (event.target === editor) {
        if (event.key === 'Enter') {
          event.preventDefault();
          syncEditValue(editor.value, 'cell');
          commitEdit(1, 0);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          syncEditValue(editor.value, 'cell');
          commitEdit(0, 1);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
        return;
      }

      if (event.target === formulaInput) {
        if (!editState) {
          beginEdit('formula', true);
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          syncEditValue(formulaInput.value, 'formula');
          commitEdit(1, 0);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
        return;
      }

      if (targetTag === 'INPUT') {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        beginEdit('cell', true);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearSelection();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1, 0, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1, 0, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelection(0, -1, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(0, 1, event.shiftKey);
        return;
      }
      if (event.key.length === 1) {
        event.preventDefault();
        beginEdit('cell', false);
        editor.value = event.key;
        syncEditValue(editor.value, 'cell');
      }
    });

    formulaInput.addEventListener('focus', function () {
      beginEdit('formula', true);
    });

    formulaInput.addEventListener('input', function () {
      syncEditValue(formulaInput.value, 'formula');
    });

    editor.addEventListener('input', function () {
      syncEditValue(editor.value, 'cell');
    });
  }

  function init() {
    loadState();
    buildGrid();
    bindPointerEvents();
    bindKeyboard();
    render();
    ensureVisible(activeCell);
  }

  init();
})();
