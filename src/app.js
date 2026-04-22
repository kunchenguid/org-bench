(function () {
  const stateApi = typeof require === 'function' ? require('./grid-state.js') : window.oracleSheetState;
  const {
    keyForCell,
    getCellRaw,
    createInitialState,
    moveSelection,
    extendSelection,
    beginEdit,
    updateDraft,
    commitEdit,
    cancelEdit,
  } = stateApi;

  const COL_LABELS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  const state = createInitialState();

  const table = document.getElementById('sheet-grid');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const statusBar = document.getElementById('status-bar');
  const hookListeners = new Map();

  let isDragging = false;

  function cellLabel(row, col) {
    return `${COL_LABELS[col]}${row + 1}`;
  }

  function selectionBounds() {
    const minRow = Math.min(state.selection.anchor.row, state.selection.focus.row);
    const maxRow = Math.max(state.selection.anchor.row, state.selection.focus.row);
    const minCol = Math.min(state.selection.anchor.col, state.selection.focus.col);
    const maxCol = Math.max(state.selection.anchor.col, state.selection.focus.col);

    return { minRow, maxRow, minCol, maxCol };
  }

  function isCellInRange(row, col) {
    const bounds = selectionBounds();
    return row >= bounds.minRow && row <= bounds.maxRow && col >= bounds.minCol && col <= bounds.maxCol;
  }

  function emitHook(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
    const listeners = hookListeners.get(name) || [];
    listeners.forEach((listener) => listener(detail));
    statusBar.textContent = detail.message;
  }

  function onHook(name, listener) {
    const listeners = hookListeners.get(name) || [];
    listeners.push(listener);
    hookListeners.set(name, listeners);

    return function unsubscribe() {
      hookListeners.set(name, (hookListeners.get(name) || []).filter((entry) => entry !== listener));
    };
  }

  function setCellContents(row, col, raw) {
    state.cells[keyForCell(row, col)] = raw;
    render();
  }

  function replaceCells(nextCells) {
    state.cells = { ...nextCells };
    render();
  }

  function setSelection(row, col) {
    moveSelection(state, row, col);
    render();
    focusActiveCell();
  }

  function getSnapshot() {
    return {
      selection: {
        anchor: { ...state.selection.anchor },
        focus: { ...state.selection.focus },
      },
      cells: { ...state.cells },
      mode: state.mode,
      editor: state.editor ? { ...state.editor } : null,
    };
  }

  function clearSelectionValues() {
    const bounds = selectionBounds();

    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
        state.cells[keyForCell(row, col)] = '';
      }
    }

    emitHook('spreadsheet:history', {
      type: 'clear-range',
      bounds,
      message: `Cleared ${cellLabel(bounds.minRow, bounds.minCol)}:${cellLabel(bounds.maxRow, bounds.maxCol)}.`,
    });
  }

  function syncFormulaBar() {
    nameBox.value = cellLabel(state.selection.focus.row, state.selection.focus.col);
    formulaInput.value = state.mode === 'edit' && state.editor ? state.editor.draft : getCellRaw(state, state.selection.focus.row, state.selection.focus.col);
  }

  function commitAndMove(deltaRow, deltaCol) {
    commitEdit(state);
    moveSelection(state, state.selection.focus.row + deltaRow, state.selection.focus.col + deltaCol);
    render();
    focusActiveCell();
  }

  function focusActiveCell() {
    const selector = `[data-cell='${state.selection.focus.row}:${state.selection.focus.col}']`;
    const target = table.querySelector(selector);
    if (target) {
      target.focus();
    }
  }

  function handleHeaderAction(event) {
    const button = event.target.closest('[data-header-action]');
    if (!button) {
      return;
    }

    const axis = button.getAttribute('data-axis');
    const action = button.getAttribute('data-header-action');
    const index = Number(button.getAttribute('data-index'));

    emitHook(`spreadsheet:${axis}-action`, {
      axis,
      action,
      index,
      message: `${axis === 'row' ? 'Row' : 'Column'} ${index + 1} ${action.replace('-', ' ')} requested.`,
    });
  }

  function render() {
    const bounds = selectionBounds();
    const isEditing = state.mode === 'edit' && state.editor;
    let html = '<thead><tr><th class="corner-cell"></th>';

    for (let col = 0; col < state.grid.cols; col += 1) {
      const active = col >= bounds.minCol && col <= bounds.maxCol ? ' is-active' : '';
      html += `<th class="col-header${active}"><div class="header-inner"><span class="header-title">${COL_LABELS[col]}</span><span class="header-actions"><button class="header-action" type="button" data-axis="col" data-index="${col}" data-header-action="insert-before" aria-label="Insert column before ${COL_LABELS[col]}">+</button><button class="header-action" type="button" data-axis="col" data-index="${col}" data-header-action="delete" aria-label="Delete column ${COL_LABELS[col]}">-</button></span></div></th>`;
    }

    html += '</tr></thead><tbody>';

    for (let row = 0; row < state.grid.rows; row += 1) {
      const rowActive = row >= bounds.minRow && row <= bounds.maxRow ? ' is-active' : '';
      html += `<tr><th class="row-header${rowActive}"><div class="header-inner"><span class="header-title">${row + 1}</span><span class="header-actions"><button class="header-action" type="button" data-axis="row" data-index="${row}" data-header-action="insert-before" aria-label="Insert row before ${row + 1}">+</button><button class="header-action" type="button" data-axis="row" data-index="${row}" data-header-action="delete" aria-label="Delete row ${row + 1}">-</button></span></div></th>`;

      for (let col = 0; col < state.grid.cols; col += 1) {
        const active = row === state.selection.focus.row && col === state.selection.focus.col;
        const inRange = isCellInRange(row, col);
        const classes = ['sheet-cell'];
        if (inRange) classes.push('is-in-range');
        if (active) classes.push('is-active');
        if (isEditing && row === state.editor.row && col === state.editor.col) classes.push('is-editing');
        const raw = getCellRaw(state, row, col);
        const safeRaw = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        html += `<td class="${classes.join(' ')}">`;
        if (isEditing && row === state.editor.row && col === state.editor.col && state.editor.source === 'cell') {
          html += `<input class="cell-editor" data-cell="${row}:${col}" value="${state.editor.draft.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}" aria-label="Edit ${cellLabel(row, col)}">`;
        } else {
          html += `<button class="cell-button" type="button" data-cell="${row}:${col}" aria-label="${cellLabel(row, col)}">${safeRaw}</button>`;
        }
        html += '</td>';
      }

      html += '</tr>';
    }

    html += '</tbody>';
    table.innerHTML = html;
    syncFormulaBar();
  }

  table.addEventListener('click', (event) => {
    handleHeaderAction(event);

    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }

    const [row, col] = cell.getAttribute('data-cell').split(':').map(Number);
    if (event.shiftKey) {
      extendSelection(state, row, col);
    } else {
      moveSelection(state, row, col);
    }

    render();
    focusActiveCell();
  });

  table.addEventListener('dblclick', (event) => {
    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }

    const [row, col] = cell.getAttribute('data-cell').split(':').map(Number);
    moveSelection(state, row, col);
    beginEdit(state, 'cell');
    render();
    focusActiveCell();
  });

  table.addEventListener('input', (event) => {
    if (event.target.classList.contains('cell-editor')) {
      updateDraft(state, event.target.value);
      syncFormulaBar();
    }
  });

  table.addEventListener('mousedown', (event) => {
    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }

    const [row, col] = cell.getAttribute('data-cell').split(':').map(Number);
    moveSelection(state, row, col);
    isDragging = true;
    render();
  });

  table.addEventListener('mouseover', (event) => {
    if (!isDragging || state.mode === 'edit') {
      return;
    }

    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }

    const [row, col] = cell.getAttribute('data-cell').split(':').map(Number);
    extendSelection(state, row, col);
    render();
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  formulaInput.addEventListener('focus', () => {
    if (state.mode !== 'edit') {
      beginEdit(state, 'formula');
      render();
      formulaInput.focus();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    }
  });

  formulaInput.addEventListener('input', () => {
    if (state.mode !== 'edit') {
      beginEdit(state, 'formula');
    }

    updateDraft(state, formulaInput.value);
  });

  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitAndMove(1, 0);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit(state);
      render();
      focusActiveCell();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.target === formulaInput) {
      return;
    }

    const isMeta = event.metaKey || event.ctrlKey;
    if (isMeta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      emitHook('spreadsheet:history', {
        type: event.shiftKey ? 'redo' : 'undo',
        message: `${event.shiftKey ? 'Redo' : 'Undo'} requested.`,
      });
      return;
    }

    if (isMeta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      emitHook('spreadsheet:history', {
        type: 'redo',
        message: 'Redo requested.',
      });
      return;
    }

    if (isMeta && ['c', 'x', 'v'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const operation = event.key.toLowerCase() === 'c' ? 'copy' : event.key.toLowerCase() === 'x' ? 'cut' : 'paste';
      emitHook('spreadsheet:clipboard', {
        type: operation,
        bounds: selectionBounds(),
        message: `${operation[0].toUpperCase()}${operation.slice(1)} requested for current selection.`,
      });
      return;
    }

    if (state.mode === 'edit') {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitAndMove(1, 0);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitAndMove(0, 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit(state);
        render();
        focusActiveCell();
      }
      return;
    }

    const printable = event.key.length === 1 && !event.altKey;
    if (printable && !isMeta) {
      event.preventDefault();
      beginEdit(state, 'cell');
      updateDraft(state, event.key);
      render();
      focusActiveCell();
      return;
    }

    const movement = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }[event.key];

    if (movement) {
      event.preventDefault();
      const [deltaRow, deltaCol] = movement;
      if (event.shiftKey) {
        extendSelection(state, state.selection.focus.row + deltaRow, state.selection.focus.col + deltaCol);
      } else {
        moveSelection(state, state.selection.focus.row + deltaRow, state.selection.focus.col + deltaCol);
      }
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(state, 'cell');
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      moveSelection(state, state.selection.focus.row, state.selection.focus.col + 1);
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelectionValues();
      render();
      focusActiveCell();
    }
  });

  render();
  focusActiveCell();

  window.oracleSheetShell = {
    onHook,
    setCellContents,
    replaceCells,
    setSelection,
    getSnapshot,
    render,
  };
})();
