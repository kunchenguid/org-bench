(function () {
  const core = window.SpreadsheetCore;
  const storageApi = window.EmmaStorage;
  const historyApi = window.EmmaHistory;
  const COLS = 26;
  const ROWS = 100;
  const storageNamespace = resolveStorageNamespace();
  const persisted = loadState();
  const sheet = core.createSheet(persisted.cells);
  const gridWrap = document.querySelector('.grid-wrap');
  const formulaInput = document.querySelector('#formula-input');
  const nameBox = document.querySelector('#name-box');
  const state = { active: persisted.active || 'A1', editing: null, rangeAnchor: null, clipboard: null };
  let history = historyApi.createHistory(snapshotState());

  renderGrid();
  syncFormulaBar();
  focusActiveCell();

  gridWrap.addEventListener('click', function (event) {
    const cell = event.target.closest('[data-address]');
    if (!cell) return;
    if (event.shiftKey) extendSelectionTo(cell.dataset.address);
    else selectCell(cell.dataset.address);
  });
  gridWrap.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-address]');
    if (cell) startEdit(cell.dataset.address, false, '');
  });
  gridWrap.addEventListener('keydown', handleGridKeydown);
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCut);
  document.addEventListener('paste', handlePaste);

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
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      restoreSnapshot(historyApi.undoSnapshot(history));
      return;
    }
    if (((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'z') || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      restoreSnapshot(historyApi.redoSnapshot(history));
      return;
    }
    const movement = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (movement) {
      event.preventDefault();
      if (event.shiftKey) extendSelection(movement[0], movement[1]);
      else moveSelection(movement[0], movement[1]);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEdit(state.active, false, '');
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelectedCells();
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
    history = historyApi.recordSnapshot(history, nextCommitSnapshot(address, value, move));
    core.setCell(sheet, address, value);
    state.editing = null;
    persistState();
    updateVisibleCells();
    if (move === 'down') moveSelection(0, 1);
    if (move === 'right') moveSelection(1, 0);
    syncFormulaBar();
    focusActiveCell();
  }

  function selectCell(address) {
    state.active = address;
    state.rangeAnchor = null;
    updateVisibleCells();
    syncFormulaBar();
    persistState();
  }

  function moveSelection(dx, dy) {
    const current = core.splitAddress(state.active);
    selectCell(core.makeAddress(clamp(current.col + dx, 1, COLS), clamp(current.row + dy, 1, ROWS)));
    focusActiveCell();
  }

  function extendSelection(dx, dy) {
    if (!state.rangeAnchor) state.rangeAnchor = core.splitAddress(state.active);
    const current = core.splitAddress(state.active);
    state.active = core.makeAddress(clamp(current.col + dx, 1, COLS), clamp(current.row + dy, 1, ROWS));
    updateVisibleCells();
    syncFormulaBar();
    persistState();
    focusActiveCell();
  }

  function extendSelectionTo(address) {
    if (!state.rangeAnchor) state.rangeAnchor = core.splitAddress(state.active);
    state.active = address;
    updateVisibleCells();
    syncFormulaBar();
    persistState();
    focusActiveCell();
  }

  function clearSelectedCells() {
    const addresses = getSelectedAddresses();
    history = historyApi.recordSnapshot(history, nextClearSnapshot(addresses));
    for (let index = 0; index < addresses.length; index += 1) {
      core.setCell(sheet, addresses[index], '');
    }
    persistState();
    updateVisibleCells();
    syncFormulaBar();
  }

  function handleCopy(event) {
    if (!shouldHandleClipboard(event)) return;
    const payload = buildClipboardPayload();
    event.preventDefault();
    event.clipboardData.setData('text/plain', payload.text);
    payload.cut = false;
    state.clipboard = payload;
  }

  function handleCut(event) {
    if (!shouldHandleClipboard(event)) return;
    const payload = buildClipboardPayload();
    event.preventDefault();
    event.clipboardData.setData('text/plain', payload.text);
    payload.cut = true;
    state.clipboard = payload;
  }

  function handlePaste(event) {
    if (!shouldHandleClipboard(event)) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    applyClipboard(text);
  }

  function shouldHandleClipboard(event) {
    if (state.editing && state.editing !== 'formula') return false;
    const activeElement = document.activeElement;
    if (activeElement === formulaInput) return false;
    return gridWrap.contains(activeElement) || gridWrap.contains(event.target) || document.body === activeElement;
  }

  function buildClipboardPayload() {
    const range = getSelectedRange();
    const rect = range || getSingleCellRange(state.active);
    const rows = [];
    for (let row = rect.startRow; row <= rect.endRow; row += 1) {
      const values = [];
      for (let col = rect.startCol; col <= rect.endCol; col += 1) {
        values.push(core.getCellRaw(sheet, core.makeAddress(col, row)));
      }
      rows.push(values);
    }
    return {
      anchor: core.makeAddress(rect.startCol, rect.startRow),
      rows: rows,
      width: rect.endCol - rect.startCol + 1,
      height: rect.endRow - rect.startRow + 1,
      text: rows.map(function (row) { return row.join('\t'); }).join('\n'),
      cut: false,
    };
  }

  function applyClipboard(text) {
    const payload = state.clipboard && state.clipboard.text === text ? state.clipboard : parseClipboardText(text);
    const target = getPasteRange(payload);
    const sourceStart = payload.anchor ? core.splitAddress(payload.anchor) : null;
    history = historyApi.recordSnapshot(history, nextPasteSnapshot(payload, target));
    for (let row = 0; row < payload.height; row += 1) {
      for (let col = 0; col < payload.width; col += 1) {
        const targetAddress = core.makeAddress(target.startCol + col, target.startRow + row);
        if (!isAddressInBounds(targetAddress)) continue;
        const raw = payload.rows[row][col];
        const sourceAddress = sourceStart ? core.makeAddress(sourceStart.col + col, sourceStart.row + row) : targetAddress;
        core.setCell(sheet, targetAddress, core.shiftFormula(raw, sourceAddress, targetAddress));
      }
    }
    if (payload.cut && payload.anchor) clearCutSource(payload, target);
    state.active = core.makeAddress(target.startCol, target.startRow);
    state.rangeAnchor = payload.width > 1 || payload.height > 1 ? { col: target.startCol, row: target.startRow } : null;
    if (state.rangeAnchor) state.active = core.makeAddress(target.endCol, target.endRow);
    persistState();
    updateVisibleCells();
    syncFormulaBar();
    focusActiveCell();
    if (payload.cut) state.clipboard = null;
  }

  function clearCutSource(payload, target) {
    const sourceStart = core.splitAddress(payload.anchor);
    for (let row = 0; row < payload.height; row += 1) {
      for (let col = 0; col < payload.width; col += 1) {
        const sourceAddress = core.makeAddress(sourceStart.col + col, sourceStart.row + row);
        if (!isAddressWithinRange(sourceAddress, target)) core.setCell(sheet, sourceAddress, '');
      }
    }
  }

  function parseClipboardText(text) {
    const rows = text.replace(/\r/g, '').split('\n').map(function (row) { return row.split('\t'); });
    return {
      anchor: null,
      rows: rows,
      width: rows[0] ? rows[0].length : 1,
      height: rows.length,
      text: text,
      cut: false,
    };
  }

  function getPasteRange(payload) {
    const selected = getSelectedRange();
    if (selected && rangeWidth(selected) === payload.width && rangeHeight(selected) === payload.height) return selected;
    const active = core.splitAddress(state.active);
    return {
      startCol: active.col,
      endCol: active.col + payload.width - 1,
      startRow: active.row,
      endRow: active.row + payload.height - 1,
    };
  }
  function getSelectedRange() {
    if (!state.rangeAnchor) return null;
    const anchor = state.rangeAnchor;
    const active = core.splitAddress(state.active);
    return {
      startCol: Math.min(anchor.col, active.col),
      endCol: Math.max(anchor.col, active.col),
      startRow: Math.min(anchor.row, active.row),
      endRow: Math.max(anchor.row, active.row),
    };
  }

  function getSingleCellRange(address) {
    const cell = core.splitAddress(address);
    return { startCol: cell.col, endCol: cell.col, startRow: cell.row, endRow: cell.row };
  }
  function getSelectedAddresses() {
    const range = getSelectedRange();
    if (!range) return [state.active];
    const addresses = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        addresses.push(core.makeAddress(col, row));
      }
    }
    return addresses;
  }

  function isCellSelected(address) {
    const range = getSelectedRange();
    if (!range) return address === state.active;
    const position = core.splitAddress(address);
    return position.col >= range.startCol && position.col <= range.endCol && position.row >= range.startRow && position.row <= range.endRow;
  }

  function isAddressWithinRange(address, range) {
    const position = core.splitAddress(address);
    return position.col >= range.startCol && position.col <= range.endCol && position.row >= range.startRow && position.row <= range.endRow;
  }
  function updateVisibleCells() {
    const cells = gridWrap.querySelectorAll('[data-address]');
    for (let i = 0; i < cells.length; i += 1) {
      const address = cells[i].dataset.address;
      cells[i].classList.toggle('range', isCellSelected(address));
      cells[i].classList.toggle('active', address === state.active);
      if (state.editing === address) continue;
      cells[i].textContent = core.getCellDisplay(sheet, address);
    }
  }

  function syncFormulaBar() {
    nameBox.textContent = state.active;
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
    storageApi.savePersistedSheet(localStorage, storageNamespace, { cells: sheet.cells, active: state.active });
  }

  function loadState() {
    return storageApi.loadPersistedSheet(localStorage, storageNamespace) || {};
  }

  function restoreSnapshot(result) {
    history = result.history;
    state.active = result.snapshot.active || 'A1';
    state.rangeAnchor = result.snapshot.rangeAnchor || null;
    state.editing = null;
    sheet.cells = Object.assign({}, result.snapshot.cells);
    persistState();
    updateVisibleCells();
    syncFormulaBar();
    focusActiveCell();
  }

  function nextCommitSnapshot(address, value, move) {
    const cells = Object.assign({}, sheet.cells);
    const nextActive = resolveNextActive(address, move);
    if (value) cells[address] = String(value);
    else delete cells[address];
    return { cells: cells, active: nextActive, rangeAnchor: null };
  }

  function nextClearSnapshot(addresses) {
    const cells = Object.assign({}, sheet.cells);
    for (let index = 0; index < addresses.length; index += 1) {
      delete cells[addresses[index]];
    }
    return {
      cells: cells,
      active: state.active,
      rangeAnchor: state.rangeAnchor ? { col: state.rangeAnchor.col, row: state.rangeAnchor.row } : null,
    };
  }

  function nextPasteSnapshot(payload, target) {
    const cells = Object.assign({}, sheet.cells);
    const sourceStart = payload.anchor ? core.splitAddress(payload.anchor) : null;
    for (let row = 0; row < payload.height; row += 1) {
      for (let col = 0; col < payload.width; col += 1) {
        const targetAddress = core.makeAddress(target.startCol + col, target.startRow + row);
        if (!isAddressInBounds(targetAddress)) continue;
        const raw = payload.rows[row][col];
        const sourceAddress = sourceStart ? core.makeAddress(sourceStart.col + col, sourceStart.row + row) : targetAddress;
        const shifted = core.shiftFormula(raw, sourceAddress, targetAddress);
        if (shifted) cells[targetAddress] = shifted;
        else delete cells[targetAddress];
      }
    }
    if (payload.cut && payload.anchor) {
      for (let row = 0; row < payload.height; row += 1) {
        for (let col = 0; col < payload.width; col += 1) {
          const sourceAddress = core.makeAddress(sourceStart.col + col, sourceStart.row + row);
          if (!isAddressWithinRange(sourceAddress, target)) delete cells[sourceAddress];
        }
      }
    }
    return {
      cells: cells,
      active: payload.width > 1 || payload.height > 1 ? core.makeAddress(target.endCol, target.endRow) : core.makeAddress(target.startCol, target.startRow),
      rangeAnchor: payload.width > 1 || payload.height > 1 ? { col: target.startCol, row: target.startRow } : null,
    };
  }

  function resolveNextActive(address, move) {
    const current = core.splitAddress(address);
    if (move === 'down') return core.makeAddress(current.col, clamp(current.row + 1, 1, ROWS));
    if (move === 'right') return core.makeAddress(clamp(current.col + 1, 1, COLS), current.row);
    return address;
  }

  function snapshotState() {
    return {
      cells: Object.assign({}, sheet.cells),
      active: state.active,
      rangeAnchor: state.rangeAnchor ? { col: state.rangeAnchor.col, row: state.rangeAnchor.row } : null,
    };
  }

  function resolveStorageNamespace() {
    return window.__RUN_STORAGE_NAMESPACE__ || window.RUN_STORAGE_NAMESPACE || window.__BENCHMARK_STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'spreadsheet';
  }

  function rangeWidth(range) { return range.endCol - range.startCol + 1; }
  function rangeHeight(range) { return range.endRow - range.startRow + 1; }
  function isAddressInBounds(address) {
    const position = core.splitAddress(address);
    return position && position.col >= 1 && position.col <= COLS && position.row >= 1 && position.row <= ROWS;
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
})();
