(function () {
  var engine = window.SpreadsheetEngine;
  var gridRoot = document.getElementById('grid');
  var formulaBar = document.getElementById('formula-bar');
  var state = {
    cells: {},
    evaluated: {},
    active: 'A1',
    anchor: 'A1',
    editing: null,
    history: [],
    future: [],
    dragging: false,
  };
  var editor = null;
  var storageKey = getStorageNamespace() + ':sheet-state';

  restoreState();
  renderGrid();
  recalculate();
  renderSelection();
  syncFormulaBar();

  formulaBar.addEventListener('focus', function () {
    if (state.editing) {
      return;
    }
    formulaBar.select();
  });

  formulaBar.addEventListener('input', function () {
    if (!state.editing) {
      startEditing(state.active, formulaBar.value, true);
      return;
    }
    editor.value = formulaBar.value;
  });

  formulaBar.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(1, 0);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(0, 1);
    }
  });

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCut);
  document.addEventListener('paste', handlePaste);

  function getStorageNamespace() {
    return window.__BENCHMARK_STORAGE_NAMESPACE__ ||
      window.BENCHMARK_STORAGE_NAMESPACE ||
      document.documentElement.dataset.storageNamespace ||
      new URLSearchParams(window.location.search).get('storageNamespace') ||
      'facebook-spreadsheet';
  }

  function restoreState() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      var saved = JSON.parse(raw);
      state.cells = saved.cells || {};
      state.active = saved.active || 'A1';
      state.anchor = saved.anchor || state.active;
    } catch (error) {
      state.cells = {};
    }
  }

  function persistState() {
    localStorage.setItem(storageKey, JSON.stringify({
      cells: state.cells,
      active: state.active,
      anchor: state.anchor,
    }));
  }

  function pushHistory() {
    state.history.push(JSON.stringify({
      cells: state.cells,
      active: state.active,
      anchor: state.anchor,
    }));
    if (state.history.length > 50) {
      state.history.shift();
    }
    state.future = [];
  }

  function restoreSnapshot(raw) {
    var snapshot = JSON.parse(raw);
    state.cells = snapshot.cells || {};
    state.active = snapshot.active || 'A1';
    state.anchor = snapshot.anchor || state.active;
    stopEditing(true);
    recalculate();
    renderSelection();
    syncFormulaBar();
    persistState();
  }

  function renderGrid() {
    var table = document.createElement('table');
    table.className = 'sheet';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);
    for (var column = 0; column < engine.MAX_COLUMNS; column += 1) {
      var header = document.createElement('th');
      header.textContent = engine.columnLabel(column);
      headRow.appendChild(header);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var row = 0; row < engine.MAX_ROWS; row += 1) {
      var tr = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);
      for (column = 0; column < engine.MAX_COLUMNS; column += 1) {
        var address = engine.toAddress(column, row);
        var td = document.createElement('td');
        td.dataset.address = address;
        td.tabIndex = -1;
        td.addEventListener('mousedown', handleCellMouseDown);
        td.addEventListener('dblclick', function (event) {
          startEditing(event.currentTarget.dataset.address, null, false);
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    gridRoot.innerHTML = '';
    gridRoot.appendChild(table);
    gridRoot.addEventListener('mousemove', handleCellDrag);
    document.addEventListener('mouseup', stopDrag);
  }

  function handleCellMouseDown(event) {
    var address = event.currentTarget.dataset.address;
    stopEditing(false);
    state.dragging = true;
    setSelection(address, event.shiftKey ? state.anchor : address);
    if (event.shiftKey) {
      return;
    }
    state.anchor = address;
  }

  function handleCellDrag(event) {
    if (!state.dragging) {
      return;
    }
    var cell = event.target.closest('td[data-address]');
    if (!cell) {
      return;
    }
    setSelection(cell.dataset.address, state.anchor);
  }

  function stopDrag() {
    state.dragging = false;
  }

  function handleKeydown(event) {
    if (event.target === formulaBar) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && ((event.shiftKey && event.key.toLowerCase() === 'z') || event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      redo();
      return;
    }
    if (state.editing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
      return;
    }
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
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(state.active, null, false);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
    } else if (!event.metaKey && !event.ctrlKey && event.key.length === 1) {
      event.preventDefault();
      startEditing(state.active, event.key, false);
    }
  }

  function moveSelection(rowDelta, columnDelta, extend) {
    var parsed = engine.parseAddress(state.active);
    var row = Math.max(0, Math.min(engine.MAX_ROWS - 1, parsed.row + rowDelta));
    var column = Math.max(0, Math.min(engine.MAX_COLUMNS - 1, parsed.column + columnDelta));
    var next = engine.toAddress(column, row);
    setSelection(next, extend ? state.anchor : next);
    if (!extend) {
      state.anchor = next;
    }
  }

  function setSelection(active, anchor) {
    state.active = active;
    state.anchor = anchor;
    renderSelection();
    syncFormulaBar();
    persistState();
    scrollActiveIntoView();
  }

  function selectionBounds() {
    var active = engine.parseAddress(state.active);
    var anchor = engine.parseAddress(state.anchor);
    return {
      minRow: Math.min(active.row, anchor.row),
      maxRow: Math.max(active.row, anchor.row),
      minColumn: Math.min(active.column, anchor.column),
      maxColumn: Math.max(active.column, anchor.column),
    };
  }

  function renderSelection() {
    var bounds = selectionBounds();
    gridRoot.querySelectorAll('td[data-address]').forEach(function (cell) {
      var parsed = engine.parseAddress(cell.dataset.address);
      var inRange = parsed.row >= bounds.minRow && parsed.row <= bounds.maxRow && parsed.column >= bounds.minColumn && parsed.column <= bounds.maxColumn;
      cell.classList.toggle('in-range', inRange);
      cell.classList.toggle('active', cell.dataset.address === state.active);
      var entry = state.evaluated[cell.dataset.address];
      cell.classList.toggle('error', Boolean(entry && /^#/.test(entry.display)));
      cell.textContent = entry ? entry.display : '';
    });
  }

  function syncFormulaBar() {
    formulaBar.value = state.editing ? editor.value : ((state.cells[state.active] && state.cells[state.active].raw) || '');
  }

  function startEditing(address, seedValue, fromFormulaBar) {
    state.active = address;
    state.anchor = address;
    renderSelection();
    stopEditing(true);
    var cell = gridRoot.querySelector('[data-address="' + address + '"]');
    var rect = cell.getBoundingClientRect();
    var hostRect = gridRoot.getBoundingClientRect();
    editor = document.createElement('input');
    editor.className = 'editor';
    editor.type = 'text';
    editor.spellcheck = false;
    editor.value = seedValue != null ? seedValue : ((state.cells[address] && state.cells[address].raw) || '');
    editor.style.top = (cell.offsetTop - gridRoot.scrollTop) + 'px';
    editor.style.left = (cell.offsetLeft - gridRoot.scrollLeft) + 'px';
    editor.style.width = rect.width + 'px';
    editor.style.height = rect.height + 'px';
    gridRoot.appendChild(editor);
    state.editing = { address: address, original: (state.cells[address] && state.cells[address].raw) || '' };
    editor.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(1, 0);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(0, 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });
    editor.addEventListener('input', function () {
      formulaBar.value = editor.value;
    });
    editor.addEventListener('blur', function () {
      if (state.editing) {
        commitEdit(0, 0);
      }
    });
    formulaBar.value = editor.value;
    if (!fromFormulaBar) {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  function stopEditing(silent) {
    if (!editor) {
      return;
    }
    editor.remove();
    editor = null;
    state.editing = null;
    if (!silent) {
      syncFormulaBar();
    }
  }

  function commitEdit(moveRow, moveColumn) {
    if (!state.editing || !editor) {
      return;
    }
    pushHistory();
    var value = editor.value;
    if (value) {
      state.cells[state.editing.address] = { raw: value };
    } else {
      delete state.cells[state.editing.address];
    }
    stopEditing(true);
    recalculate();
    if (moveRow || moveColumn) {
      var parsed = engine.parseAddress(state.active);
      setSelection(engine.toAddress(Math.max(0, Math.min(engine.MAX_COLUMNS - 1, parsed.column + moveColumn)), Math.max(0, Math.min(engine.MAX_ROWS - 1, parsed.row + moveRow))), engine.toAddress(Math.max(0, Math.min(engine.MAX_COLUMNS - 1, parsed.column + moveColumn)), Math.max(0, Math.min(engine.MAX_ROWS - 1, parsed.row + moveRow))));
    } else {
      renderSelection();
      syncFormulaBar();
      persistState();
    }
  }

  function cancelEdit() {
    stopEditing(false);
  }

  function recalculate() {
    state.evaluated = engine.evaluateSheet(state.cells);
    renderSelection();
    persistState();
  }

  function clearSelection() {
    pushHistory();
    eachAddressInSelection(function (address) {
      delete state.cells[address];
    });
    recalculate();
    syncFormulaBar();
  }

  function eachAddressInSelection(visitor) {
    var bounds = selectionBounds();
    for (var row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      for (var column = bounds.minColumn; column <= bounds.maxColumn; column += 1) {
        visitor(engine.toAddress(column, row), row, column);
      }
    }
  }

  function handleCopy(event) {
    if (state.editing) {
      return;
    }
    event.preventDefault();
    var rows = [];
    var bounds = selectionBounds();
    for (var row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      var values = [];
      for (var column = bounds.minColumn; column <= bounds.maxColumn; column += 1) {
        var address = engine.toAddress(column, row);
        values.push((state.cells[address] && state.cells[address].raw) || '');
      }
      rows.push(values.join('\t'));
    }
    event.clipboardData.setData('text/plain', rows.join('\n'));
  }

  function handleCut(event) {
    if (state.editing) {
      return;
    }
    handleCopy(event);
    clearSelection();
  }

  function handlePaste(event) {
    if (state.editing) {
      return;
    }
    var text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    event.preventDefault();
    pushHistory();
    var start = engine.parseAddress(state.active);
    var rows = text.replace(/\r/g, '').split('\n');
    for (var rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
      if (!rows[rowOffset]) {
        continue;
      }
      var values = rows[rowOffset].split('\t');
      for (var columnOffset = 0; columnOffset < values.length; columnOffset += 1) {
        var target = engine.toAddress(start.column + columnOffset, start.row + rowOffset);
        if (!target) {
          continue;
        }
        var raw = values[columnOffset];
        if (raw.startsWith('=')) {
          raw = engine.adjustFormula(raw, rowOffset, columnOffset);
        }
        if (raw) {
          state.cells[target] = { raw: raw };
        } else {
          delete state.cells[target];
        }
      }
    }
    recalculate();
    syncFormulaBar();
  }

  function undo() {
    if (!state.history.length) {
      return;
    }
    state.future.push(JSON.stringify({ cells: state.cells, active: state.active, anchor: state.anchor }));
    restoreSnapshot(state.history.pop());
  }

  function redo() {
    if (!state.future.length) {
      return;
    }
    state.history.push(JSON.stringify({ cells: state.cells, active: state.active, anchor: state.anchor }));
    restoreSnapshot(state.future.pop());
  }

  function scrollActiveIntoView() {
    var cell = gridRoot.querySelector('[data-address="' + state.active + '"]');
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
})();
