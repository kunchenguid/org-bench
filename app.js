(function () {
  const ROWS = 100;
  const COLS = 26;
  const formulaInput = document.getElementById('formula-input');
  const sheet = document.getElementById('sheet');
  const nameBox = document.getElementById('name-box');
  const selectionSize = document.getElementById('selection-size');
  const engine = window.SpreadsheetFormula.createEngine({
    getCellRaw(address) {
      return state.cells[address] || '';
    },
  });

  const state = loadState();
  let editor = null;
  let editorAddress = null;
  let formulaDraft = null;

  renderGrid();
  refresh();
  bindEvents();

  function bindEvents() {
    sheet.addEventListener('click', onCellClick);
    sheet.addEventListener('mousedown', onCellMouseDown);
    sheet.addEventListener('dblclick', function (event) {
      const cell = getCellElement(event.target);
      if (!cell) return;
      select(cell.dataset.address);
      beginEdit(cell.dataset.address, state.cells[cell.dataset.address] || '');
    });

    document.addEventListener('keydown', onKeyDown);
    formulaInput.addEventListener('focus', function () {
      formulaDraft = state.cells[state.selected] || '';
      formulaInput.select();
    });
    formulaInput.addEventListener('input', function () {
      formulaDraft = formulaInput.value;
    });
    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitValue(state.selected, formulaInput.value, { rowDelta: 1, colDelta: 0 });
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        formulaDraft = null;
        formulaInput.value = state.cells[state.selected] || '';
      }
    });
    formulaInput.addEventListener('blur', function () {
      if (formulaDraft !== null) {
        commitValue(state.selected, formulaInput.value);
      }
    });
  }

  function renderGrid() {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createHeaderCell('', 'corner'));
    for (let col = 0; col < COLS; col += 1) {
      headerRow.appendChild(createHeaderCell(window.SpreadsheetFormula.encodeColumn(col), 'col-header'));
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < ROWS; row += 1) {
      const rowElement = document.createElement('tr');
      rowElement.appendChild(createHeaderCell(String(row + 1), 'row-header'));
      for (let col = 0; col < COLS; col += 1) {
        const address = window.SpreadsheetFormula.encodeColumn(col) + String(row + 1);
        const td = document.createElement('td');
        td.dataset.address = address;
        const cell = document.createElement('div');
        cell.className = 'cell';
        td.appendChild(cell);
        rowElement.appendChild(td);
      }
      tbody.appendChild(rowElement);
    }

    sheet.appendChild(thead);
    sheet.appendChild(tbody);
  }

  function createHeaderCell(text, className) {
    const header = document.createElement('th');
    header.className = className;
    header.textContent = text;
    return header;
  }

  function onCellClick(event) {
    const cell = getCellElement(event.target);
    if (!cell) return;
    select(cell.dataset.address, event.shiftKey ? state.anchor : cell.dataset.address);
  }

  function onCellMouseDown(event) {
    const cell = getCellElement(event.target);
    if (!cell || event.button !== 0) return;
    const anchor = event.shiftKey ? state.anchor : cell.dataset.address;
    select(cell.dataset.address, anchor);

    function onMove(moveEvent) {
      const nextCell = getCellElement(moveEvent.target);
      if (!nextCell) return;
      select(nextCell.dataset.address, anchor, true);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveState();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.activeElement === formulaInput) return;
    if (editor) return handleEditorKey(event);

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(state.selected, state.cells[state.selected] || '');
      return;
    }

    const movement = keyToMovement(event.key);
    if (movement) {
      event.preventDefault();
      moveSelection(movement.rowDelta, movement.colDelta, event.shiftKey);
      return;
    }

    if (event.key.length === 1 && !event.isComposing) {
      event.preventDefault();
      beginEdit(state.selected, event.key, true);
    }
  }

  function handleEditorKey(event) {
    if (!editor) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      commitValue(editorAddress, editor.value, { rowDelta: 1, colDelta: 0 });
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitValue(editorAddress, editor.value, { rowDelta: 0, colDelta: 1 });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      endEdit(true);
    }
  }

  function beginEdit(address, initialValue, replaceMode) {
    endEdit(false);
    const td = findCell(address);
    if (!td) return;

    editor = document.createElement('input');
    editor.className = 'cell-editor';
    editor.type = 'text';
    editor.spellcheck = false;
    editor.value = initialValue;
    editorAddress = address;
    td.classList.add('editing');
    td.appendChild(editor);
    editor.focus();
    if (replaceMode) {
      editor.setSelectionRange(editor.value.length, editor.value.length);
    } else {
      editor.select();
    }
    formulaInput.value = editor.value;
    editor.addEventListener('input', function () {
      formulaInput.value = editor.value;
    });
    editor.addEventListener('blur', function () {
      if (editor) commitValue(editorAddress, editor.value);
    });
  }

  function endEdit(cancelled) {
    if (!editor) return;
    const td = findCell(editorAddress);
    if (td) td.classList.remove('editing');
    const previousAddress = editorAddress;
    editor.remove();
    editor = null;
    editorAddress = null;
    if (cancelled) {
      formulaInput.value = state.cells[previousAddress] || '';
    }
  }

  function commitValue(address, rawValue, moveAfter) {
    endEdit(false);
    if (rawValue) {
      state.cells[address] = rawValue;
    } else {
      delete state.cells[address];
    }
    formulaDraft = null;
    saveState();
    refresh();
    if (moveAfter) {
      moveSelection(moveAfter.rowDelta, moveAfter.colDelta);
    }
  }

  function select(address, anchorAddress, skipSave) {
    state.selected = address;
    state.anchor = anchorAddress || address;
    formulaDraft = null;
    if (!skipSave) saveState();
    refresh();
  }

  function moveSelection(rowDelta, colDelta, extendRange) {
    const decoded = window.SpreadsheetFormula.decodeAddress(state.selected);
    const nextRow = clamp(decoded.row + rowDelta, 0, ROWS - 1);
    const nextCol = clamp(decoded.col + colDelta, 0, COLS - 1);
    const nextAddress = window.SpreadsheetFormula.encodeColumn(nextCol) + String(nextRow + 1);
    select(nextAddress, extendRange ? state.anchor : nextAddress);
    const selected = findCell(state.selected);
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function refresh() {
    const range = window.SpreadsheetSelection.createSelection(state.anchor, state.selected);
    const cells = sheet.querySelectorAll('td[data-address]');
    cells.forEach(function (td) {
      const address = td.dataset.address;
      const display = engine.evaluateCell(address);
      const cell = td.firstElementChild;
      cell.textContent = display.display;
      cell.className = 'cell';
      if (display.type === 'number') cell.classList.add('numeric');
      if (display.type === 'error') cell.classList.add('error');
      const inRange = window.SpreadsheetSelection.isInRange(range, address);
      td.classList.toggle('in-range', inRange && address !== state.selected);
      td.classList.toggle('selected', address === state.selected);
    });
    highlightHeaders(range);
    nameBox.textContent = state.selected;
    selectionSize.textContent = String(range.endRow - range.startRow + 1) + ' x ' + String(range.endCol - range.startCol + 1);
    if (document.activeElement !== formulaInput || formulaDraft === null) {
      formulaInput.value = state.cells[state.selected] || '';
    }
  }

  function highlightHeaders(range) {
    const columnHeaders = sheet.querySelectorAll('thead th.col-header');
    columnHeaders.forEach(function (header, index) {
      header.classList.toggle('highlighted', index >= range.startCol && index <= range.endCol);
    });

    const rowHeaders = sheet.querySelectorAll('tbody th.row-header');
    rowHeaders.forEach(function (header, index) {
      header.classList.toggle('highlighted', index >= range.startRow && index <= range.endRow);
    });
  }

  function getCellElement(target) {
    return target.closest('td[data-address]');
  }

  function findCell(address) {
    return sheet.querySelector('td[data-address="' + address + '"]');
  }

  function keyToMovement(key) {
    if (key === 'ArrowUp') return { rowDelta: -1, colDelta: 0 };
    if (key === 'ArrowDown') return { rowDelta: 1, colDelta: 0 };
    if (key === 'ArrowLeft') return { rowDelta: 0, colDelta: -1 };
    if (key === 'ArrowRight') return { rowDelta: 0, colDelta: 1 };
    return null;
  }

  function loadState() {
    const fallback = { cells: {}, selected: 'A1', anchor: 'A1' };
    try {
      const stored = localStorage.getItem(storageKey());
      if (!stored) return fallback;
      const parsed = JSON.parse(stored);
      return {
        cells: parsed.cells || {},
        selected: parsed.selected || 'A1',
        anchor: parsed.anchor || parsed.selected || 'A1',
      };
    } catch (error) {
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(storageKey(), JSON.stringify({
      cells: state.cells,
      selected: state.selected,
      anchor: state.anchor,
    }));
  }

  function storageKey() {
    const namespace = window.__BENCHMARK_STORAGE_NAMESPACE__ || window.BENCHMARK_STORAGE_NAMESPACE || document.documentElement.dataset.storageNamespace || 'local';
    return namespace + ':apple-sheet';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
