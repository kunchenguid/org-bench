(function () {
  const {
    SpreadsheetModel,
    COLS,
    ROWS,
    colToName,
    parseCoord,
    toCoord,
    selectionToTSV,
    applyPaste,
    parseSelectionRect,
    forEachCoord,
  } = window.SpreadsheetLib;

  const namespace = window.__BENCHMARK_RUN_NAMESPACE__ || 'facebook-sheet';
  const storageKey = `${namespace}:sheet-state`;
  const model = new SpreadsheetModel(loadState());

  const history = {
    undo: [],
    redo: [],
  };

  const sheet = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const activeLabel = document.getElementById('active-label');

  const state = {
    active: loadState().active || 'A1',
    selection: loadState().selection || { start: 'A1', end: 'A1' },
    editing: null,
    dragAnchor: null,
  };

  renderGrid();
  renderAllCells();
  refreshSelection();
  syncFormulaBar();

  formulaInput.addEventListener('focus', () => beginEdit(state.active, model.getRaw(state.active), true));
  formulaInput.addEventListener('input', () => {
    if (state.editing) {
      state.editing.value = formulaInput.value;
      const input = document.querySelector(`input[data-coord="${state.editing.coord}"]`);
      if (input) {
        input.value = state.editing.value;
      }
    }
  });
  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ rowDelta: 1, colDelta: 0 });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCut);
  document.addEventListener('paste', handlePaste);

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (error) {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify({
      ...model.getSnapshot(),
      active: state.active,
      selection: state.selection,
    }));
  }

  function pushHistory() {
    history.undo.push(JSON.stringify({
      sheet: model.getSnapshot(),
      active: state.active,
      selection: state.selection,
    }));
    if (history.undo.length > 50) {
      history.undo.shift();
    }
    history.redo = [];
  }

  function restoreFromSnapshot(snapshotText) {
    const snapshot = JSON.parse(snapshotText);
    model.cells = new Map(Object.entries(snapshot.sheet.cells || {}));
    state.active = snapshot.active || 'A1';
    state.selection = snapshot.selection || { start: state.active, end: state.active };
    state.editing = null;
    renderAllCells();
    refreshSelection();
    syncFormulaBar();
    saveState();
  }

  function undo() {
    if (!history.undo.length) {
      return;
    }
    history.redo.push(JSON.stringify({ sheet: model.getSnapshot(), active: state.active, selection: state.selection }));
    restoreFromSnapshot(history.undo.pop());
  }

  function redo() {
    if (!history.redo.length) {
      return;
    }
    history.undo.push(JSON.stringify({ sheet: model.getSnapshot(), active: state.active, selection: state.selection }));
    restoreFromSnapshot(history.redo.pop());
  }

  function renderGrid() {
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner row-header';
    headRow.appendChild(corner);
    for (let col = 0; col < COLS; col += 1) {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.textContent = colToName(col);
      headRow.appendChild(th);
    }
    sheet.appendChild(headRow);

    for (let row = 0; row < ROWS; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (let col = 0; col < COLS; col += 1) {
        const coord = toCoord(row, col);
        const td = document.createElement('td');
        td.className = 'cell';
        td.dataset.coord = coord;
        td.addEventListener('mousedown', (event) => {
          event.preventDefault();
          state.dragAnchor = coord;
          setSelection(coord, coord);
        });
        td.addEventListener('mouseenter', () => {
          if (state.dragAnchor) {
            setSelection(state.dragAnchor, coord);
          }
        });
        td.addEventListener('dblclick', () => beginEdit(coord, model.getRaw(coord), false));

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.coord = coord;
        button.addEventListener('click', () => setSelection(coord, coord));
        button.addEventListener('focus', () => setSelection(coord, coord));
        td.appendChild(button);
        tr.appendChild(td);
      }
      sheet.appendChild(tr);
    }

    document.addEventListener('mouseup', () => {
      state.dragAnchor = null;
    });
  }

  function renderAllCells() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        renderCell(toCoord(row, col));
      }
    }
  }

  function renderCell(coord) {
    const td = document.querySelector(`td[data-coord="${coord}"]`);
    if (!td) {
      return;
    }
    const button = td.querySelector('button');
    const display = model.getDisplayValue(coord);
    td.classList.toggle('error', display.startsWith('#'));
    if (!state.editing || state.editing.coord !== coord) {
      td.innerHTML = '';
      const nextButton = document.createElement('button');
      nextButton.type = 'button';
      nextButton.dataset.coord = coord;
      nextButton.textContent = display;
      nextButton.addEventListener('click', () => setSelection(coord, coord));
      nextButton.addEventListener('focus', () => setSelection(coord, coord));
      td.appendChild(nextButton);
    } else if (button) {
      button.textContent = display;
    }
  }

  function syncFormulaBar() {
    activeLabel.textContent = state.active;
    formulaInput.value = state.editing ? state.editing.value : model.getRaw(state.active);
  }

  function setSelection(start, end) {
    state.active = end;
    state.selection = { start, end };
    refreshSelection();
    syncFormulaBar();
    saveState();
  }

  function refreshSelection() {
    const rect = parseSelectionRect(state.selection);
    document.querySelectorAll('.cell').forEach((cell) => {
      const coord = parseCoord(cell.dataset.coord);
      const inRange = coord.row >= rect.rowStart && coord.row <= rect.rowEnd && coord.col >= rect.colStart && coord.col <= rect.colEnd;
      cell.classList.toggle('in-range', inRange);
      cell.classList.toggle('active', cell.dataset.coord === state.active);
    });
    const activeButton = document.querySelector(`button[data-coord="${state.active}"]`);
    if (activeButton && document.activeElement !== formulaInput) {
      activeButton.focus({ preventScroll: true });
    }
  }

  function beginEdit(coord, initialValue, fromFormulaBar) {
    state.active = coord;
    state.selection = { start: coord, end: coord };
    state.editing = {
      coord,
      value: initialValue,
      original: model.getRaw(coord),
    };
    const td = document.querySelector(`td[data-coord="${coord}"]`);
    td.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    input.value = initialValue;
    input.dataset.coord = coord;
    input.addEventListener('input', () => {
      state.editing.value = input.value;
      formulaInput.value = input.value;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit({ rowDelta: 1, colDelta: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit({ rowDelta: 0, colDelta: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });
    td.appendChild(input);
    refreshSelection();
    syncFormulaBar();
    if (fromFormulaBar) {
      formulaInput.focus();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    } else {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function commitEdit(move) {
    if (!state.editing) {
      return;
    }
    pushHistory();
    model.setCell(state.editing.coord, state.editing.value);
    const current = parseCoord(state.editing.coord);
    state.editing = null;
    renderAllCells();
    const nextRow = Math.max(0, Math.min(ROWS - 1, current.row + move.rowDelta));
    const nextCol = Math.max(0, Math.min(COLS - 1, current.col + move.colDelta));
    setSelection(toCoord(nextRow, nextCol), toCoord(nextRow, nextCol));
    saveState();
  }

  function cancelEdit() {
    if (!state.editing) {
      return;
    }
    const coord = state.editing.coord;
    state.editing = null;
    renderCell(coord);
    refreshSelection();
    syncFormulaBar();
  }

  function updateActiveCell(raw) {
    pushHistory();
    model.setCell(state.active, raw);
    renderAllCells();
    syncFormulaBar();
    saveState();
  }

  function clearSelection() {
    pushHistory();
    model.clearRect(state.selection.start, state.selection.end);
    renderAllCells();
    syncFormulaBar();
    saveState();
  }

  function handleKeydown(event) {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (meta && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
      event.preventDefault();
      redo();
      return;
    }
    if (state.editing) {
      return;
    }
    if (document.activeElement === formulaInput && !meta) {
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        return;
      }
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(state.active, model.getRaw(state.active), false);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key.length === 1 && !meta && !event.altKey) {
      event.preventDefault();
      beginEdit(state.active, event.key, false);
      return;
    }
    const deltas = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
      Tab: { row: 0, col: event.shiftKey ? -1 : 1 },
    };
    if (deltas[event.key]) {
      event.preventDefault();
      moveSelection(deltas[event.key], event.shiftKey);
    }
  }

  function moveSelection(delta, extend) {
    const current = parseCoord(state.active);
    const next = toCoord(
      Math.max(0, Math.min(ROWS - 1, current.row + delta.row)),
      Math.max(0, Math.min(COLS - 1, current.col + delta.col))
    );
    if (extend) {
      setSelection(state.selection.start, next);
    } else {
      setSelection(next, next);
    }
  }

  function handleCopy(event) {
    if (state.editing) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', selectionToTSV(model, state.selection));
    event.clipboardData.setData('application/x-facebook-sheet', JSON.stringify({
      selection: state.selection,
    }));
  }

  function handleCut(event) {
    if (state.editing) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', selectionToTSV(model, state.selection));
    event.clipboardData.setData('application/x-facebook-sheet', JSON.stringify({
      selection: state.selection,
    }));
    clearSelection();
  }

  function handlePaste(event) {
    if (state.editing) {
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    let metadata = null;
    try {
      metadata = JSON.parse(event.clipboardData.getData('application/x-facebook-sheet') || 'null');
    } catch (error) {
      metadata = null;
    }
    event.preventDefault();
    pushHistory();
    applyPaste(model, state.active, text, {
      sourceSelection: metadata && metadata.selection ? metadata.selection : null,
    });
    renderAllCells();
    syncFormulaBar();
    saveState();
  }
}());
