(function () {
  const core = window.SpreadsheetCore;
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const MAX_HISTORY = 50;
  const PRINTABLE_KEY = /^.$/;
  const state = {
    rowCount: DEFAULT_ROWS,
    colCount: DEFAULT_COLS,
    cells: {},
    evaluated: { values: {} },
    selection: makeSelection(0, 0, 0, 0),
    editing: null,
    history: [],
    future: [],
    pendingCut: null,
    isDragging: false,
  };

  const storageKey = getStorageNamespace() + ':sheet-state';
  const table = document.getElementById('sheet-table');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const undoButton = document.getElementById('undo-button');
  const redoButton = document.getElementById('redo-button');

  restore();
  recalculate();
  render();
  bindEvents();

  function bindEvents() {
    formulaInput.addEventListener('focus', function () {
      startEdit('formula', getActiveRaw());
      formulaInput.select();
    });

    formulaInput.addEventListener('input', function () {
      if (state.editing && state.editing.target === 'formula') {
        state.editing.draft = formulaInput.value;
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(moveSelection(1, 0));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(moveSelection(0, event.shiftKey ? -1 : 1));
      }
    });

    undoButton.addEventListener('click', undo);
    redoButton.addEventListener('click', redo);

    document.getElementById('insert-row-button').addEventListener('click', function () {
      insertRow(state.selection.top);
    });
    document.getElementById('delete-row-button').addEventListener('click', function () {
      deleteRow(state.selection.top);
    });
    document.getElementById('insert-col-button').addEventListener('click', function () {
      insertColumn(state.selection.left);
    });
    document.getElementById('delete-col-button').addEventListener('click', function () {
      deleteColumn(state.selection.left);
    });

    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('pointerup', function () {
      state.isDragging = false;
    });
    window.addEventListener('beforeunload', persist);
  }

  function handleDocumentKeydown(event) {
    if (state.editing && state.editing.target === 'cell') {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
      event.preventDefault();
      redo();
      return;
    }

    if (document.activeElement === formulaInput && state.editing && state.editing.target === 'formula') {
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      startEdit('cell', getActiveRaw());
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      startEdit('cell', getActiveRaw());
      return;
    }

    if (event.key === 'Escape' && state.editing) {
      event.preventDefault();
      cancelEdit();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelection();
      return;
    }

    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const delta = arrowDelta(event.key);
      if (event.shiftKey) {
        extendSelection(delta.row, delta.col);
      } else {
        setSelection(clampSelection(
          state.selection.activeRow + delta.row,
          state.selection.activeCol + delta.col,
          state.selection.activeRow + delta.row,
          state.selection.activeCol + delta.col
        ));
      }
      return;
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && PRINTABLE_KEY.test(event.key)) {
      event.preventDefault();
      startEdit('cell', event.key, true);
    }
  }

  function render() {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);

    for (let col = 0; col < state.colCount; col += 1) {
      const header = document.createElement('th');
      header.className = 'col-header';
      header.appendChild(buildHeaderContent(core.columnToLetters(col), function () {
        insertColumn(col);
      }, function () {
        deleteColumn(col);
      }));
      headRow.appendChild(header);
    }

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < state.rowCount; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.appendChild(buildHeaderContent(String(row + 1), function () {
        insertRow(row);
      }, function () {
        deleteRow(row);
      }));
      tr.appendChild(rowHeader);

      for (let col = 0; col < state.colCount; col += 1) {
        tr.appendChild(buildCell(row, col));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    nameBox.textContent = activeRef();
    if (!state.editing || state.editing.target !== 'formula') {
      formulaInput.value = getActiveRaw();
    }
    undoButton.disabled = !state.history.length;
    redoButton.disabled = !state.future.length;
    persist();
  }

  function buildHeaderContent(label, onInsert, onDelete) {
    const wrap = document.createElement('div');
    wrap.className = 'header-content';

    const text = document.createElement('span');
    text.className = 'header-text';
    text.textContent = label;
    wrap.appendChild(text);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'header-btn';
    plus.textContent = '+';
    plus.addEventListener('click', function (event) {
      event.stopPropagation();
      onInsert();
    });
    wrap.appendChild(plus);

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'header-btn';
    minus.textContent = '-';
    minus.addEventListener('click', function (event) {
      event.stopPropagation();
      onDelete();
    });
    wrap.appendChild(minus);
    return wrap;
  }

  function buildCell(row, col) {
    const td = document.createElement('td');
    const cell = document.createElement('div');
    const ref = core.toCellRef(row, col);
    const result = state.evaluated.values[ref] || { display: '', value: '' };
    const raw = state.cells[ref] || '';
    cell.className = 'cell';
    if (typeof result.value === 'number') {
      cell.classList.add('number');
    }
    if (String(result.display).startsWith('#')) {
      cell.classList.add('error');
    }
    if (inSelection(row, col)) {
      cell.classList.add('range');
    }
    if (row === state.selection.activeRow && col === state.selection.activeCol) {
      cell.classList.add('active');
    }
    td.dataset.row = String(row);
    td.dataset.col = String(col);
    td.dataset.ref = ref;
    td.appendChild(cell);

    td.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) {
        return;
      }
      const next = event.shiftKey
        ? makeSelection(state.selection.anchorRow, state.selection.anchorCol, row, col)
        : makeSelection(row, col, row, col);
      state.isDragging = true;
      setSelection(next);
    });

    td.addEventListener('pointerenter', function () {
      if (!state.isDragging) {
        return;
      }
      setSelection(makeSelection(state.selection.anchorRow, state.selection.anchorCol, row, col));
    });

    td.addEventListener('dblclick', function () {
      startEdit('cell', raw);
    });

    if (state.editing && state.editing.target === 'cell' && row === state.selection.activeRow && col === state.selection.activeCol) {
      const input = document.createElement('input');
      input.className = 'cell-input';
      input.value = state.editing.draft;
      input.spellcheck = false;
      input.addEventListener('input', function () {
        state.editing.draft = input.value;
        formulaInput.value = input.value;
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit(moveSelection(1, 0));
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitEdit(moveSelection(0, event.shiftKey ? -1 : 1));
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
      });
      cell.appendChild(input);
      setTimeout(function () {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    } else {
      cell.textContent = result.display || '';
    }
    return td;
  }

  function startEdit(target, initial, replace) {
    state.editing = {
      target: target,
      draft: replace ? initial : initial,
      original: getActiveRaw(),
    };
    if (target === 'formula') {
      formulaInput.value = state.editing.draft;
      formulaInput.focus();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    }
    render();
  }

  function commitEdit(nextSelection) {
    if (!state.editing) {
      return;
    }
    applySnapshot('Edit cells');
    setCellRaw(activeRef(), state.editing.draft);
    state.editing = null;
    recalculate();
    if (nextSelection) {
      setSelection(nextSelection);
    }
    render();
  }

  function cancelEdit() {
    state.editing = null;
    formulaInput.value = getActiveRaw();
    render();
  }

  function clearSelection() {
    applySnapshot('Clear range');
    eachSelectedCell(function (row, col) {
      setCellRaw(core.toCellRef(row, col), '');
    });
    state.pendingCut = null;
    state.editing = null;
    recalculate();
    render();
  }

  function handleCopy(event) {
    if (state.editing) {
      return;
    }
    const payload = buildClipboardPayload(false);
    event.preventDefault();
    event.clipboardData.setData('text/plain', payload.text);
    event.clipboardData.setData('application/x-oracle-sheet', JSON.stringify(payload));
  }

  function handleCut(event) {
    if (state.editing) {
      return;
    }
    const payload = buildClipboardPayload(true);
    state.pendingCut = payload;
    event.preventDefault();
    event.clipboardData.setData('text/plain', payload.text);
    event.clipboardData.setData('application/x-oracle-sheet', JSON.stringify(payload));
  }

  function handlePaste(event) {
    const text = event.clipboardData.getData('text/plain');
    const custom = event.clipboardData.getData('application/x-oracle-sheet');
    if (!text && !custom) {
      return;
    }
    event.preventDefault();
    applySnapshot('Paste cells');

    const payload = custom ? JSON.parse(custom) : plainClipboardPayload(text);
    pastePayload(payload);
    if (payload.cut && state.pendingCut) {
      clearCutSource(state.pendingCut, payload.targetTop, payload.targetLeft);
      state.pendingCut = null;
    }
    recalculate();
    render();
  }

  function pastePayload(payload) {
    const targetTop = state.selection.top;
    const targetLeft = state.selection.left;
    payload.targetTop = targetTop;
    payload.targetLeft = targetLeft;
    const targetHeight = state.selection.bottom - state.selection.top + 1;
    const targetWidth = state.selection.right - state.selection.left + 1;
    const sourceHeight = payload.rows.length;
    const sourceWidth = payload.rows[0] ? payload.rows[0].length : 1;
    const matchRange = targetHeight === sourceHeight && targetWidth === sourceWidth;
    const originTop = matchRange ? state.selection.top : targetTop;
    const originLeft = matchRange ? state.selection.left : targetLeft;

    for (let rowIndex = 0; rowIndex < sourceHeight; rowIndex += 1) {
      for (let colIndex = 0; colIndex < sourceWidth; colIndex += 1) {
        const destRow = originTop + rowIndex;
        const destCol = originLeft + colIndex;
        if (destRow >= state.rowCount || destCol >= state.colCount) {
          continue;
        }
        const sourceCell = payload.rows[rowIndex][colIndex] || '';
        const sourceOriginRow = payload.sourceTop + rowIndex;
        const sourceOriginCol = payload.sourceLeft + colIndex;
        const shifted = sourceCell && sourceCell.charAt(0) === '='
          ? core.shiftFormula(sourceCell, destRow - sourceOriginRow, destCol - sourceOriginCol)
          : sourceCell;
        setCellRaw(core.toCellRef(destRow, destCol), shifted);
      }
    }
    setSelection(makeSelection(originTop, originLeft, originTop, originLeft));
  }

  function clearCutSource(payload, targetTop, targetLeft) {
    for (let rowIndex = 0; rowIndex < payload.rows.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < payload.rows[rowIndex].length; colIndex += 1) {
        const sourceRow = payload.sourceTop + rowIndex;
        const sourceCol = payload.sourceLeft + colIndex;
        const sameDestination = targetTop + rowIndex === sourceRow && targetLeft + colIndex === sourceCol;
        if (!sameDestination) {
          setCellRaw(core.toCellRef(sourceRow, sourceCol), '');
        }
      }
    }
  }

  function buildClipboardPayload(cut) {
    const rows = [];
    for (let row = state.selection.top; row <= state.selection.bottom; row += 1) {
      const current = [];
      for (let col = state.selection.left; col <= state.selection.right; col += 1) {
        current.push(state.cells[core.toCellRef(row, col)] || '');
      }
      rows.push(current);
    }
    return {
      cut: cut,
      sourceTop: state.selection.top,
      sourceLeft: state.selection.left,
      rows: rows,
      text: rows.map(function (row) { return row.join('\t'); }).join('\n'),
    };
  }

  function plainClipboardPayload(text) {
    const rows = String(text || '').split(/\r?\n/).map(function (line) {
      return line.split('\t');
    });
    return {
      cut: false,
      sourceTop: state.selection.top,
      sourceLeft: state.selection.left,
      rows: rows,
      text: text,
    };
  }

  function insertRow(index) {
    applySnapshot('Insert row');
    const next = {};
    Object.keys(state.cells).forEach(function (ref) {
      const parsed = core.parseCellRef(ref);
      const destRow = parsed.row >= index ? parsed.row + 1 : parsed.row;
      let raw = state.cells[ref];
      if (raw && raw.charAt(0) === '=') {
        raw = core.rewriteFormulaForStructuralChange(raw, { type: 'insert-row', index: index, count: 1 });
      }
      next[core.toCellRef(destRow, parsed.col)] = raw;
    });
    state.cells = next;
    state.rowCount += 1;
    recalculate();
    render();
  }

  function deleteRow(index) {
    if (state.rowCount <= 1) {
      return;
    }
    applySnapshot('Delete row');
    const next = {};
    Object.keys(state.cells).forEach(function (ref) {
      const parsed = core.parseCellRef(ref);
      if (parsed.row === index) {
        return;
      }
      const destRow = parsed.row > index ? parsed.row - 1 : parsed.row;
      let raw = state.cells[ref];
      if (raw && raw.charAt(0) === '=') {
        raw = core.rewriteFormulaForStructuralChange(raw, { type: 'delete-row', index: index, count: 1 });
      }
      next[core.toCellRef(destRow, parsed.col)] = raw;
    });
    state.cells = next;
    state.rowCount -= 1;
    setSelection(clampSelection(state.selection.activeRow, state.selection.activeCol, state.selection.activeRow, state.selection.activeCol));
    recalculate();
    render();
  }

  function insertColumn(index) {
    applySnapshot('Insert column');
    const next = {};
    Object.keys(state.cells).forEach(function (ref) {
      const parsed = core.parseCellRef(ref);
      const destCol = parsed.col >= index ? parsed.col + 1 : parsed.col;
      let raw = state.cells[ref];
      if (raw && raw.charAt(0) === '=') {
        raw = core.rewriteFormulaForStructuralChange(raw, { type: 'insert-col', index: index, count: 1 });
      }
      next[core.toCellRef(parsed.row, destCol)] = raw;
    });
    state.cells = next;
    state.colCount += 1;
    recalculate();
    render();
  }

  function deleteColumn(index) {
    if (state.colCount <= 1) {
      return;
    }
    applySnapshot('Delete column');
    const next = {};
    Object.keys(state.cells).forEach(function (ref) {
      const parsed = core.parseCellRef(ref);
      if (parsed.col === index) {
        return;
      }
      const destCol = parsed.col > index ? parsed.col - 1 : parsed.col;
      let raw = state.cells[ref];
      if (raw && raw.charAt(0) === '=') {
        raw = core.rewriteFormulaForStructuralChange(raw, { type: 'delete-col', index: index, count: 1 });
      }
      next[core.toCellRef(parsed.row, destCol)] = raw;
    });
    state.cells = next;
    state.colCount -= 1;
    setSelection(clampSelection(state.selection.activeRow, state.selection.activeCol, state.selection.activeRow, state.selection.activeCol));
    recalculate();
    render();
  }

  function undo() {
    if (!state.history.length) {
      return;
    }
    state.future.push(snapshotState());
    const previous = state.history.pop();
    restoreSnapshot(previous);
    recalculate();
    render();
  }

  function redo() {
    if (!state.future.length) {
      return;
    }
    state.history.push(snapshotState());
    const next = state.future.pop();
    restoreSnapshot(next);
    recalculate();
    render();
  }

  function applySnapshot() {
    state.history.push(snapshotState());
    if (state.history.length > MAX_HISTORY) {
      state.history.shift();
    }
    state.future = [];
  }

  function snapshotState() {
    return JSON.parse(JSON.stringify({
      rowCount: state.rowCount,
      colCount: state.colCount,
      cells: state.cells,
      selection: state.selection,
    }));
  }

  function restoreSnapshot(snapshot) {
    state.rowCount = snapshot.rowCount;
    state.colCount = snapshot.colCount;
    state.cells = snapshot.cells || {};
    state.selection = snapshot.selection || makeSelection(0, 0, 0, 0);
    state.editing = null;
  }

  function recalculate() {
    state.evaluated = core.evaluateSheet(state.cells);
  }

  function setCellRaw(ref, raw) {
    if (!raw) {
      delete state.cells[ref];
      return;
    }
    state.cells[ref] = raw;
  }

  function setSelection(next) {
    state.selection = clampSelection(next.activeRow, next.activeCol, next.anchorRow, next.anchorCol);
    state.editing = null;
    render();
  }

  function extendSelection(rowDelta, colDelta) {
    const nextActiveRow = clamp(state.selection.activeRow + rowDelta, 0, state.rowCount - 1);
    const nextActiveCol = clamp(state.selection.activeCol + colDelta, 0, state.colCount - 1);
    setSelection(makeSelection(state.selection.anchorRow, state.selection.anchorCol, nextActiveRow, nextActiveCol));
  }

  function moveSelection(rowDelta, colDelta) {
    return clampSelection(
      state.selection.activeRow + rowDelta,
      state.selection.activeCol + colDelta,
      state.selection.activeRow + rowDelta,
      state.selection.activeCol + colDelta
    );
  }

  function activeRef() {
    return core.toCellRef(state.selection.activeRow, state.selection.activeCol);
  }

  function getActiveRaw() {
    return state.cells[activeRef()] || '';
  }

  function eachSelectedCell(visitor) {
    for (let row = state.selection.top; row <= state.selection.bottom; row += 1) {
      for (let col = state.selection.left; col <= state.selection.right; col += 1) {
        visitor(row, col);
      }
    }
  }

  function inSelection(row, col) {
    return row >= state.selection.top && row <= state.selection.bottom && col >= state.selection.left && col <= state.selection.right;
  }

  function makeSelection(anchorRow, anchorCol, activeRow, activeCol) {
    return {
      anchorRow: anchorRow,
      anchorCol: anchorCol,
      activeRow: activeRow,
      activeCol: activeCol,
      top: Math.min(anchorRow, activeRow),
      left: Math.min(anchorCol, activeCol),
      bottom: Math.max(anchorRow, activeRow),
      right: Math.max(anchorCol, activeCol),
    };
  }

  function clampSelection(activeRow, activeCol, anchorRow, anchorCol) {
    return makeSelection(
      clamp(anchorRow, 0, state.rowCount - 1),
      clamp(anchorCol, 0, state.colCount - 1),
      clamp(activeRow, 0, state.rowCount - 1),
      clamp(activeCol, 0, state.colCount - 1)
    );
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function arrowDelta(key) {
    if (key === 'ArrowUp') {
      return { row: -1, col: 0 };
    }
    if (key === 'ArrowDown') {
      return { row: 1, col: 0 };
    }
    if (key === 'ArrowLeft') {
      return { row: 0, col: -1 };
    }
    return { row: 0, col: 1 };
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify({
      rowCount: state.rowCount,
      colCount: state.colCount,
      cells: state.cells,
      selection: state.selection,
    }));
  }

  function restore() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      state.rowCount = parsed.rowCount || DEFAULT_ROWS;
      state.colCount = parsed.colCount || DEFAULT_COLS;
      state.cells = parsed.cells || {};
      if (parsed.selection) {
        state.selection = clampSelection(
          parsed.selection.activeRow,
          parsed.selection.activeCol,
          parsed.selection.anchorRow,
          parsed.selection.anchorCol
        );
      }
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }

  function getStorageNamespace() {
    return String(
      window.__ORACLE_STORAGE_NAMESPACE__ ||
      window.__RUN_STORAGE_NAMESPACE__ ||
      window.RUN_STORAGE_NAMESPACE ||
      document.documentElement.getAttribute('data-storage-namespace') ||
      'oracle-sheet'
    );
  }
})();
