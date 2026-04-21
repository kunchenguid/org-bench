(function () {
  const core = window.SpreadsheetCore;
  const namespace = window.__BENCHMARK_RUN_NAMESPACE__ || 'microsoft-sheet';
  const storageKey = namespace + ':spreadsheet';
  const selectionKey = namespace + ':selection';
  const grid = document.getElementById('grid');
  const formulaInput = document.getElementById('formula-input');
  const store = core.createStore(loadJSON(storageKey));
  let selection = loadJSON(selectionKey) || { col: 0, row: 0 };
  let rangeAnchor = { col: selection.col, row: selection.row };
  let clipboard = null;
  let isEditing = false;
  let formulaBuffer = null;
  let history = [];
  let future = [];

  function loadJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(store.toJSON()));
    localStorage.setItem(selectionKey, JSON.stringify(selection));
  }

  function getSelectionRange() {
    return core.normalizeRange({
      startCol: rangeAnchor.col,
      startRow: rangeAnchor.row,
      endCol: selection.col,
      endRow: selection.row,
    });
  }

  function hasRangeSelection() {
    const range = getSelectionRange();
    return range.startCol !== range.endCol || range.startRow !== range.endRow;
  }

  function setSelection(col, row, extend) {
    selection = {
      col: Math.max(0, Math.min(core.COLS - 1, col)),
      row: Math.max(0, Math.min(core.ROWS - 1, row)),
    };
    if (!extend) {
      rangeAnchor = { col: selection.col, row: selection.row };
    }
    save();
    render();
  }

  function pushHistory() {
    history.push(core.createHistorySnapshot(store, selection, rangeAnchor));
    if (history.length > 50) {
      history = history.slice(-50);
    }
    future = [];
  }

  function restore(snapshot) {
    const restored = core.restoreHistorySnapshot(snapshot);
    const nextStore = restored.store;
    store.raw.clear();
    nextStore.raw.forEach(function (value, key) {
      store.raw.set(key, value);
    });
    selection = restored.selection;
    rangeAnchor = restored.rangeAnchor;
  }

  function applyStructuralChange(action, index) {
    pushHistory();
    if (action === 'insert-row') {
      core.insertRow(store, index);
      if (selection.row >= index) {
        selection.row = Math.min(core.ROWS - 1, selection.row + 1);
      }
    } else if (action === 'delete-row') {
      core.deleteRow(store, index);
      selection.row = Math.max(0, Math.min(core.ROWS - 1, selection.row > index ? selection.row - 1 : selection.row));
    } else if (action === 'insert-col') {
      core.insertColumn(store, index);
      if (selection.col >= index) {
        selection.col = Math.min(core.COLS - 1, selection.col + 1);
      }
    } else if (action === 'delete-col') {
      core.deleteColumn(store, index);
      selection.col = Math.max(0, Math.min(core.COLS - 1, selection.col > index ? selection.col - 1 : selection.col));
    }
    rangeAnchor = { col: selection.col, row: selection.row };
    save();
    render();
  }

  function buildHeaderControl(label, insertTitle, deleteTitle, insertAction, deleteAction) {
    const shell = document.createElement('div');
    shell.className = 'header-shell';

    const text = document.createElement('span');
    text.className = 'header-label';
    text.textContent = label;
    shell.appendChild(text);

    const actions = document.createElement('span');
    actions.className = 'header-actions';

    const insertButton = document.createElement('button');
    insertButton.type = 'button';
    insertButton.className = 'header-action';
    insertButton.title = insertTitle;
    insertButton.setAttribute('aria-label', insertTitle + ' ' + label);
    insertButton.textContent = '+';
    insertButton.addEventListener('click', function (event) {
      event.stopPropagation();
      applyStructuralChange(insertAction.type, insertAction.index);
    });
    actions.appendChild(insertButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'header-action';
    deleteButton.title = deleteTitle;
    deleteButton.setAttribute('aria-label', deleteTitle + ' ' + label);
    deleteButton.textContent = '-';
    deleteButton.addEventListener('click', function (event) {
      event.stopPropagation();
      applyStructuralChange(deleteAction.type, deleteAction.index);
    });
    actions.appendChild(deleteButton);

    shell.appendChild(actions);
    return shell;
  }

  function render() {
    const sheet = core.evaluateSheet(store);
    grid.innerHTML = '';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-rowcount', String(core.ROWS + 1));
    grid.setAttribute('aria-colcount', String(core.COLS + 1));
    const corner = document.createElement('div');
    corner.className = 'corner';
    corner.setAttribute('aria-hidden', 'true');
    grid.appendChild(corner);
    for (let col = 0; col < core.COLS; col += 1) {
      const header = document.createElement('div');
      header.className = 'col-header';
      header.setAttribute('role', 'columnheader');
      header.setAttribute('aria-colindex', String(col + 2));
      header.appendChild(buildHeaderControl(
        core.colToName(col),
        'Insert column left',
        'Delete column',
        { type: 'insert-col', index: col },
        { type: 'delete-col', index: col }
      ));
      grid.appendChild(header);
    }
    for (let row = 0; row < core.ROWS; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.setAttribute('aria-rowindex', String(row + 2));
      rowHeader.appendChild(buildHeaderControl(
        String(row + 1),
        'Insert row above',
        'Delete row',
        { type: 'insert-row', index: row },
        { type: 'delete-row', index: row }
      ));
      grid.appendChild(rowHeader);
      for (let col = 0; col < core.COLS; col += 1) {
        const range = getSelectionRange();
        const cellData = sheet.getCell(col, row);
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.col = String(col);
        cell.dataset.row = String(row);
        cell.tabIndex = selection.col === col && selection.row === row ? 0 : -1;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', core.colToName(col) + String(row + 1));
        cell.setAttribute('aria-colindex', String(col + 2));
        cell.setAttribute('aria-rowindex', String(row + 2));
        if (col >= range.startCol && col <= range.endCol && row >= range.startRow && row <= range.endRow) {
          cell.classList.add('selected');
          cell.setAttribute('aria-selected', 'true');
        } else {
          cell.setAttribute('aria-selected', 'false');
        }
        if (selection.col === col && selection.row === row) {
          cell.classList.add('active');
        }
        if (/^-?\d/.test(cellData.display)) {
          cell.classList.add('numeric');
        }
        if (String(cellData.display).startsWith('#')) {
          cell.classList.add('error');
        }
        cell.textContent = cellData.display;
        cell.addEventListener('click', function (event) {
          setSelection(col, row, event.shiftKey);
          isEditing = false;
        });
        cell.addEventListener('dblclick', function () {
          setSelection(col, row, false);
          startEditing();
        });
        grid.appendChild(cell);
      }
    }
    syncFormula();
  }

  function syncFormula() {
    formulaInput.value = formulaBuffer ? formulaBuffer.draft : store.getCell(selection.col, selection.row);
  }

  function moveSelection(dCol, dRow) {
    setSelection(selection.col + dCol, selection.row + dRow, false);
  }

  function extendSelection(dCol, dRow) {
    setSelection(selection.col + dCol, selection.row + dRow, true);
  }

  function commit(value, dCol, dRow) {
    pushHistory();
    store.setCell(selection.col, selection.row, value);
    isEditing = false;
    rangeAnchor = { col: selection.col, row: selection.row };
    moveSelection(dCol, dRow);
    save();
  }

  function clearRange() {
    const range = getSelectionRange();
    pushHistory();
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        store.setCell(col, row, '');
      }
    }
    save();
    render();
  }

  function writeClipboardText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(function () {});
    }
  }

  function copySelection(cut) {
    const range = getSelectionRange();
    clipboard = core.copyRange(store, range);
    writeClipboardText(core.clipboardToText(clipboard));
    if (cut) {
      clearRange();
      rangeAnchor = { col: selection.col, row: selection.row };
    }
  }

  function pasteClipboard(clipboardData) {
    if (!clipboardData || !clipboardData.width || !clipboardData.height) {
      return;
    }
    pushHistory();
    core.pasteRange(store, clipboardData, hasRangeSelection() ? getSelectionRange() : {
      startCol: selection.col,
      startRow: selection.row,
      endCol: selection.col,
      endRow: selection.row,
    });
    rangeAnchor = { col: selection.col, row: selection.row };
    save();
    render();
  }

  function pasteSelection() {
    if (clipboard) {
      pasteClipboard(clipboard);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) {
        pasteClipboard(core.clipboardFromText(text));
      }).catch(function () {});
    }
  }

  function handleInlineEditorKey(key, value) {
    const action = core.editorActionForKey(key);
    if (!action) {
      return false;
    }
    if (action.kind === 'cancel') {
      isEditing = false;
      render();
      return true;
    }
    commit(value, action.dCol, action.dRow);
    return true;
  }

  function startEditing() {
    const cell = grid.querySelector('.cell.active');
    if (!cell) {
      return;
    }
    isEditing = true;
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = store.getCell(selection.col, selection.row);
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', function (event) {
      if (handleInlineEditorKey(event.key, input.value)) {
        event.preventDefault();
      }
    });
    input.addEventListener('blur', function () {
      if (isEditing) {
        commit(input.value, 0, 0);
      }
    });
  }

  formulaInput.addEventListener('focus', function () {
    isEditing = true;
    formulaBuffer = core.createEditBuffer(store.getCell(selection.col, selection.row));
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = core.resolveEditBuffer(formulaBuffer || core.createEditBuffer(formulaInput.value), true);
      formulaBuffer = null;
      commit(value, 0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      isEditing = false;
      if (formulaBuffer) {
        formulaInput.value = core.resolveEditBuffer(formulaBuffer, false);
        formulaBuffer = null;
      }
      syncFormula();
    }
  });
  formulaInput.addEventListener('input', function () {
    if (isEditing) {
      formulaBuffer = formulaBuffer || core.createEditBuffer(store.getCell(selection.col, selection.row));
      formulaBuffer.draft = formulaInput.value;
    }
  });

  document.addEventListener('keydown', function (event) {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        if (future.length) {
          history.push(core.createHistorySnapshot(store, selection, rangeAnchor));
          restore(future.pop());
          save();
          render();
        }
        return;
      }
      if (history.length) {
        future.push(core.createHistorySnapshot(store, selection, rangeAnchor));
        restore(history.pop());
        save();
        render();
      }
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (future.length) {
        history.push(core.createHistorySnapshot(store, selection, rangeAnchor));
        restore(future.pop());
        save();
        render();
      }
      return;
    }
    if (meta && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySelection(false);
      return;
    }
    if (meta && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      copySelection(true);
      return;
    }
    if (meta && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteSelection();
      return;
    }
    const activeEditor = grid.querySelector('.cell-editor');
    if (activeEditor) {
      if (core.editorActionForKey(event.key)) {
        event.preventDefault();
      }
      return;
    }
    if (event.target === formulaInput) {
      if (event.key === 'F2') {
        startEditing();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (event.shiftKey) {
        extendSelection(-1, 0);
      } else {
        moveSelection(-1, 0);
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (event.shiftKey) {
        extendSelection(1, 0);
      } else {
        moveSelection(1, 0);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (event.shiftKey) {
        extendSelection(0, -1);
      } else {
        moveSelection(0, -1);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (event.shiftKey) {
        extendSelection(0, 1);
      } else {
        moveSelection(0, 1);
      }
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearRange();
    } else if (event.key.length === 1 && !meta && !event.altKey) {
      event.preventDefault();
      pushHistory();
      rangeAnchor = { col: selection.col, row: selection.row };
      store.setCell(selection.col, selection.row, event.key);
      save();
      render();
      startEditing();
    }
  });

  document.addEventListener('paste', function (event) {
    if (event.target === formulaInput || grid.querySelector('.cell-editor')) {
      return;
    }

    const text = event.clipboardData && event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }

    event.preventDefault();
    pasteClipboard(core.clipboardFromText(text));
  });

  document.addEventListener('keyup', function (event) {
    const activeEditor = grid.querySelector('.cell-editor');
    if (!activeEditor) {
      return;
    }

    if (handleInlineEditorKey(event.key, activeEditor.value)) {
      event.preventDefault();
    }
  });

  render();
  save();
})();
