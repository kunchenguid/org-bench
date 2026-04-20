(function () {
  const engine = window.SpreadsheetEngine;
  const columnCount = 26;
  const rowCount = 100;
  const grid = document.getElementById('grid');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const statusValue = document.getElementById('status-value');
  const storagePrefix = String(window.__RUN_STORAGE_NAMESPACE__ || window.RUN_STORAGE_NAMESPACE || 'spreadsheet');
  const storageKey = storagePrefix + ':sheet-state';

  const state = {
    cells: {},
    computed: {},
    selected: 'A1',
    editing: false,
    editValue: '',
    previousValue: '',
    editor: null,
  };

  loadState();
  state.computed = engine.evaluateSheet(state.cells);
  buildGrid();
  renderAll();
  attachEvents();

  function buildGrid() {
    const table = document.createElement('table');
    table.className = 'sheet-table';
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    for (let column = 1; column <= columnCount; column += 1) {
      const th = document.createElement('th');
      th.className = 'column-header';
      th.textContent = engine.columnToName(column);
      headerRow.appendChild(th);
    }
    table.appendChild(headerRow);

    for (let row = 1; row <= rowCount; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row);
      tr.appendChild(rowHeader);

      for (let column = 1; column <= columnCount; column += 1) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.tabIndex = -1;
        const id = engine.columnToName(column) + String(row);
        td.dataset.cell = id;
        td.addEventListener('mousedown', handleCellMouseDown);
        td.addEventListener('dblclick', function () {
          selectCell(id);
          beginEdit(false, 'cell');
        });
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    grid.appendChild(table);
  }

  function attachEvents() {
    document.addEventListener('keydown', handleKeyDown);
    formulaInput.addEventListener('focus', function () {
      beginEdit(false, 'formula');
    });
    formulaInput.addEventListener('input', function () {
      if (!state.editing || state.editor !== 'formula') {
        beginEdit(false, 'formula');
      }
      state.editValue = formulaInput.value;
    });
    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(moveSelection(0, 1));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(moveSelection(1, 0));
      }
    });
  }

  function handleCellMouseDown(event) {
    const id = event.currentTarget.dataset.cell;
    if (state.editing && state.editor === 'cell' && state.selected !== id) {
      commitEdit(id);
      return;
    }
    selectCell(id);
  }

  function handleKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (state.editing && state.editor === 'cell') {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(moveSelection(0, 1));
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(moveSelection(1, 0));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
      return;
    }

    if (document.activeElement === formulaInput) {
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(false, 'cell');
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectCell(moveSelection(0, -1));
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectCell(moveSelection(0, 1));
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectCell(moveSelection(-1, 0));
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'Tab') {
      event.preventDefault();
      selectCell(moveSelection(1, 0));
      return;
    }
    if (event.key === 'Escape') {
      return;
    }
    if (isTypingKey(event)) {
      event.preventDefault();
      beginEdit(true, 'cell', event.key);
    }
  }

  function isTypingKey(event) {
    return event.key.length === 1;
  }

  function beginEdit(replace, source, initialValue) {
    const raw = state.cells[state.selected] || '';
    state.editing = true;
    state.editor = source;
    state.previousValue = raw;
    state.editValue = replace ? initialValue : raw;
    if (source === 'cell') {
      mountCellEditor();
    }
    formulaInput.value = state.editValue;
    statusValue.textContent = 'Editing';
  }

  function mountCellEditor() {
    unmountCellEditor();
    const cell = findCell(state.selected);
    if (!cell) {
      return;
    }
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = state.editValue;
    input.addEventListener('input', function () {
      state.editValue = input.value;
      formulaInput.value = state.editValue;
    });
    input.addEventListener('blur', function () {
      if (state.editing && state.editor === 'cell') {
        commitEdit(state.selected);
      }
    });
    cell.textContent = '';
    cell.appendChild(input);
    state.editor = 'cell';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function unmountCellEditor() {
    const existing = document.querySelector('.cell-editor');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function commitEdit(nextSelection) {
    if (!state.editing) {
      if (nextSelection) {
        selectCell(nextSelection);
      }
      return;
    }

    const trimmed = state.editValue;
    if (trimmed === '') {
      delete state.cells[state.selected];
    } else {
      state.cells[state.selected] = trimmed;
    }
    state.editing = false;
    state.editor = null;
    state.computed = engine.evaluateSheet(state.cells);
    persistState();
    renderAll();
    selectCell(nextSelection || state.selected);
  }

  function cancelEdit() {
    state.editing = false;
    state.editor = null;
    state.editValue = state.previousValue;
    renderAll();
    selectCell(state.selected);
  }

  function selectCell(id) {
    state.selected = clampCellId(id);
    persistState();
    renderAll();
    const cell = findCell(state.selected);
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function renderAll() {
    const cells = grid.querySelectorAll('[data-cell]');
    cells.forEach(function (cell) {
      const id = cell.dataset.cell;
      const computed = state.computed[id];
      const raw = state.cells[id] || '';
      cell.classList.toggle('selected', id === state.selected);
      cell.classList.toggle('error', Boolean(computed && computed.error));
      cell.classList.toggle('numeric', isNumericDisplay(computed, raw));
      if (!(state.editing && state.editor === 'cell' && id === state.selected)) {
        cell.textContent = computed ? computed.display : raw;
      }
    });

    nameBox.textContent = state.selected;
    formulaInput.value = state.editing ? state.editValue : (state.cells[state.selected] || '');
    const selectedComputed = state.computed[state.selected];
    statusValue.textContent = selectedComputed && selectedComputed.error ? selectedComputed.error : 'Ready';
    if (state.editing && state.editor === 'cell') {
      mountCellEditor();
    }
  }

  function isNumericDisplay(computed, raw) {
    if (computed && typeof computed.value === 'number') {
      return true;
    }
    const normalized = engine.normalizeInput(raw || '');
    return normalized.type === 'number';
  }

  function moveSelection(deltaColumn, deltaRow) {
    const parsed = parseCellId(state.selected);
    const nextColumn = Math.max(1, Math.min(columnCount, parsed.column + deltaColumn));
    const nextRow = Math.max(1, Math.min(rowCount, parsed.row + deltaRow));
    return engine.columnToName(nextColumn) + String(nextRow);
  }

  function parseCellId(id) {
    const match = /^([A-Z]+)(\d+)$/.exec(id);
    return {
      column: engine.nameToColumn(match[1]),
      row: Number(match[2]),
    };
  }

  function clampCellId(id) {
    const parsed = parseCellId(id);
    const column = Math.max(1, Math.min(columnCount, parsed.column));
    const row = Math.max(1, Math.min(rowCount, parsed.row));
    return engine.columnToName(column) + String(row);
  }

  function findCell(id) {
    return grid.querySelector('[data-cell="' + id + '"]');
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        return;
      }
      const parsed = JSON.parse(saved);
      state.cells = parsed.cells || {};
      state.selected = parsed.selected || 'A1';
    } catch (error) {
      state.cells = {};
      state.selected = 'A1';
    }
  }

  function persistState() {
    localStorage.setItem(storageKey, JSON.stringify({
      cells: state.cells,
      selected: state.selected,
    }));
  }
})();
