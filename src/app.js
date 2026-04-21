(function () {
  'use strict';

  var engine = window.FormulaEngine;
  var storage = window.GridStorage;
  var COLUMN_COUNT = engine.COLUMN_COUNT;
  var ROW_COUNT = engine.ROW_COUNT;
  var STORAGE_KEY = storage.getStorageKey(window);

  var state = {
    sheet: engine.createSheet(loadPersisted().cells),
    selection: loadPersisted().selection || createPoint(1, 1),
    anchor: loadPersisted().selection || createPoint(1, 1),
    draft: '',
    editing: false,
    dragging: false,
    history: [],
    future: [],
    pendingCut: null,
    internalClipboard: null,
  };

  var container = document.getElementById('sheet-container');
  var formulaInput = document.getElementById('formula-input');
  var nameBox = document.querySelector('.name-box');
  var persistedSelection = clampPoint(state.selection);
  state.selection = persistedSelection;
  state.anchor = persistedSelection;

  function loadPersisted() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cells: state.sheet.cells,
      selection: state.selection,
    }));
  }

  function createPoint(row, col) {
    return { row: row, col: col };
  }

  function clonePoint(point) {
    return createPoint(point.row, point.col);
  }

  function clampPoint(point) {
    return createPoint(
      Math.min(ROW_COUNT, Math.max(1, point.row)),
      Math.min(COLUMN_COUNT, Math.max(1, point.col))
    );
  }

  function selectionBounds() {
    return {
      top: Math.min(state.anchor.row, state.selection.row),
      bottom: Math.max(state.anchor.row, state.selection.row),
      left: Math.min(state.anchor.col, state.selection.col),
      right: Math.max(state.anchor.col, state.selection.col),
    };
  }

  function pointToId(point) {
    return engine.indexToCol(point.col) + String(point.row);
  }

  function activeCellId() {
    return pointToId(state.selection);
  }

  function getRaw(point) {
    return state.sheet.cells[pointToId(point)] || '';
  }

  function setSelection(point, keepAnchor) {
    state.selection = clampPoint(point);
    if (!keepAnchor) {
      state.anchor = clonePoint(state.selection);
    }
    if (!state.editing) {
      state.draft = getRaw(state.selection);
    }
    persist();
    render();
    ensureVisible();
  }

  function ensureVisible() {
    var cell = container.querySelector('[data-cell-id="' + activeCellId() + '"]');
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function pushHistory() {
    state.history.push({
      cells: Object.assign({}, state.sheet.cells),
      selection: clonePoint(state.selection),
      anchor: clonePoint(state.anchor),
    });
    if (state.history.length > 50) {
      state.history.shift();
    }
    state.future = [];
  }

  function restoreSnapshot(stackFrom, stackTo) {
    if (!stackFrom.length) {
      return;
    }

    stackTo.push({
      cells: Object.assign({}, state.sheet.cells),
      selection: clonePoint(state.selection),
      anchor: clonePoint(state.anchor),
    });

    var snapshot = stackFrom.pop();
    state.sheet = engine.createSheet(snapshot.cells);
    state.selection = clampPoint(snapshot.selection);
    state.anchor = clampPoint(snapshot.anchor);
    state.draft = getRaw(state.selection);
    state.editing = false;
    persist();
    render();
  }

  function beginEdit(replace) {
    state.editing = true;
    state.draft = replace ? '' : getRaw(state.selection);
    render();
    formulaInput.focus();
    if (replace) {
      formulaInput.setSelectionRange(state.draft.length, state.draft.length);
    } else {
      formulaInput.select();
    }
  }

  function cancelEdit() {
    state.editing = false;
    state.draft = getRaw(state.selection);
    render();
  }

  function setCellRaw(point, raw) {
    var cellId = pointToId(point);
    if (raw === '') {
      delete state.sheet.cells[cellId];
      return;
    }
    state.sheet.cells[cellId] = raw;
  }

  function commitEdit(moveRow, moveCol) {
    var currentRaw = getRaw(state.selection);
    if (state.draft !== currentRaw) {
      pushHistory();
      setCellRaw(state.selection, state.draft);
      state.pendingCut = null;
      persist();
    }
    state.editing = false;
    state.draft = getRaw(state.selection);
    if (typeof moveRow === 'number' || typeof moveCol === 'number') {
      setSelection(createPoint(state.selection.row + (moveRow || 0), state.selection.col + (moveCol || 0)));
      return;
    }
    render();
  }

  function isPointInSelection(point) {
    var bounds = selectionBounds();
    return point.row >= bounds.top && point.row <= bounds.bottom && point.col >= bounds.left && point.col <= bounds.right;
  }

  function clearSelection() {
    var bounds = selectionBounds();
    var changed = false;
    var row;
    var col;
    pushHistory();
    for (row = bounds.top; row <= bounds.bottom; row += 1) {
      for (col = bounds.left; col <= bounds.right; col += 1) {
        var cellId = engine.indexToCol(col) + String(row);
        if (state.sheet.cells[cellId]) {
          delete state.sheet.cells[cellId];
          changed = true;
        }
      }
    }
    if (!changed) {
      state.history.pop();
      return;
    }
    state.pendingCut = null;
    state.editing = false;
    state.draft = getRaw(state.selection);
    persist();
    render();
  }

  function boundsSize(bounds) {
    return {
      rows: bounds.bottom - bounds.top + 1,
      cols: bounds.right - bounds.left + 1,
    };
  }

  function rawMatrixFromSelection() {
    var bounds = selectionBounds();
    var rows = [];
    var row;
    var col;
    for (row = bounds.top; row <= bounds.bottom; row += 1) {
      var current = [];
      for (col = bounds.left; col <= bounds.right; col += 1) {
        current.push(state.sheet.cells[engine.indexToCol(col) + String(row)] || '');
      }
      rows.push(current);
    }
    return rows;
  }

  function matrixToTsv(matrix) {
    return matrix.map(function (row) {
      return row.join('\t');
    }).join('\n');
  }

  function parseTsv(text) {
    return text.replace(/\r/g, '').split('\n').map(function (line) {
      return line.split('\t');
    });
  }

  function copySelection(isCut) {
    var bounds = selectionBounds();
    var matrix = rawMatrixFromSelection();
    var text = matrixToTsv(matrix);
    state.internalClipboard = {
      text: text,
      matrix: matrix,
      sourceBounds: bounds,
      isCut: Boolean(isCut),
    };
    state.pendingCut = isCut ? state.internalClipboard : null;
    render();
    return text;
  }

  function applyMatrix(matrix, sourceBounds) {
    var selectionSize = boundsSize(selectionBounds());
    var sourceRows = matrix.length;
    var sourceCols = matrix[0] ? matrix[0].length : 1;
    var useSelectionSize = selectionSize.rows === sourceRows && selectionSize.cols === sourceCols && (selectionSize.rows > 1 || selectionSize.cols > 1);
    var targetTop = useSelectionSize ? selectionBounds().top : state.selection.row;
    var targetLeft = useSelectionSize ? selectionBounds().left : state.selection.col;
    var sourceTop = sourceBounds ? sourceBounds.top : 1;
    var sourceLeft = sourceBounds ? sourceBounds.left : 1;
    var rowIndex;
    var colIndex;

    pushHistory();

    for (rowIndex = 0; rowIndex < sourceRows; rowIndex += 1) {
      for (colIndex = 0; colIndex < sourceCols; colIndex += 1) {
        var destination = createPoint(targetTop + rowIndex, targetLeft + colIndex);
        if (destination.row > ROW_COUNT || destination.col > COLUMN_COUNT) {
          continue;
        }
        var raw = matrix[rowIndex][colIndex] || '';
        if (sourceBounds && raw.charAt(0) === '=') {
          raw = engine.moveFormula(raw, destination.row - (sourceTop + rowIndex), destination.col - (sourceLeft + colIndex));
        }
        setCellRaw(destination, raw);
      }
    }

    if (state.pendingCut && sourceBounds) {
      var row;
      var col;
      for (row = sourceBounds.top; row <= sourceBounds.bottom; row += 1) {
        for (col = sourceBounds.left; col <= sourceBounds.right; col += 1) {
          if (row >= targetTop && row < targetTop + sourceRows && col >= targetLeft && col < targetLeft + sourceCols) {
            continue;
          }
          delete state.sheet.cells[engine.indexToCol(col) + String(row)];
        }
      }
      state.pendingCut = null;
    }

    state.anchor = createPoint(targetTop, targetLeft);
    state.selection = createPoint(
      Math.min(ROW_COUNT, targetTop + sourceRows - 1),
      Math.min(COLUMN_COUNT, targetLeft + sourceCols - 1)
    );
    state.editing = false;
    state.draft = getRaw(state.selection);
    persist();
    render();
  }

  function applyStructuralChange(action) {
    pushHistory();

    if (action === 'insert-row-above') {
      state.sheet = engine.insertRow(state.sheet, state.selection.row);
      state.selection = createPoint(Math.min(ROW_COUNT, state.selection.row + 1), state.selection.col);
    } else if (action === 'insert-row-below') {
      state.sheet = engine.insertRow(state.sheet, Math.min(ROW_COUNT, state.selection.row + 1));
    } else if (action === 'delete-row') {
      state.sheet = engine.deleteRow(state.sheet, state.selection.row);
      state.selection = createPoint(Math.max(1, Math.min(state.selection.row, ROW_COUNT)), state.selection.col);
    } else if (action === 'insert-column-left') {
      state.sheet = engine.insertColumn(state.sheet, state.selection.col);
      state.selection = createPoint(state.selection.row, Math.min(COLUMN_COUNT, state.selection.col + 1));
    } else if (action === 'insert-column-right') {
      state.sheet = engine.insertColumn(state.sheet, Math.min(COLUMN_COUNT, state.selection.col + 1));
    } else if (action === 'delete-column') {
      state.sheet = engine.deleteColumn(state.sheet, state.selection.col);
      state.selection = createPoint(state.selection.row, Math.max(1, Math.min(state.selection.col, COLUMN_COUNT)));
    }

    state.anchor = clonePoint(state.selection);
    state.pendingCut = null;
    state.editing = false;
    state.draft = getRaw(state.selection);
    persist();
    render();
  }

  function appendHeaderButtons(wrapper, actions) {
    var actionWrap = document.createElement('span');
    actionWrap.className = 'header-actions';
    actions.forEach(function (action) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'header-action';
      button.dataset.action = action.action;
      button.textContent = action.label;
      button.title = action.title;
      actionWrap.appendChild(button);
    });
    wrapper.appendChild(actionWrap);
  }

  function handlePasteText(text) {
    if (!text) {
      return;
    }
    var useInternal = state.internalClipboard && state.internalClipboard.text === text;
    var matrix = useInternal ? state.internalClipboard.matrix : parseTsv(text);
    var sourceBounds = useInternal ? state.internalClipboard.sourceBounds : null;
    applyMatrix(matrix, sourceBounds);
  }

  function cellKind(display) {
    if (display === '') {
      return 'text';
    }
    return Number.isFinite(Number(display)) ? 'number' : 'text';
  }

  function buildGrid() {
    var table = document.createElement('table');
    table.className = 'sheet-table';
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner-cell';
    headerRow.appendChild(corner);

    var col;
    for (col = 1; col <= COLUMN_COUNT; col += 1) {
      var colHeader = document.createElement('th');
      colHeader.className = 'col-header';
      var colContent = document.createElement('div');
      colContent.className = 'header-content';
      var colLabel = document.createElement('span');
      colLabel.textContent = engine.indexToCol(col);
      colContent.appendChild(colLabel);
      if (col === state.selection.col) {
        appendHeaderButtons(colContent, [
          { action: 'insert-column-left', label: '+L', title: 'Insert column left' },
          { action: 'insert-column-right', label: '+R', title: 'Insert column right' },
          { action: 'delete-column', label: '-', title: 'Delete column' },
        ]);
      }
      colHeader.appendChild(colContent);
      if (col >= selectionBounds().left && col <= selectionBounds().right) {
        colHeader.classList.add('range-selected');
      }
      headerRow.appendChild(colHeader);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var row;
    for (row = 1; row <= ROW_COUNT; row += 1) {
      var tr = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      var rowContent = document.createElement('div');
      rowContent.className = 'header-content';
      var rowLabel = document.createElement('span');
      rowLabel.textContent = String(row);
      rowContent.appendChild(rowLabel);
      if (row === state.selection.row) {
        appendHeaderButtons(rowContent, [
          { action: 'insert-row-above', label: '+A', title: 'Insert row above' },
          { action: 'insert-row-below', label: '+B', title: 'Insert row below' },
          { action: 'delete-row', label: '-', title: 'Delete row' },
        ]);
      }
      rowHeader.appendChild(rowContent);
      if (row >= selectionBounds().top && row <= selectionBounds().bottom) {
        rowHeader.classList.add('range-selected');
      }
      tr.appendChild(rowHeader);

      for (col = 1; col <= COLUMN_COUNT; col += 1) {
        var cellPoint = createPoint(row, col);
        var cellId = pointToId(cellPoint);
        var evaluated = engine.evaluateCell(state.sheet, cellId);
        var cell = document.createElement('td');
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.cellId = cellId;
        cell.dataset.kind = cellKind(evaluated.display);
        cell.textContent = evaluated.display;
        if (isPointInSelection(cellPoint)) {
          cell.classList.add('range-selected');
        }
        if (row === state.selection.row && col === state.selection.col) {
          cell.classList.add('active');
        }
        if (evaluated.display.charAt(0) === '#') {
          cell.classList.add('error');
        }
        if (state.pendingCut && row >= state.pendingCut.sourceBounds.top && row <= state.pendingCut.sourceBounds.bottom && col >= state.pendingCut.sourceBounds.left && col <= state.pendingCut.sourceBounds.right) {
          cell.classList.add('cut-source');
        }
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    return table;
  }

  function render() {
    container.replaceChildren(buildGrid());
    nameBox.textContent = activeCellId();
    formulaInput.value = state.editing ? state.draft : getRaw(state.selection);
  }

  function cellFromEventTarget(target) {
    if (!target || !target.closest) {
      return null;
    }
    var cell = target.closest('.cell');
    if (!cell) {
      return null;
    }
    return createPoint(Number(cell.dataset.row), Number(cell.dataset.col));
  }

  container.addEventListener('mousedown', function (event) {
    if (event.target.closest('.header-action')) {
      return;
    }
    var point = cellFromEventTarget(event.target);
    if (!point) {
      return;
    }
    event.preventDefault();
    state.dragging = true;
    setSelection(point, event.shiftKey);
  });

  container.addEventListener('mouseover', function (event) {
    if (!state.dragging) {
      return;
    }
    var point = cellFromEventTarget(event.target);
    if (!point) {
      return;
    }
    state.selection = clampPoint(point);
    persist();
    render();
  });

  window.addEventListener('mouseup', function () {
    state.dragging = false;
  });

  container.addEventListener('dblclick', function (event) {
    if (cellFromEventTarget(event.target)) {
      beginEdit(false);
    }
  });

  container.addEventListener('click', function (event) {
    var actionButton = event.target.closest('.header-action');
    if (!actionButton) {
      return;
    }
    event.preventDefault();
    applyStructuralChange(actionButton.dataset.action);
  });

  formulaInput.addEventListener('focus', function () {
    if (!state.editing) {
      state.editing = true;
      state.draft = getRaw(state.selection);
      render();
    }
  });

  formulaInput.addEventListener('input', function () {
    state.editing = true;
    state.draft = formulaInput.value;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(1, 0);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(0, 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      container.focus();
    }
  });

  formulaInput.addEventListener('blur', function () {
    if (state.editing) {
      commitEdit();
    }
  });

  document.addEventListener('keydown', function (event) {
    var modifier = event.metaKey || event.ctrlKey;
    if (modifier && !state.editing) {
      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        restoreSnapshot(state.future, state.history);
        return;
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        restoreSnapshot(state.history, state.future);
        return;
      }
      if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        restoreSnapshot(state.future, state.history);
        return;
      }
    }

    if (state.editing) {
      return;
    }

    var handled = true;
    if (event.key === 'ArrowUp') {
      setSelection(createPoint(state.selection.row - 1, state.selection.col), event.shiftKey);
    } else if (event.key === 'ArrowDown') {
      setSelection(createPoint(state.selection.row + 1, state.selection.col), event.shiftKey);
    } else if (event.key === 'ArrowLeft') {
      setSelection(createPoint(state.selection.row, state.selection.col - 1), event.shiftKey);
    } else if (event.key === 'ArrowRight') {
      setSelection(createPoint(state.selection.row, state.selection.col + 1), event.shiftKey);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      beginEdit(false);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      clearSelection();
    } else if (event.key === 'Tab') {
      setSelection(createPoint(state.selection.row, state.selection.col + 1));
    } else if (event.key.length === 1 && !modifier && !event.altKey) {
      beginEdit(true);
      state.draft = event.key;
      formulaInput.value = state.draft;
      formulaInput.focus();
      formulaInput.setSelectionRange(1, 1);
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  });

  document.addEventListener('copy', function (event) {
    if (state.editing) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', copySelection(false));
  });

  document.addEventListener('cut', function (event) {
    if (state.editing) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', copySelection(true));
  });

  document.addEventListener('paste', function (event) {
    if (state.editing) {
      return;
    }
    event.preventDefault();
    handlePasteText(event.clipboardData.getData('text/plain'));
  });

  render();
  ensureVisible();
})();
