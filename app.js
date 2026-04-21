(function () {
  const core = window.SpreadsheetCore;
  const grid = document.getElementById('grid');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const status = document.getElementById('status');
  const rowLabel = document.getElementById('row-label');
  const colLabel = document.getElementById('col-label');
  const insertRowAboveButton = document.getElementById('insert-row-above');
  const insertRowBelowButton = document.getElementById('insert-row-below');
  const deleteRowButton = document.getElementById('delete-row');
  const insertColLeftButton = document.getElementById('insert-col-left');
  const insertColRightButton = document.getElementById('insert-col-right');
  const deleteColButton = document.getElementById('delete-col');

  const storageNamespace = window.__BENCHMARK_STORAGE_NAMESPACE__ || window.BENCHMARK_STORAGE_NAMESPACE || document.documentElement.dataset.storageNamespace || 'spreadsheet-default';
  const storageKey = storageNamespace + ':sheet';

  const state = {
    cells: {},
    selection: core.makeEmptySelection(),
    editing: null,
    dragAnchor: null,
    formulaDirty: false,
    history: [],
    future: [],
    clipboard: null,
    cutSelection: null,
  };

  const domCells = {};

  function snapshotState() {
    return {
      cells: core.cloneCells(state.cells),
      selection: Object.assign({}, state.selection),
    };
  }

  function pushHistory(before, after) {
    state.history.push({ before, after });
    if (state.history.length > 50) state.history.shift();
    state.future = [];
  }

  function restoreSnapshot(snapshot) {
    state.cells = core.cloneCells(snapshot.cells);
    state.selection = Object.assign({}, snapshot.selection);
    state.editing = null;
    save();
    render();
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify({ cells: state.cells, selection: state.selection }));
  }

  function load() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      state.cells = parsed.cells || {};
      state.selection = parsed.selection || core.makeEmptySelection();
    } catch (error) {
      console.error(error);
    }
  }

  function getActiveCellId() {
    return core.cellId(state.selection.focusCol, state.selection.focusRow);
  }

  function clampSelection() {
    state.selection.anchorCol = Math.max(0, Math.min(core.COL_COUNT - 1, state.selection.anchorCol));
    state.selection.focusCol = Math.max(0, Math.min(core.COL_COUNT - 1, state.selection.focusCol));
    state.selection.anchorRow = Math.max(0, Math.min(core.ROW_COUNT - 1, state.selection.anchorRow));
    state.selection.focusRow = Math.max(0, Math.min(core.ROW_COUNT - 1, state.selection.focusRow));
  }

  function moveSelection(rowDelta, colDelta, extend) {
    if (!extend) {
      state.selection.anchorRow = state.selection.focusRow;
      state.selection.anchorCol = state.selection.focusCol;
    }
    state.selection.focusRow = Math.max(0, Math.min(core.ROW_COUNT - 1, state.selection.focusRow + rowDelta));
    state.selection.focusCol = Math.max(0, Math.min(core.COL_COUNT - 1, state.selection.focusCol + colDelta));
    if (!extend) {
      state.selection.anchorRow = state.selection.focusRow;
      state.selection.anchorCol = state.selection.focusCol;
    }
    render();
    save();
  }

  function setSelection(row, col, extend) {
    if (!extend) {
      state.selection.anchorRow = row;
      state.selection.anchorCol = col;
    }
    state.selection.focusRow = row;
    state.selection.focusCol = col;
    clampSelection();
    render();
    save();
  }

  function getSelectedRaw() {
    return state.cells[getActiveCellId()] || '';
  }

  function beginEdit(initialValue, selectAll) {
    const id = getActiveCellId();
    state.editing = {
      id,
      original: state.cells[id] || '',
      value: initialValue,
      selectAll,
    };
    render();
    const editor = domCells[id].querySelector('input');
    if (editor) {
      editor.focus();
      if (selectAll) editor.select();
      else editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  function cancelEdit() {
    if (!state.editing) return;
    state.editing = null;
    render();
  }

  function commitEdit(nextPosition) {
    if (!state.editing) return;
    const before = snapshotState();
    const value = state.editing.value;
    if (value) state.cells[state.editing.id] = value;
    else delete state.cells[state.editing.id];
    state.editing = null;
    if (nextPosition === 'down') moveSelection(1, 0, false);
    if (nextPosition === 'right') moveSelection(0, 1, false);
    const after = snapshotState();
    pushHistory(before, after);
    save();
    render();
  }

  function clearSelection() {
    const before = snapshotState();
    const bounds = core.normalizeSelection(state.selection);
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
        delete state.cells[core.cellId(col, row)];
      }
    }
    const after = snapshotState();
    pushHistory(before, after);
    save();
    render();
  }

  function pasteGrid(text) {
    const matrix = core.parseClipboard(text);
    const bounds = core.normalizeSelection(state.selection);
    const targetHeight = bounds.endRow - bounds.startRow + 1;
    const targetWidth = bounds.endCol - bounds.startCol + 1;
    const sourceHeight = matrix.length;
    const sourceWidth = Math.max.apply(null, matrix.map(function (row) { return row.length; }));
    const before = snapshotState();
    const pasteHeight = targetHeight === sourceHeight && targetWidth === sourceWidth ? targetHeight : sourceHeight;
    const pasteWidth = targetHeight === sourceHeight && targetWidth === sourceWidth ? targetWidth : sourceWidth;
    for (let rowOffset = 0; rowOffset < pasteHeight; rowOffset += 1) {
      for (let colOffset = 0; colOffset < pasteWidth; colOffset += 1) {
        const row = matrix[rowOffset] || [];
        const value = row[colOffset] || '';
        const destinationId = core.cellId(bounds.startCol + colOffset, bounds.startRow + rowOffset);
        let nextValue = value;
        if (value && value[0] === '=' && state.clipboard) {
          nextValue = core.adjustFormulaForPaste(
            value,
            state.clipboard.bounds.startRow + rowOffset,
            state.clipboard.bounds.startCol + colOffset,
            bounds.startRow + rowOffset,
            bounds.startCol + colOffset
          );
        }
        if (nextValue) state.cells[destinationId] = nextValue;
        else delete state.cells[destinationId];
      }
    }
    if (state.cutSelection) {
      const source = state.cutSelection;
      for (let row = source.startRow; row <= source.endRow; row += 1) {
        for (let col = source.startCol; col <= source.endCol; col += 1) {
          delete state.cells[core.cellId(col, row)];
        }
      }
      state.cutSelection = null;
    }
    const after = snapshotState();
    pushHistory(before, after);
    save();
    render();
  }

  function applyStructuralChange(kind) {
    const before = snapshotState();
    switch (kind) {
      case 'insert-row-above':
        state.cells = core.insertRow(state.cells, state.selection.focusRow, 1);
        break;
      case 'insert-row-below':
        state.cells = core.insertRow(state.cells, state.selection.focusRow + 1, 1);
        state.selection.focusRow += 1;
        state.selection.anchorRow = state.selection.focusRow;
        break;
      case 'delete-row':
        state.cells = core.deleteRow(state.cells, state.selection.focusRow, 1);
        state.selection.focusRow = Math.min(state.selection.focusRow, core.ROW_COUNT - 1);
        state.selection.anchorRow = state.selection.focusRow;
        break;
      case 'insert-col-left':
        state.cells = core.insertCol(state.cells, state.selection.focusCol, 1);
        break;
      case 'insert-col-right':
        state.cells = core.insertCol(state.cells, state.selection.focusCol + 1, 1);
        state.selection.focusCol += 1;
        state.selection.anchorCol = state.selection.focusCol;
        break;
      case 'delete-col':
        state.cells = core.deleteCol(state.cells, state.selection.focusCol, 1);
        state.selection.focusCol = Math.min(state.selection.focusCol, core.COL_COUNT - 1);
        state.selection.anchorCol = state.selection.focusCol;
        break;
    }
    const after = snapshotState();
    pushHistory(before, after);
    save();
    render();
  }

  function render() {
    const evaluated = core.evaluateSheet(state.cells);
    const bounds = core.normalizeSelection(state.selection);
    nameBox.textContent = getActiveCellId();
    formulaInput.value = state.editing ? state.editing.value : getSelectedRaw();
    rowLabel.textContent = String(state.selection.focusRow + 1);
    colLabel.textContent = core.indexToCol(state.selection.focusCol);
    status.textContent = `${bounds.endCol - bounds.startCol + 1} x ${bounds.endRow - bounds.startRow + 1}`;

    Object.keys(domCells).forEach(function (id) {
      const cell = domCells[id];
      const parsed = core.parseCellId(id);
      const inRange = parsed.col >= bounds.startCol && parsed.col <= bounds.endCol && parsed.row >= bounds.startRow && parsed.row <= bounds.endRow;
      const active = parsed.col === state.selection.focusCol && parsed.row === state.selection.focusRow;
      cell.className = 'cell';
      if (inRange) cell.classList.add('selected');
      if (active) cell.classList.add('active');
      const value = evaluated[id] ? evaluated[id].display : '';
      cell.dataset.value = value;
      cell.innerHTML = '';
      if (state.editing && state.editing.id === id) {
        const input = document.createElement('input');
        input.className = 'cell-editor';
        input.value = state.editing.value;
        input.addEventListener('input', function () {
          state.editing.value = input.value;
          formulaInput.value = input.value;
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitEdit('down');
          } else if (event.key === 'Tab') {
            event.preventDefault();
            commitEdit('right');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEdit();
          }
        });
        input.addEventListener('blur', function () {
          if (state.editing) commitEdit();
        });
        cell.appendChild(input);
      } else {
        cell.textContent = value;
        if (typeof value === 'string' && /^-?\d/.test(value)) cell.classList.add('numeric');
        if (String(value).startsWith('#')) cell.classList.add('error');
      }
    });
  }

  function buildGrid() {
    const fragment = document.createDocumentFragment();
    const table = document.createElement('table');
    table.className = 'sheet';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    corner.textContent = '#';
    headerRow.appendChild(corner);
    for (let col = 0; col < core.COL_COUNT; col += 1) {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.textContent = core.indexToCol(col);
      th.addEventListener('click', function () {
        setSelection(state.selection.focusRow, col, false);
      });
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let row = 0; row < core.ROW_COUNT; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      rowHeader.addEventListener('click', function () {
        setSelection(row, state.selection.focusCol, false);
      });
      tr.appendChild(rowHeader);
      for (let col = 0; col < core.COL_COUNT; col += 1) {
        const td = document.createElement('td');
        const id = core.cellId(col, row);
        td.className = 'cell';
        td.dataset.cell = id;
        td.addEventListener('mousedown', function (event) {
          event.preventDefault();
          state.dragAnchor = { row, col };
          if (event.shiftKey) {
            state.selection.focusRow = row;
            state.selection.focusCol = col;
          } else {
            setSelection(row, col, false);
          }
          render();
        });
        td.addEventListener('mouseenter', function () {
          if (!state.dragAnchor) return;
          state.selection.anchorRow = state.dragAnchor.row;
          state.selection.anchorCol = state.dragAnchor.col;
          state.selection.focusRow = row;
          state.selection.focusCol = col;
          render();
        });
        td.addEventListener('dblclick', function () {
          setSelection(row, col, false);
          beginEdit(state.cells[id] || '', false);
        });
        domCells[id] = td;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    fragment.appendChild(table);
    grid.appendChild(fragment);
  }

  document.addEventListener('mouseup', function () {
    state.dragAnchor = null;
  });

  document.addEventListener('keydown', function (event) {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const entry = event.shiftKey ? state.future.pop() : state.history.pop();
      if (!entry) return;
      if (event.shiftKey) {
        state.history.push(entry);
        restoreSnapshot(entry.after);
      } else {
        state.future.push(entry);
        restoreSnapshot(entry.before);
      }
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      const entry = state.future.pop();
      if (!entry) return;
      state.history.push(entry);
      restoreSnapshot(entry.after);
      return;
    }
    if (meta && (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'x' || event.key.toLowerCase() === 'v')) {
      return;
    }
    if (state.editing) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0, event.shiftKey);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0, event.shiftKey);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1, event.shiftKey);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1, event.shiftKey);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(getSelectedRaw(), false);
    } else if (event.key.length === 1 && !meta && !event.altKey) {
      event.preventDefault();
      beginEdit(event.key, true);
    }
  });

  document.addEventListener('copy', function (event) {
    const bounds = core.normalizeSelection(state.selection);
    const text = core.serializeRange(state.cells, state.selection);
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    state.clipboard = { text, bounds };
    state.cutSelection = null;
  });

  document.addEventListener('cut', function (event) {
    const bounds = core.normalizeSelection(state.selection);
    const text = core.serializeRange(state.cells, state.selection);
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    state.clipboard = { text, bounds };
    state.cutSelection = bounds;
  });

  document.addEventListener('paste', function (event) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    if (!state.clipboard || state.clipboard.text !== text) {
      state.clipboard = null;
      state.cutSelection = null;
    }
    pasteGrid(text);
  });

  formulaInput.addEventListener('focus', function () {
    state.formulaDirty = false;
  });
  formulaInput.addEventListener('input', function () {
    state.formulaDirty = true;
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const before = snapshotState();
      const id = getActiveCellId();
      if (formulaInput.value) state.cells[id] = formulaInput.value;
      else delete state.cells[id];
      moveSelection(1, 0, false);
      const after = snapshotState();
      pushHistory(before, after);
      save();
      render();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      formulaInput.value = getSelectedRaw();
      render();
    }
  });
  formulaInput.addEventListener('blur', function () {
    if (!state.formulaDirty) return;
    const before = snapshotState();
    const id = getActiveCellId();
    if (formulaInput.value) state.cells[id] = formulaInput.value;
    else delete state.cells[id];
    const after = snapshotState();
    pushHistory(before, after);
    save();
    render();
  });

  insertRowAboveButton.addEventListener('click', function () { applyStructuralChange('insert-row-above'); });
  insertRowBelowButton.addEventListener('click', function () { applyStructuralChange('insert-row-below'); });
  deleteRowButton.addEventListener('click', function () { applyStructuralChange('delete-row'); });
  insertColLeftButton.addEventListener('click', function () { applyStructuralChange('insert-col-left'); });
  insertColRightButton.addEventListener('click', function () { applyStructuralChange('insert-col-right'); });
  deleteColButton.addEventListener('click', function () { applyStructuralChange('delete-col'); });

  load();
  buildGrid();
  render();
})();
