(function () {
  const core = window.SpreadsheetCore;
  const COLS = 26;
  const ROWS = 100;
  const storageNamespace = resolveStorageNamespace();
  const storageKey = storageNamespace + ':sheet-state';
  const persisted = loadState();
  const sheet = core.createSheet(persisted.cells);
  const gridWrap = document.querySelector('.grid-wrap');
  const formulaInput = document.querySelector('#formula-input');
  const initialSelection = persisted.selection || { start: persisted.active || 'A1', end: persisted.active || 'A1' };
  const state = {
    active: persisted.active || 'A1',
    editing: null,
    selection: initialSelection,
    dragAnchor: null,
    clipboard: null,
  };

  renderGrid();
  syncFormulaBar();
  focusActiveCell();

  gridWrap.addEventListener('mousedown', function (event) {
    const cell = event.target.closest('[data-address]');
    if (!cell) return;
    state.dragAnchor = event.shiftKey ? state.selection.start : cell.dataset.address;
    selectCell(cell.dataset.address, event.shiftKey, state.dragAnchor);
  });
  gridWrap.addEventListener('mouseover', function (event) {
    const cell = event.target.closest('[data-address]');
    if (!cell || event.buttons !== 1 || !state.dragAnchor) return;
    selectCell(cell.dataset.address, true, state.dragAnchor);
  });
  gridWrap.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-address]');
    if (cell) startEdit(cell.dataset.address, false, '');
  });
  gridWrap.addEventListener('keydown', handleGridKeydown);
  window.addEventListener('mouseup', function () {
    state.dragAnchor = null;
  });
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCut);
  document.addEventListener('paste', onPaste);

  formulaInput.addEventListener('input', function () {
    if (state.editing !== 'formula') state.editing = 'formula';
  });
  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitValue(state.active, formulaInput.value, 'down');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      state.editing = null;
      syncFormulaBar();
      focusActiveCell();
    }
  });
  formulaInput.addEventListener('blur', function () {
    if (state.editing === 'formula') commitValue(state.active, formulaInput.value, null);
  });

  function renderGrid() {
    const table = document.createElement('table');
    table.className = 'sheet';
    table.innerHTML = renderHeader() + renderBody();
    gridWrap.replaceChildren(table);
    updateVisibleCells();
  }
  function renderHeader() {
    let html = '<thead><tr><th class="corner row-header"></th>';
    for (let col = 1; col <= COLS; col += 1) html += '<th>' + core.indexToColumn(col) + '</th>';
    return html + '</tr></thead>';
  }
  function renderBody() {
    let html = '<tbody>';
    for (let row = 1; row <= ROWS; row += 1) {
      html += '<tr><th class="row-header">' + row + '</th>';
      for (let col = 1; col <= COLS; col += 1) {
        const address = core.makeAddress(col, row);
        html += '<td><div class="cell" tabindex="0" data-address="' + address + '"></div></td>';
      }
      html += '</tr>';
    }
    return html + '</tbody>';
  }
  function handleGridKeydown(event) {
    if (state.editing && state.editing !== 'formula') return;
    if (event.target.classList.contains('cell-input')) return;
    const movement = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (movement) {
      event.preventDefault();
      moveSelection(movement[0], movement[1], event.shiftKey);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEdit(state.active, false, '');
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      startEdit(state.active, true, event.key);
    }
  }
  function startEdit(address, replace, value) {
    selectCell(address);
    const cell = getCellElement(address);
    state.editing = address;
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = replace ? value : core.getCellRaw(sheet, address);
    cell.replaceChildren(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    formulaInput.value = input.value;
    input.addEventListener('input', function () { formulaInput.value = input.value; });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitValue(address, input.value, 'down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitValue(address, input.value, 'right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        state.editing = null;
        updateVisibleCells();
        syncFormulaBar();
        focusActiveCell();
      }
    });
    input.addEventListener('blur', function () {
      if (state.editing === address) commitValue(address, input.value, null);
    });
  }
  function commitValue(address, value, move) {
    core.setCell(sheet, address, value);
    state.editing = null;
    persistState();
    updateVisibleCells();
    if (move === 'down') moveSelection(0, 1);
    if (move === 'right') moveSelection(1, 0);
    syncFormulaBar();
    focusActiveCell();
  }
  function selectCell(address, extend, anchor) {
    state.active = address;
    if (extend) {
      state.selection = { start: anchor || state.selection.start, end: address };
    } else {
      state.selection = { start: address, end: address };
    }
    updateVisibleCells();
    syncFormulaBar();
    persistState();
  }
  function moveSelection(dx, dy, extend) {
    const current = core.splitAddress(state.active);
    const next = core.makeAddress(clamp(current.col + dx, 1, COLS), clamp(current.row + dy, 1, ROWS));
    selectCell(next, extend, extend ? state.selection.start : next);
    focusActiveCell();
  }
  function updateVisibleCells() {
    const bounds = getSelectionBounds();
    const cells = gridWrap.querySelectorAll('[data-address]');
    for (let i = 0; i < cells.length; i += 1) {
      const address = cells[i].dataset.address;
      cells[i].classList.toggle('active', address === state.active);
      cells[i].classList.toggle('in-range', isAddressInBounds(address, bounds));
      if (state.editing === address) continue;
      cells[i].textContent = core.getCellDisplay(sheet, address);
    }
  }
  function syncFormulaBar() {
    if (state.editing !== 'formula') formulaInput.value = core.getCellRaw(sheet, state.active);
  }
  function focusActiveCell() {
    const cell = getCellElement(state.active);
    if (cell) cell.focus();
  }
  function getCellElement(address) {
    return gridWrap.querySelector('[data-address="' + address + '"]');
  }
  function persistState() {
    localStorage.setItem(storageKey, JSON.stringify({ cells: sheet.cells, active: state.active, selection: state.selection }));
  }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (error) { return {}; }
  }
  function resolveStorageNamespace() {
    return window.__RUN_STORAGE_NAMESPACE__ || window.RUN_STORAGE_NAMESPACE || window.__BENCHMARK_STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'sheet';
  }
  function getSelectionBounds() {
    const start = core.splitAddress(state.selection.start);
    const end = core.splitAddress(state.selection.end);
    return {
      left: Math.min(start.col, end.col),
      right: Math.max(start.col, end.col),
      top: Math.min(start.row, end.row),
      bottom: Math.max(start.row, end.row),
    };
  }
  function isAddressInBounds(address, bounds) {
    const cell = core.splitAddress(address);
    return cell.col >= bounds.left && cell.col <= bounds.right && cell.row >= bounds.top && cell.row <= bounds.bottom;
  }
  function clearSelection() {
    const bounds = getSelectionBounds();
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        core.setCell(sheet, core.makeAddress(col, row), '');
      }
    }
    state.editing = null;
    persistState();
    updateVisibleCells();
    syncFormulaBar();
  }
  function getCopiedSelection() {
    const bounds = getSelectionBounds();
    return core.copyRange(sheet, core.makeAddress(bounds.left, bounds.top), core.makeAddress(bounds.right, bounds.bottom));
  }
  function serializeCopied(copied) {
    return copied.values.map(function (row) { return row.join('\t'); }).join('\n');
  }
  function parseClipboardText(text) {
    return text.replace(/\r/g, '').split('\n').map(function (row) { return row.split('\t'); });
  }
  function onCopy(event) {
    if (event.target === formulaInput) return;
    state.clipboard = getCopiedSelection();
    event.preventDefault();
    event.clipboardData.setData('text/plain', serializeCopied(state.clipboard));
  }
  function onCut(event) {
    if (event.target === formulaInput) return;
    state.clipboard = getCopiedSelection();
    event.preventDefault();
    event.clipboardData.setData('text/plain', serializeCopied(state.clipboard));
    clearSelection();
  }
  function onPaste(event) {
    if (event.target === formulaInput || (state.editing && state.editing !== 'formula')) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const copied = state.clipboard && serializeCopied(state.clipboard) === text
      ? state.clipboard
      : { start: state.active, values: parseClipboardText(text) };
    core.pasteBlock(sheet, copied, getPasteTarget());
    state.selection = {
      start: getPasteTarget(),
      end: core.makeAddress(core.splitAddress(getPasteTarget()).col + copied.values[0].length - 1, core.splitAddress(getPasteTarget()).row + copied.values.length - 1),
    };
    state.active = getPasteTarget();
    persistState();
    updateVisibleCells();
    syncFormulaBar();
  }
  function getPasteTarget() {
    const bounds = getSelectionBounds();
    return core.makeAddress(bounds.left, bounds.top);
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
})();
