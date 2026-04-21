(function () {
  const ROWS = 100;
  const COLS = 26;
  const storage = createStorage();
  const initial = storage.load();

  const state = {
    cells: initial.cells,
    selection: initial.selection,
    range: createRange(initial.selection, initial.selection),
    editing: null,
    dragging: false,
    history: [],
    future: [],
    formulaDraft: rawForCell(initial.selection),
  };

  const grid = document.getElementById('grid');
  const nameBox = document.getElementById('name-box');
  const formulaInput = document.getElementById('formula-input');

  renderGrid();
  syncFormulaBar();
  renderCells();
  scrollSelectionIntoView();

  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('mouseup', onDocumentMouseUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCut);
  document.addEventListener('paste', onPaste);

  formulaInput.addEventListener('input', function () {
    state.formulaDraft = formulaInput.value;
  });
  formulaInput.addEventListener('focus', function () {
    state.editing = { target: 'formula' };
  });
  formulaInput.addEventListener('blur', function () {
    if (state.editing && state.editing.target === 'formula') {
      commitFormulaBar();
    }
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitFormulaBar({ rowDelta: 1, colDelta: 0 });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitFormulaBar({ rowDelta: 0, colDelta: 1 });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
      grid.focus();
    }
  });

  function renderGrid() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(makeHeaderCell('corner', ''));
    for (let col = 0; col < COLS; col += 1) {
      fragment.appendChild(makeHeaderCell('column-header', SpreadsheetFormula.columnIndexToLabel(col), { col: col }));
    }
    for (let row = 0; row < ROWS; row += 1) {
      fragment.appendChild(makeHeaderCell('row-header', String(row + 1), { row: row }));
      for (let col = 0; col < COLS; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.tabIndex = -1;
        cell.addEventListener('mousedown', onCellMouseDown);
        cell.addEventListener('dblclick', function () {
          startEditing(rawForCell({ row: row, col: col }), 'cell');
        });
        fragment.appendChild(cell);
      }
    }
    grid.appendChild(fragment);
  }

  function makeHeaderCell(className, text, meta) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    if (meta && meta.col !== undefined) {
      element.dataset.headerCol = String(meta.col);
    }
    if (meta && meta.row !== undefined) {
      element.dataset.headerRow = String(meta.row);
    }
    return element;
  }

  function renderCells() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const cell = getCellElement(row, col);
        const address = toAddress({ row: row, col: col });
        const result = evaluateAddress(address);
        cell.textContent = result.display;
        cell.classList.toggle('numeric', result.type === 'number');
        cell.classList.toggle('error', result.type === 'error');
        const inRange = isWithinRange({ row: row, col: col }, state.range);
        cell.classList.toggle('range', inRange);
        cell.classList.toggle('active', row === state.selection.row && col === state.selection.col);
      }
    }

    const rowHeaders = grid.querySelectorAll('[data-header-row]');
    rowHeaders.forEach(function (header) {
      const row = Number(header.dataset.headerRow);
      const inRange = row >= state.range.top && row <= state.range.bottom;
      header.classList.toggle('range', inRange);
    });

    const colHeaders = grid.querySelectorAll('[data-header-col]');
    colHeaders.forEach(function (header) {
      const col = Number(header.dataset.headerCol);
      const inRange = col >= state.range.left && col <= state.range.right;
      header.classList.toggle('range', inRange);
    });

    syncFormulaBar();
    storage.save(state.cells, state.selection);
  }

  function syncFormulaBar() {
    nameBox.value = toAddress(state.selection);
    if (!state.editing || state.editing.target !== 'formula') {
      state.formulaDraft = rawForCell(state.selection);
      formulaInput.value = state.formulaDraft;
    }
  }

  function evaluateAddress(address, trail) {
    trail = trail || new Set();
    if (trail.has(address)) {
      return { type: 'error', value: '#CIRC!', display: '#CIRC!' };
    }
    trail.add(address);
    const result = SpreadsheetFormula.evaluateFormula(rawForCell(fromAddress(address)), {
      cells: state.cells,
      position: fromAddress(address),
      getCellRaw: function (nextAddress) {
        if (trail.has(nextAddress)) {
          return '=#CIRC!';
        }
        return rawForCell(fromAddress(nextAddress));
      },
    });
    trail.delete(address);
    return result;
  }

  function rawForCell(position) {
    return state.cells[toAddress(position)] || '';
  }

  function setRaw(position, raw) {
    const address = toAddress(position);
    if (raw === '') {
      delete state.cells[address];
    } else {
      state.cells[address] = raw;
    }
  }

  function onCellMouseDown(event) {
    const position = readPosition(event.currentTarget);
    if (event.shiftKey) {
      state.range = createRange(state.selection, position);
    } else {
      state.selection = position;
      state.range = createRange(position, position);
    }
    state.dragging = true;
    state.anchor = { row: state.selection.row, col: state.selection.col };
    renderCells();
  }

  function onDocumentMouseDown(event) {
    if (!grid.contains(event.target) && event.target !== formulaInput) {
      cancelEditing();
    }
  }

  function onDocumentMouseUp() {
    state.dragging = false;
  }

  grid.addEventListener('mouseover', function (event) {
    if (!state.dragging) {
      return;
    }
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    const position = readPosition(cell);
    state.selection = position;
    state.range = createRange(state.anchor, position);
    renderCells();
  });

  function onKeyDown(event) {
    const isModifier = event.metaKey || event.ctrlKey;
    if (isModifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (isModifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (state.editing && state.editing.target === 'cell') {
      handleCellEditorKey(event);
      return;
    }
    if (document.activeElement === formulaInput) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      startEditing(rawForCell(state.selection), 'cell');
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      startEditing(rawForCell(state.selection), 'cell');
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearRange();
      return;
    }
    if (isNavigationKey(event.key)) {
      event.preventDefault();
      moveSelection(event.key, event.shiftKey);
      return;
    }
    if (!isModifier && event.key.length === 1) {
      event.preventDefault();
      startEditing(event.key, 'cell', true);
    }
  }

  function handleCellEditorKey(event) {
    const editor = state.editing && state.editing.element;
    if (!editor) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditor({ rowDelta: 1, colDelta: 0 });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEditor({ rowDelta: 0, colDelta: 1 });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }

  function moveSelection(key, extend) {
    const delta = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    }[key];
    const next = clampPosition({ row: state.selection.row + delta.row, col: state.selection.col + delta.col });
    if (extend) {
      const anchor = state.anchor || state.selection;
      state.selection = next;
      state.range = createRange(anchor, next);
    } else {
      state.selection = next;
      state.range = createRange(next, next);
      state.anchor = next;
    }
    renderCells();
    scrollSelectionIntoView();
  }

  function startEditing(initialValue, target, replace) {
    cancelEditing(true);
    if (target === 'formula') {
      state.editing = { target: 'formula' };
      formulaInput.focus();
      formulaInput.select();
      return;
    }
    const cell = getCellElement(state.selection.row, state.selection.col);
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.type = 'text';
    input.spellcheck = false;
    input.value = replace ? initialValue : initialValue;
    cell.textContent = '';
    cell.appendChild(input);
    state.editing = { target: 'cell', element: input, original: rawForCell(state.selection) };
    input.focus();
    if (replace) {
      input.setSelectionRange(input.value.length, input.value.length);
    } else {
      input.select();
    }
    input.addEventListener('blur', function () {
      if (state.editing && state.editing.element === input) {
        commitEditor();
      }
    });
  }

  function commitEditor(moveDelta) {
    if (!state.editing || state.editing.target !== 'cell') {
      return;
    }
    const nextValue = state.editing.element.value;
    applyChange(function () {
      setRaw(state.selection, nextValue);
    });
    cancelEditing(true);
    if (moveDelta) {
      moveAfterCommit(moveDelta);
    }
  }

  function commitFormulaBar(moveDelta) {
    const nextValue = formulaInput.value;
    applyChange(function () {
      setRaw(state.selection, nextValue);
    });
    state.editing = null;
    renderCells();
    if (moveDelta) {
      moveAfterCommit(moveDelta);
    }
  }

  function moveAfterCommit(moveDelta) {
    state.selection = clampPosition({ row: state.selection.row + moveDelta.rowDelta, col: state.selection.col + moveDelta.colDelta });
    state.range = createRange(state.selection, state.selection);
    state.anchor = state.selection;
    renderCells();
  }

  function cancelEditing(silent) {
    if (!state.editing) {
      state.formulaDraft = rawForCell(state.selection);
      formulaInput.value = state.formulaDraft;
      return;
    }
    if (state.editing.target === 'cell' && state.editing.element) {
      state.editing.element.remove();
    }
    state.editing = null;
    if (!silent) {
      formulaInput.value = rawForCell(state.selection);
    }
    renderCells();
  }

  function clearRange() {
    applyChange(function () {
      eachPositionInRange(state.range, function (position) {
        setRaw(position, '');
      });
    });
    renderCells();
  }

  function onCopy(event) {
    if (!grid.contains(document.activeElement) && document.activeElement !== document.body) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', serializeRange(state.range));
  }

  function onCut(event) {
    if (!grid.contains(document.activeElement) && document.activeElement !== document.body) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', serializeRange(state.range));
    clearRange();
  }

  function onPaste(event) {
    if (document.activeElement === formulaInput) {
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    event.preventDefault();
    const matrix = text.split(/\r?\n/).filter(function (line, index, list) {
      return line !== '' || index < list.length - 1;
    }).map(function (line) {
      return line.split('\t');
    });
    if (!matrix.length) {
      return;
    }
    const sourceRange = inferSourceRange(matrix.length, matrix[0].length);
    applyChange(function () {
      for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
        for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset += 1) {
          const position = clampPosition({ row: state.range.top + rowOffset, col: state.range.left + colOffset });
          const value = matrix[rowOffset][colOffset];
          setRaw(position, shiftFormula(value, position.row - sourceRange.top, position.col - sourceRange.left));
        }
      }
      const bottom = Math.min(ROWS - 1, state.range.top + matrix.length - 1);
      const right = Math.min(COLS - 1, state.range.left + matrix[0].length - 1);
      state.selection = { row: state.range.top, col: state.range.left };
      state.range = createRange({ row: state.range.top, col: state.range.left }, { row: bottom, col: right });
      state.anchor = state.selection;
    });
    renderCells();
  }

  function serializeRange(range) {
    const lines = [];
    for (let row = range.top; row <= range.bottom; row += 1) {
      const values = [];
      for (let col = range.left; col <= range.right; col += 1) {
        values.push(rawForCell({ row: row, col: col }));
      }
      lines.push(values.join('\t'));
    }
    return lines.join('\n');
  }

  function inferSourceRange(height, width) {
    return {
      top: state.range.top,
      left: state.range.left,
      bottom: state.range.top + height - 1,
      right: state.range.left + width - 1,
    };
  }

  function shiftFormula(raw, rowOffset, colOffset) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (_, colMark, colLabel, rowMark, rowNumber) {
      const nextCol = colMark ? SpreadsheetFormula.columnLabelToIndex(colLabel) : SpreadsheetFormula.columnLabelToIndex(colLabel) + colOffset;
      const nextRow = rowMark ? Number(rowNumber) - 1 : Number(rowNumber) - 1 + rowOffset;
      const safeCol = Math.max(0, nextCol);
      const safeRow = Math.max(0, nextRow);
      return (colMark ? '$' : '') + SpreadsheetFormula.columnIndexToLabel(safeCol) + (rowMark ? '$' : '') + String(safeRow + 1);
    });
  }

  function applyChange(mutator) {
    const before = snapshotState();
    mutator();
    const after = snapshotState();
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    state.history.push({ before: before, after: after });
    if (state.history.length > 50) {
      state.history.shift();
    }
    state.future = [];
    renderCells();
  }

  function undo() {
    const action = state.history.pop();
    if (!action) {
      return;
    }
    state.future.push(action);
    restoreSnapshot(action.before);
    renderCells();
  }

  function redo() {
    const action = state.future.pop();
    if (!action) {
      return;
    }
    state.history.push(action);
    restoreSnapshot(action.after);
    renderCells();
  }

  function snapshotState() {
    return {
      cells: Object.assign({}, state.cells),
      selection: { row: state.selection.row, col: state.selection.col },
      range: Object.assign({}, state.range),
    };
  }

  function restoreSnapshot(snapshot) {
    state.cells = Object.assign({}, snapshot.cells);
    state.selection = { row: snapshot.selection.row, col: snapshot.selection.col };
    state.range = Object.assign({}, snapshot.range);
    state.anchor = { row: state.range.top, col: state.range.left };
    cancelEditing(true);
  }

  function createStorage() {
    const key = resolveStorageNamespace() + ':sheet-state';
    return {
      load: function () {
        try {
          const stored = localStorage.getItem(key);
          if (!stored) {
            return { cells: {}, selection: { row: 0, col: 0 } };
          }
          const parsed = JSON.parse(stored);
          return {
            cells: parsed.cells || {},
            selection: clampPosition(parsed.selection || { row: 0, col: 0 }),
          };
        } catch (error) {
          return { cells: {}, selection: { row: 0, col: 0 } };
        }
      },
      save: function (cells, selection) {
        localStorage.setItem(key, JSON.stringify({ cells: cells, selection: selection }));
      },
    };
  }

  function resolveStorageNamespace() {
    return window.__STORAGE_NAMESPACE__ || window.__BENCHMARK_STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'amazon-sheet';
  }

  function toAddress(position) {
    return SpreadsheetFormula.columnIndexToLabel(position.col) + String(position.row + 1);
  }

  function fromAddress(address) {
    const match = address.match(/^([A-Z]+)(\d+)$/);
    return { row: Number(match[2]) - 1, col: SpreadsheetFormula.columnLabelToIndex(match[1]) };
  }

  function getCellElement(row, col) {
    return grid.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]');
  }

  function readPosition(element) {
    return { row: Number(element.dataset.row), col: Number(element.dataset.col) };
  }

  function clampPosition(position) {
    return {
      row: Math.max(0, Math.min(ROWS - 1, position.row)),
      col: Math.max(0, Math.min(COLS - 1, position.col)),
    };
  }

  function createRange(a, b) {
    return {
      top: Math.min(a.row, b.row),
      bottom: Math.max(a.row, b.row),
      left: Math.min(a.col, b.col),
      right: Math.max(a.col, b.col),
    };
  }

  function isWithinRange(position, range) {
    return position.row >= range.top && position.row <= range.bottom && position.col >= range.left && position.col <= range.right;
  }

  function eachPositionInRange(range, callback) {
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        callback({ row: row, col: col });
      }
    }
  }

  function isNavigationKey(key) {
    return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
  }

  function scrollSelectionIntoView() {
    const active = getCellElement(state.selection.row, state.selection.col);
    if (active) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
})();
