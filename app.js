(function () {
  var engine = window.SpreadsheetEngine;
  var storage = window.SpreadsheetStorage;
  var STORAGE_PREFIX = storage.resolveStorageNamespace(window, document);
  var clipboard = window.SpreadsheetClipboard;
  var STORAGE_KEY = STORAGE_PREFIX + 'grid-state';
  var MAX_HISTORY = 50;
  var sheetEl = document.getElementById('sheet');
  var formulaInput = document.getElementById('formula-input');
  var selectionMeta = document.getElementById('selection-meta');
  var contextMenu = document.getElementById('context-menu');

  var state = loadState();
  var history = [];
  var future = [];
  var dragMode = null;
  var internalClipboard = null;

  render();
  syncFormulaBar();
  attachEvents();

  function defaultState() {
    return {
      rows: 100,
      cols: 26,
      cells: {},
      active: { row: 0, col: 0 },
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      editing: null,
    };
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return defaultState();
      }
      var parsed = JSON.parse(saved);
      return {
        rows: parsed.rows || 100,
        cols: parsed.cols || 26,
        cells: parsed.cells || {},
        active: parsed.active || { row: 0, col: 0 },
        range: parsed.range || { start: parsed.active || { row: 0, col: 0 }, end: parsed.active || { row: 0, col: 0 } },
        editing: null,
      };
    } catch (error) {
      return defaultState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: state.rows, cols: state.cols, cells: state.cells, active: state.active, range: state.range }));
    } catch (error) {
      // Ignore storage write failures so the sheet stays usable in restricted contexts.
    }
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({ rows: state.rows, cols: state.cols, cells: state.cells, active: state.active, range: state.range }));
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > MAX_HISTORY) {
      history.shift();
    }
    future = [];
  }

  function restoreSnapshot(next) {
    state.rows = next.rows;
    state.cols = next.cols;
    state.cells = next.cells;
    state.active = next.active;
    state.range = next.range;
    state.editing = null;
    render();
    syncFormulaBar();
    persist();
  }

  function coordLabel(coord) {
    return engine.indexToCol(coord.col) + String(coord.row + 1);
  }

  function normalizeRange(range) {
    return {
      start: { row: Math.min(range.start.row, range.end.row), col: Math.min(range.start.col, range.end.col) },
      end: { row: Math.max(range.start.row, range.end.row), col: Math.max(range.start.col, range.end.col) },
    };
  }

  function setActive(row, col, keepAnchor) {
    row = Math.max(0, Math.min(state.rows - 1, row));
    col = Math.max(0, Math.min(state.cols - 1, col));
    state.active = { row: row, col: col };
    if (keepAnchor) {
      state.range.end = { row: row, col: col };
    } else {
      state.range = { start: { row: row, col: col }, end: { row: row, col: col } };
    }
    state.editing = null;
    render();
    syncFormulaBar();
    persist();
  }

  function selectionContains(row, col) {
    var range = normalizeRange(state.range);
    return row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col;
  }

  function selectionSize() {
    var range = normalizeRange(state.range);
    return { width: range.end.col - range.start.col + 1, height: range.end.row - range.start.row + 1 };
  }

  function selectedRaw() {
    return state.cells[engine.keyFromCoord(state.active.row, state.active.col)] || '';
  }

  function syncFormulaBar() {
    if (document.activeElement !== formulaInput || !state.editing || state.editing.source !== 'formula') {
      formulaInput.value = state.editing ? state.editing.draft : selectedRaw();
    }
    var size = selectionSize();
    selectionMeta.textContent = coordLabel(state.active) + (size.width > 1 || size.height > 1 ? ' - ' + size.width + 'x' + size.height : '');
  }

  function render() {
    var evaluator = engine.evaluateSheet(state.cells, { rows: state.rows, cols: state.cols });
    var html = ['<thead><tr><th class="corner row-header"></th>'];
    for (var col = 0; col < state.cols; col += 1) {
      html.push('<th data-header="col" data-index="' + col + '">' + engine.indexToCol(col) + '</th>');
    }
    html.push('</tr></thead><tbody>');
    for (var row = 0; row < state.rows; row += 1) {
      html.push('<tr><th class="row-header" data-header="row" data-index="' + row + '">' + (row + 1) + '</th>');
      for (var cellCol = 0; cellCol < state.cols; cellCol += 1) {
        var result = evaluator.evaluateCell(row, cellCol);
        var isActive = state.active.row === row && state.active.col === cellCol;
        var classes = [];
        if (selectionContains(row, cellCol)) {
          classes.push('cell-range');
        }
        if (isActive) {
          classes.push('cell-active');
        }
        html.push('<td class="' + classes.join(' ') + '" data-row="' + row + '" data-col="' + cellCol + '">');
        if (state.editing && isActive && state.editing.source === 'cell') {
          html.push('<input class="cell-input" id="active-editor" spellcheck="false" value="' + escapeHtml(state.editing.draft) + '" />');
        } else {
          var typeClass = result.type === 'number' ? 'numeric' : result.type === 'boolean' ? 'boolean' : result.type === 'error' ? 'error' : '';
          html.push('<div class="cell-display ' + typeClass + '">' + escapeHtml(formatDisplay(result)) + '</div>');
        }
        html.push('</td>');
      }
      html.push('</tr>');
    }
    html.push('</tbody>');
    sheetEl.innerHTML = html.join('');
    var input = document.getElementById('active-editor');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('input', function () {
        state.editing.draft = input.value;
        formulaInput.value = input.value;
      });
      input.addEventListener('keydown', handleEditKeydown);
      input.addEventListener('blur', function () {
        if (state.editing && state.editing.source === 'cell') {
          commitEdit();
        }
      });
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDisplay(result) {
    if (result.type === 'number') {
      return Number.isInteger(result.value) ? String(result.value) : String(parseFloat(result.value.toFixed(6)));
    }
    if (result.type === 'boolean') {
      return result.value ? 'TRUE' : 'FALSE';
    }
    if (result.type === 'error') {
      return result.value;
    }
    return result.value;
  }

  function startEdit(initialDraft, source) {
    var draft = typeof initialDraft === 'string' ? initialDraft : selectedRaw();
    state.editing = { draft: draft, source: source || 'cell' };
    render();
    syncFormulaBar();
  }

  function commitEdit(move) {
    if (!state.editing) {
      return;
    }
    pushHistory();
    var key = engine.keyFromCoord(state.active.row, state.active.col);
    var value = state.editing.draft;
    if (value) {
      state.cells[key] = value;
    } else {
      delete state.cells[key];
    }
    state.editing = null;
    render();
    syncFormulaBar();
    persist();
    if (move) {
      setActive(state.active.row + move.row, state.active.col + move.col, false);
    }
  }

  function commitPendingEdit() {
    if (state.editing) {
      commitEdit();
    }
  }

  function cancelEdit() {
    state.editing = null;
    render();
    syncFormulaBar();
  }

  function moveSelection(rowDelta, colDelta, extend) {
    setActive(state.active.row + rowDelta, state.active.col + colDelta, extend);
  }

  function clearSelection() {
    pushHistory();
    var range = normalizeRange(state.range);
    for (var row = range.start.row; row <= range.end.row; row += 1) {
      for (var col = range.start.col; col <= range.end.col; col += 1) {
        delete state.cells[engine.keyFromCoord(row, col)];
      }
    }
    render();
    syncFormulaBar();
    persist();
  }

  function readSelectionMatrix() {
    var range = normalizeRange(state.range);
    var matrix = [];
    for (var row = range.start.row; row <= range.end.row; row += 1) {
      var line = [];
      for (var col = range.start.col; col <= range.end.col; col += 1) {
        line.push(state.cells[engine.keyFromCoord(row, col)] || '');
      }
      matrix.push(line);
    }
    return { matrix: matrix, origin: { row: range.start.row, col: range.start.col } };
  }

  function writeMatrix(target, matrix, sourceOrigin) {
    pushHistory();
    for (var row = 0; row < matrix.length; row += 1) {
      for (var col = 0; col < matrix[row].length; col += 1) {
        var targetRow = target.row + row;
        var targetCol = target.col + col;
        if (targetRow >= state.rows || targetCol >= state.cols) {
          continue;
        }
        var raw = matrix[row][col];
        if (sourceOrigin && raw && raw.charAt(0) === '=') {
          raw = engine.shiftFormula(raw, targetRow - (sourceOrigin.row + row), targetCol - (sourceOrigin.col + col));
        }
        var key = engine.keyFromCoord(targetRow, targetCol);
        if (raw) {
          state.cells[key] = raw;
        } else {
          delete state.cells[key];
        }
      }
    }
    state.range = { start: { row: target.row, col: target.col }, end: { row: Math.min(state.rows - 1, target.row + matrix.length - 1), col: Math.min(state.cols - 1, target.col + matrix[0].length - 1) } };
    state.active = { row: target.row, col: target.col };
    render();
    syncFormulaBar();
    persist();
  }

  function serializeMatrix(matrix) {
    return matrix.map(function (line) { return line.join('\t'); }).join('\n');
  }

  function insertStructure(kind, index, placement) {
    pushHistory();
    var insertAt = index + (placement === 'after' ? 1 : 0);
    var nextCells = {};
    Object.keys(state.cells).forEach(function (key) {
      var parts = key.split(',');
      var row = parseInt(parts[0], 10);
      var col = parseInt(parts[1], 10);
      if (kind === 'row' && row >= insertAt) {
        row += 1;
      }
      if (kind === 'col' && col >= insertAt) {
        col += 1;
      }
      nextCells[engine.keyFromCoord(row, col)] = state.cells[key];
    });
    state.cells = engine.updateFormulasForStructure(nextCells, kind, insertAt, 1);
    if (kind === 'row') {
      state.rows += 1;
    } else {
      state.cols += 1;
    }
    var insertedSelection = engine.adjustSelectionForStructure(
      { active: state.active, range: state.range },
      kind,
      insertAt,
      1,
      { rows: state.rows, cols: state.cols }
    );
    state.active = insertedSelection.active;
    state.range = insertedSelection.range;
    render();
    syncFormulaBar();
    persist();
  }

  function deleteStructure(kind, index) {
    if ((kind === 'row' && state.rows <= 1) || (kind === 'col' && state.cols <= 1)) {
      return;
    }
    pushHistory();
    var nextCells = {};
    Object.keys(state.cells).forEach(function (key) {
      var parts = key.split(',');
      var row = parseInt(parts[0], 10);
      var col = parseInt(parts[1], 10);
      if (kind === 'row') {
        if (row === index) {
          return;
        }
        if (row > index) {
          row -= 1;
        }
      } else {
        if (col === index) {
          return;
        }
        if (col > index) {
          col -= 1;
        }
      }
      nextCells[engine.keyFromCoord(row, col)] = state.cells[key];
    });
    state.cells = engine.updateFormulasForStructure(nextCells, kind, index, -1);
    if (kind === 'row') {
      state.rows -= 1;
    } else {
      state.cols -= 1;
    }
    var deletedSelection = engine.adjustSelectionForStructure(
      { active: state.active, range: state.range },
      kind,
      index,
      -1,
      { rows: state.rows, cols: state.cols }
    );
    state.active = deletedSelection.active;
    state.range = deletedSelection.range;
    render();
    syncFormulaBar();
    persist();
  }

  function openContextMenu(kind, index, x, y) {
    contextMenu.innerHTML = [
      '<button class="context-item" data-action="insert-before" data-kind="' + kind + '" data-index="' + index + '">Insert ' + kind + ' before</button>',
      '<button class="context-item" data-action="insert-after" data-kind="' + kind + '" data-index="' + index + '">Insert ' + kind + ' after</button>',
      '<button class="context-item" data-action="delete" data-kind="' + kind + '" data-index="' + index + '">Delete ' + kind + '</button>'
    ].join('');
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.remove('hidden');
  }

  function closeContextMenu() {
    contextMenu.classList.add('hidden');
  }

  function handleGridMouseDown(event) {
    var cell = event.target.closest('td');
    if (!cell) {
      return;
    }
    commitPendingEdit();
    var row = parseInt(cell.getAttribute('data-row'), 10);
    var col = parseInt(cell.getAttribute('data-col'), 10);
    dragMode = 'select';
    if (event.shiftKey) {
      state.range.end = { row: row, col: col };
      state.active = { row: row, col: col };
      render();
      syncFormulaBar();
      persist();
      return;
    }
    state.active = { row: row, col: col };
    state.range = { start: { row: row, col: col }, end: { row: row, col: col } };
    state.editing = null;
    render();
    syncFormulaBar();
    persist();
  }

  function handleGridMouseOver(event) {
    if (dragMode !== 'select') {
      return;
    }
    var cell = event.target.closest('td');
    if (!cell) {
      return;
    }
    state.range.end = { row: parseInt(cell.getAttribute('data-row'), 10), col: parseInt(cell.getAttribute('data-col'), 10) };
    render();
    syncFormulaBar();
  }

  function handleEditKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ row: 1, col: 0 });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit({ row: 0, col: 1 });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  function undo() {
    if (!history.length) {
      return;
    }
    future.push(snapshot());
    restoreSnapshot(history.pop());
  }

  function redo() {
    if (!future.length) {
      return;
    }
    history.push(snapshot());
    restoreSnapshot(future.pop());
  }

  function attachEvents() {
    sheetEl.addEventListener('mousedown', handleGridMouseDown);
    sheetEl.addEventListener('mouseover', handleGridMouseOver);
    sheetEl.addEventListener('dblclick', function (event) {
      if (event.target.closest('td')) {
        startEdit(selectedRaw(), 'cell');
      }
    });
    sheetEl.addEventListener('contextmenu', function (event) {
      var header = event.target.closest('[data-header]');
      if (!header) {
        closeContextMenu();
        return;
      }
      event.preventDefault();
      openContextMenu(header.getAttribute('data-header'), parseInt(header.getAttribute('data-index'), 10), event.clientX, event.clientY);
    });
    window.addEventListener('mouseup', function () {
      dragMode = null;
    });
    window.addEventListener('click', function (event) {
      if (!event.target.closest('#context-menu')) {
        closeContextMenu();
      }
    });
    contextMenu.addEventListener('click', function (event) {
      var button = event.target.closest('.context-item');
      if (!button) {
        return;
      }
      commitPendingEdit();
      var kind = button.getAttribute('data-kind');
      var index = parseInt(button.getAttribute('data-index'), 10);
      var action = button.getAttribute('data-action');
      closeContextMenu();
      if (action === 'delete') {
        deleteStructure(kind, index);
      } else {
        insertStructure(kind, index, action === 'insert-after' ? 'after' : 'before');
      }
    });
    formulaInput.addEventListener('focus', function () {
      state.editing = { draft: selectedRaw(), source: 'formula' };
      formulaInput.value = state.editing.draft;
    });
    formulaInput.addEventListener('input', function () {
      if (!state.editing) {
        state.editing = { draft: selectedRaw(), source: 'formula' };
      }
      state.editing.draft = formulaInput.value;
    });
    formulaInput.addEventListener('blur', function () {
      if (state.editing && state.editing.source === 'formula') {
        commitEdit();
      }
    });
    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit({ row: 1, col: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit({ row: 0, col: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
        formulaInput.blur();
      }
    });
    document.addEventListener('keydown', function (event) {
      var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      var modifier = isMac ? event.metaKey : event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (modifier && ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        redo();
        return;
      }
      if (state.editing) {
        return;
      }
      if (modifier) {
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
        startEdit(selectedRaw(), 'cell');
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearSelection();
      } else if (event.key.length === 1 && !event.altKey) {
        event.preventDefault();
        startEdit(event.key, 'cell');
      }
    });
    document.addEventListener('copy', function (event) {
      var payload = readSelectionMatrix();
      internalClipboard = { matrix: payload.matrix, origin: payload.origin, cut: false };
      event.clipboardData.setData('text/plain', serializeMatrix(payload.matrix));
      event.preventDefault();
    });
    document.addEventListener('cut', function (event) {
      var payload = readSelectionMatrix();
      internalClipboard = { matrix: payload.matrix, origin: payload.origin, cut: true };
      event.clipboardData.setData('text/plain', serializeMatrix(payload.matrix));
      event.preventDefault();
    });
    document.addEventListener('paste', function (event) {
      if (state.editing) {
        return;
      }
      event.preventDefault();
      var text = event.clipboardData.getData('text/plain');
      var matrix = text.split(/\r?\n/).filter(function (line, index, arr) { return !(index === arr.length - 1 && line === ''); }).map(function (line) { return line.split('\t'); });
      if (!matrix.length) {
        return;
      }
      var sourceOrigin = null;
      if (internalClipboard && serializeMatrix(internalClipboard.matrix) === text) {
        sourceOrigin = internalClipboard.origin;
      }
      writeMatrix(clipboard.resolvePasteTarget(state.range, state.active, matrix), matrix, sourceOrigin);
      if (internalClipboard && internalClipboard.cut && sourceOrigin) {
        clipboard.cellsToClearAfterCut(sourceOrigin, matrix, state.active).forEach(function (coord) {
          delete state.cells[engine.keyFromCoord(coord.row, coord.col)];
        });
        render();
        syncFormulaBar();
        persist();
        internalClipboard = null;
      }
    });
  }
})();
