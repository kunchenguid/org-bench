'use strict';

(function bootstrap() {
  const STORAGE_NAMESPACE = resolveStorageNamespace();
  const rows = 100;
  const cols = 26;
  const sheet = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.querySelector('.name-box');
  const persistentStore = createPersistenceAdapter();
  const persistedState = persistentStore ? persistentStore.getState() : null;
  const initialCells = persistedState ? extractInitialCells(persistedState.cells) : {};
  const store = window.createSpreadsheetStore({ rows, cols, initialCells });
  let cutMatrix = null;
  let draggingRange = false;

  if (persistedState && persistedState.selection && persistedState.selection.active) {
    const active = fromCellRef(persistedState.selection.active);
    store.selectCell(active.row, active.col);
  }

  render();

  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('keyup', handleKeyup, true);
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCut);
  document.addEventListener('paste', handlePaste);
  document.addEventListener('pointerup', () => {
    draggingRange = false;
  });

  formulaInput.addEventListener('focus', () => {
    store.startFormulaBarEdit();
    render();
  });

  formulaInput.addEventListener('input', (event) => {
    store.updateDraft(event.target.value);
    render();
  });

  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      store.commitEdit({ move: 'down' });
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      store.commitEdit({ move: event.shiftKey ? 'left' : 'right' });
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      store.cancelEdit();
      render();
      focusActiveCell();
    }
  });

  function handleKeydown(event) {
    if (event.target === formulaInput) {
      return;
    }

    const state = store.getState();
    const moveKey = movementKey(event.key);
    const meta = event.metaKey || event.ctrlKey;

    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        store.redo();
      } else {
        store.undo();
      }
      render();
      return;
    }

    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      store.redo();
      render();
      return;
    }

    if (state.mode === 'editing') {
      if (event.key === 'Enter') {
        event.preventDefault();
        store.commitEdit({ move: 'down' });
        render();
        focusActiveCell();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        store.commitEdit({ move: event.shiftKey ? 'left' : 'right' });
        render();
        focusActiveCell();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        store.cancelEdit();
        render();
        focusActiveCell();
      }
      return;
    }

    if (moveKey) {
      event.preventDefault();
      store.moveActive(moveKey, { extend: event.shiftKey });
      render();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      store.startEdit();
      render();
      focusEditor();
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      store.startEdit();
      render();
      focusEditor();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      store.moveActive(event.shiftKey ? 'left' : 'right');
      render();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      store.clearSelection();
      render();
      return;
    }

    if (isTypingKey(event)) {
      event.preventDefault();
      store.beginTyping(event.key);
      render();
      focusEditor();
    }
  }

  function handleKeyup(event) {
    if (event.target === formulaInput) {
      return;
    }

    const state = store.getState();
    if (state.mode !== 'editing') {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      store.commitEdit({ move: 'down' });
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      store.commitEdit({ move: event.shiftKey ? 'left' : 'right' });
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      store.cancelEdit();
      render();
      focusActiveCell();
    }
  }

  function handleCopy(event) {
    const text = matrixToText(store.getSelectionMatrix());
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
  }

  function handleCut(event) {
    const state = store.getState();
    cutMatrix = {
      start: state.range.start,
      end: state.range.end,
      text: matrixToText(store.getSelectionMatrix()),
    };
    event.preventDefault();
    event.clipboardData.setData('text/plain', cutMatrix.text);
  }

  function handlePaste(event) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }

    event.preventDefault();
    const state = store.getState();
    store.replaceRange(state.active, textToMatrix(text));
    if (cutMatrix && cutMatrix.text === text) {
      store.setRange({ start: cutMatrix.start, end: cutMatrix.end });
      store.clearSelection();
      cutMatrix = null;
      store.setRange(state.range);
    }
    render();
  }

  function render() {
    const state = store.getState();
    const engine = createEngineSnapshot();
    nameBox.textContent = toCellRef(state.active.row, state.active.col);
    syncFormulaBar(state.formulaBarValue);

    const headerCells = ['<thead><tr><th class="corner" aria-hidden="true"></th>'];
    for (let col = 0; col < cols; col += 1) {
      const className = col === state.active.col ? ' class="header-active"' : '';
      headerCells.push('<th' + className + ' scope="col">' + columnLabel(col) + '</th>');
    }
    headerCells.push('</tr></thead>');

    const bodyRows = ['<tbody>'];
    for (let row = 0; row < rows; row += 1) {
      const rowHeaderClass = row === state.active.row ? ' class="header-active"' : '';
      bodyRows.push('<tr><th' + rowHeaderClass + ' scope="row">' + (row + 1) + '</th>');
      for (let col = 0; col < cols; col += 1) {
        bodyRows.push(renderCell(row, col, state, engine));
      }
      bodyRows.push('</tr>');
    }
    bodyRows.push('</tbody>');

    sheet.innerHTML = headerCells.join('') + bodyRows.join('');

    Array.from(sheet.querySelectorAll('[data-role="cell-button"]')).forEach((button) => {
      button.addEventListener('click', (event) => {
        store.selectCell(Number(button.dataset.row), Number(button.dataset.col), { extend: event.shiftKey });
        render();
        focusActiveCell();
      });

      button.addEventListener('pointerdown', () => {
        draggingRange = true;
        store.selectCell(Number(button.dataset.row), Number(button.dataset.col));
        render();
      });

      button.addEventListener('pointerenter', () => {
        if (!draggingRange) {
          return;
        }

        store.selectCell(Number(button.dataset.row), Number(button.dataset.col), { extend: true });
        render();
      });

      button.addEventListener('dblclick', () => {
        store.selectCell(Number(button.dataset.row), Number(button.dataset.col));
        store.startEdit();
        render();
        focusEditor();
      });
    });

    Array.from(sheet.querySelectorAll('[data-role="cell-editor"]')).forEach((input) => {
      input.addEventListener('input', (event) => {
        store.updateDraft(event.target.value);
        syncFormulaBar(event.target.value);
      });

      input.addEventListener('blur', () => {
        if (store.getState().mode === 'editing') {
          store.commitEdit();
          render();
        }
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          store.commitEdit({ move: 'down' });
          render();
          focusActiveCell();
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          store.commitEdit({ move: event.shiftKey ? 'left' : 'right' });
          render();
          focusActiveCell();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          store.cancelEdit();
          render();
          focusActiveCell();
        }
      });

      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    });

    syncPersistence();
  }

  function renderCell(row, col, state, engine) {
    const active = row === state.active.row && col === state.active.col;
    const inRange = isInRange(row, col, state.range);
    const classes = ['cell'];
    if (active) {
      classes.push('active');
    }
    if (inRange) {
      classes.push('in-range');
    }

    const raw = store.getCellRaw(row, col);
    const display = escapeHtml(getDisplayValue(raw, row, col, engine));

    if (active && state.mode === 'editing') {
      return '<td class="' + classes.join(' ') + '"><input class="cell-editor" data-role="cell-editor" value="' + escapeAttribute(state.draft) + '" aria-label="Cell ' + toCellRef(row, col) + '"></td>';
    }

    return '<td class="' + classes.join(' ') + '"><button type="button" class="cell-button" data-role="cell-button" data-row="' + row + '" data-col="' + col + '" tabindex="' + (active ? '0' : '-1') + '" aria-label="Cell ' + toCellRef(row, col) + '">' + display + '</button></td>';
  }

  function getDisplayValue(raw, row, col, engine) {
    if (engine && typeof engine.getDisplayValue === 'function') {
      return String(engine.getDisplayValue(toCellRef(row, col)) || '');
    }

    return raw;
  }

  function isInRange(row, col, range) {
    const top = Math.min(range.start.row, range.end.row);
    const bottom = Math.max(range.start.row, range.end.row);
    const left = Math.min(range.start.col, range.end.col);
    const right = Math.max(range.start.col, range.end.col);
    return row >= top && row <= bottom && col >= left && col <= right;
  }

  function syncFormulaBar(value) {
    formulaInput.value = value;
  }

  function createPersistenceAdapter() {
    if (typeof window.createPersistentSpreadsheetStore !== 'function' || !window.localStorage) {
      return null;
    }

    const adapter = window.createPersistentSpreadsheetStore({
      storage: window.localStorage,
      storageNamespace: STORAGE_NAMESPACE,
    });
    adapter.load();
    return adapter;
  }

  function resolveStorageNamespace() {
    const meta = document.querySelector('meta[name="storage-namespace"]');
    const candidates = [
      window.__BENCHMARK_STORAGE_NAMESPACE__,
      window.BENCHMARK_STORAGE_NAMESPACE,
      window.__RUN_STORAGE_NAMESPACE__,
      window.RUN_STORAGE_NAMESPACE,
      window.__ORACLE_STORAGE_NAMESPACE__,
      window.ORACLE_STORAGE_NAMESPACE,
      document.documentElement.dataset.storageNamespace,
      document.body.dataset.storageNamespace,
      meta && meta.content,
    ];

    const injected = candidates.find((value) => typeof value === 'string' && value.trim());
    if (injected) {
      return injected;
    }

    return 'oracle-run:' + window.location.pathname;
  }

  function syncPersistence() {
    if (!persistentStore) {
      return;
    }

    const persisted = persistentStore.getState().cells;
    const current = store.getCells();

    Object.keys(persisted).forEach((address) => {
      if (!(address in current)) {
        persistentStore.setCellRaw(address, '');
      }
    });

    Object.keys(current).forEach((address) => {
      persistentStore.setCellRaw(address, current[address]);
    });

    persistentStore.selectCell(toCellRef(store.getState().active.row, store.getState().active.col));
    persistentStore.save();
  }

  function createEngineSnapshot() {
    if (typeof window.createSpreadsheetEngine !== 'function') {
      return null;
    }

    const snapshot = window.createSpreadsheetEngine();
    const cells = store.getCells();

    Object.keys(cells).forEach((address) => {
      snapshot.setCell(address, cells[address]);
    });

    return snapshot;
  }

  function extractInitialCells(cells) {
    return Object.fromEntries(
      Object.entries(cells || {}).map(([address, cell]) => [address, cell.raw])
    );
  }

  function fromCellRef(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    let col = 0;

    for (let index = 0; index < match[1].length; index += 1) {
      col = (col * 26) + (match[1].charCodeAt(index) - 64);
    }

    return {
      row: Number(match[2]) - 1,
      col: col - 1,
    };
  }

  function focusActiveCell() {
    const activeButton = sheet.querySelector('[data-row="' + store.getState().active.row + '"][data-col="' + store.getState().active.col + '"]');
    if (activeButton) {
      activeButton.focus();
    }
  }

  function focusEditor() {
    const editor = sheet.querySelector('[data-role="cell-editor"]');
    if (editor) {
      editor.focus();
    }
  }

  function movementKey(key) {
    switch (key) {
      case 'ArrowUp':
        return 'up';
      case 'ArrowDown':
        return 'down';
      case 'ArrowLeft':
        return 'left';
      case 'ArrowRight':
        return 'right';
      default:
        return null;
    }
  }

  function isTypingKey(event) {
    return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
  }

  function columnLabel(col) {
    return String.fromCharCode(65 + col);
  }

  function toCellRef(row, col) {
    return columnLabel(col) + String(row + 1);
  }

  function matrixToText(matrix) {
    return matrix.map((line) => line.join('\t')).join('\n');
  }

  function textToMatrix(text) {
    return text.replace(/\r/g, '').split('\n').map((line) => line.split('\t'));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }
})();
