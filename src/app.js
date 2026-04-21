(function () {
  'use strict';

  var engine = window.SpreadsheetEngine;
  var COL_COUNT = engine.COL_COUNT;
  var ROW_COUNT = engine.ROW_COUNT;
  var grid = document.getElementById('sheet-grid');
  var formulaBar = document.getElementById('formula-input');
  var nameBox = document.getElementById('name-box');
  var editor = document.getElementById('cell-editor');
  var scroller = document.getElementById('grid-scroller');
  var menu = document.getElementById('header-menu');
  var namespace = window.__BENCHMARK_STORAGE_NAMESPACE__ || window.BENCHMARK_STORAGE_NAMESPACE || window.__RUN_STORAGE_NAMESPACE__ || 'amazon-sheet';
  var storageKey = namespace + ':sheet-state';
  var storedState = loadState();
  var model = new engine.SpreadsheetModel(storedState || undefined);
  var dragState = null;
  var internalClipboard = null;
  var editingCell = null;
  var formulaDraft = null;

  createGrid();
  render();

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey));
    } catch (error) {
      return null;
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(model.snapshot()));
  }

  function activeCellId() {
    return engine.formatCellId(model.selection.focus.col, model.selection.focus.row);
  }

  function isInRange(row, col) {
    var range = engine.normalizeRange(model.selection);
    return row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
  }

  function render() {
    var cells = grid.querySelectorAll('td[data-cell]');
    for (var i = 0; i < cells.length; i += 1) {
      var cell = cells[i];
      var row = Number(cell.dataset.row);
      var col = Number(cell.dataset.col);
      var cellId = engine.formatCellId(col, row);
      var raw = model.getRaw(cellId);
      var display = model.getDisplayValue(cellId);
      var button = cell.querySelector('button');
      button.textContent = display;
      cell.classList.toggle('is-active', row === model.selection.focus.row && col === model.selection.focus.col);
      cell.classList.toggle('is-in-range', isInRange(row, col));
      cell.classList.toggle('is-text', raw && raw.charAt(0) !== '=' && !(raw.trim() !== '' && Number.isFinite(Number(raw))));
      cell.classList.toggle('is-formula', raw && raw.charAt(0) === '=');
      cell.classList.toggle('is-error', /^#/.test(display));
    }
    var headers = grid.querySelectorAll('th[data-row], th[data-col]');
    for (var j = 0; j < headers.length; j += 1) {
      var header = headers[j];
      if (header.dataset.row) {
        var rowRange = engine.normalizeRange(model.selection);
        header.classList.toggle('is-highlighted', Number(header.dataset.row) >= rowRange.top && Number(header.dataset.row) <= rowRange.bottom);
      }
      if (header.dataset.col) {
        var colRange = engine.normalizeRange(model.selection);
        header.classList.toggle('is-highlighted', Number(header.dataset.col) >= colRange.left && Number(header.dataset.col) <= colRange.right);
      }
    }
    nameBox.value = activeCellId();
    if (engine.shouldSyncFormulaBar(document.activeElement, formulaBar, formulaDraft)) {
      formulaBar.value = model.getRaw(activeCellId());
    }
    positionEditor();
    saveState();
  }

  function createGrid() {
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);
    for (var col = 0; col < COL_COUNT; col += 1) {
      var header = document.createElement('th');
      header.dataset.col = String(col);
      header.textContent = engine.formatCellId(col, 0).replace('1', '');
      headRow.appendChild(header);
    }
    thead.appendChild(headRow);
    var tbody = document.createElement('tbody');
    for (var row = 0; row < ROW_COUNT; row += 1) {
      var tr = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.dataset.row = String(row);
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);
      for (col = 0; col < COL_COUNT; col += 1) {
        var td = document.createElement('td');
        var address = engine.formatCellId(col, row);
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        td.dataset.cell = address;
        var button = document.createElement('button');
        button.type = 'button';
        button.dataset.address = address;
        td.appendChild(button);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    grid.appendChild(thead);
    grid.appendChild(tbody);
  }

  function updateSelection(row, col, extend) {
    row = Math.max(0, Math.min(ROW_COUNT - 1, row));
    col = Math.max(0, Math.min(COL_COUNT - 1, col));
    if (extend) {
      model.selection.focus = { row: row, col: col };
    } else {
      model.selection = { anchor: { row: row, col: col }, focus: { row: row, col: col } };
    }
    render();
    grid.querySelector('td[data-cell="' + engine.formatCellId(col, row) + '"] button').focus({ preventScroll: true });
  }

  function beginEdit(value, replace) {
    editingCell = activeCellId();
    editor.value = replace ? value : model.getRaw(editingCell);
    positionEditor();
    editor.hidden = false;
    editor.focus();
    if (!replace) {
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  function commitEdit(nextSelection) {
    if (!editingCell) {
      return;
    }
    model.setCell(editingCell, editor.value);
    editingCell = null;
    render();
    if (nextSelection) {
      updateSelection(nextSelection.row, nextSelection.col, false);
    }
  }

  function cancelEdit() {
    editingCell = null;
    formulaDraft = null;
    render();
  }

  function positionEditor() {
    if (!editingCell) {
      editor.hidden = true;
      return;
    }
    var cell = grid.querySelector('td[data-cell="' + editingCell + '"]');
    if (!cell) {
      editor.hidden = true;
      return;
    }
    var rect = cell.getBoundingClientRect();
    var gridRect = scroller.getBoundingClientRect();
    editor.hidden = false;
    editor.style.left = rect.left - gridRect.left + scroller.scrollLeft + 'px';
    editor.style.top = rect.top - gridRect.top + scroller.scrollTop + 'px';
    editor.style.width = rect.width + 1 + 'px';
    editor.style.height = rect.height + 1 + 'px';
  }

  function closeHeaderMenu() {
    menu.hidden = true;
    menu.dataset.kind = '';
    menu.dataset.index = '';
  }

  function buildCellText(rows) {
    return rows.map(function (row) { return row.join('\t'); }).join('\n');
  }

  function applyPastedRows(rows, cutSource) {
    var targetRange = engine.normalizeRange(model.selection);
    var height = rows.length;
    var width = rows[0] ? rows[0].length : 1;
    var currentRange = engine.normalizeRange(model.selection);
    var currentWidth = currentRange.right - currentRange.left + 1;
    var currentHeight = currentRange.bottom - currentRange.top + 1;
    var baseRow = currentWidth === width && currentHeight === height ? targetRange.top : model.selection.focus.row;
    var baseCol = currentWidth === width && currentHeight === height ? targetRange.left : model.selection.focus.col;
    var updates = {};
    for (var row = 0; row < height; row += 1) {
      for (var col = 0; col < width; col += 1) {
        var raw = rows[row][col] || '';
        if (internalClipboard && internalClipboard.text === buildCellText(rows) && raw && raw.charAt(0) === '=') {
          raw = engine.shiftFormula(raw, baseCol - internalClipboard.origin.col + col, baseRow - internalClipboard.origin.row + row);
        }
        updates[engine.formatCellId(baseCol + col, baseRow + row)] = raw;
      }
    }
    if (cutSource && internalClipboard) {
      var sourceRange = engine.normalizeRange(internalClipboard.selection);
      for (var clearRow = sourceRange.top; clearRow <= sourceRange.bottom; clearRow += 1) {
        for (var clearCol = sourceRange.left; clearCol <= sourceRange.right; clearCol += 1) {
          updates[engine.formatCellId(clearCol, clearRow)] = '';
        }
      }
    }
    model.setCells(updates);
    updateSelection(baseRow, baseCol, false);
  }

  function handleCopyLike(event, cut) {
    var rows = model.getRangeRaw(model.selection);
    var text = buildCellText(rows);
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', text);
    }
    internalClipboard = {
      selection: JSON.parse(JSON.stringify(model.selection)),
      origin: { row: engine.normalizeRange(model.selection).top, col: engine.normalizeRange(model.selection).left },
      text: text,
      cut: cut,
    };
    event.preventDefault();
  }

  grid.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-address]');
    if (!button) {
      return;
    }
    var cell = button.closest('td');
    updateSelection(Number(cell.dataset.row), Number(cell.dataset.col), !!event.shiftKey);
  });

  grid.addEventListener('dblclick', function (event) {
    var button = event.target.closest('button[data-address]');
    if (!button) {
      return;
    }
    beginEdit(model.getRaw(button.dataset.address), false);
  });

  grid.addEventListener('mousedown', function (event) {
    var cell = event.target.closest('td[data-cell]');
    if (!cell) {
      return;
    }
    closeHeaderMenu();
    updateSelection(Number(cell.dataset.row), Number(cell.dataset.col), !!event.shiftKey);
    dragState = { anchor: { row: model.selection.anchor.row, col: model.selection.anchor.col } };
    event.preventDefault();
  });

  document.addEventListener('mousemove', function (event) {
    if (!dragState) {
      return;
    }
    var cell = event.target.closest('td[data-cell]');
    if (!cell) {
      return;
    }
    model.selection.anchor = JSON.parse(JSON.stringify(dragState.anchor));
    model.selection.focus = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    render();
  });

  document.addEventListener('mouseup', function () {
    dragState = null;
  });

  grid.addEventListener('contextmenu', function (event) {
    var header = event.target.closest('th[data-row], th[data-col]');
    if (!header) {
      return;
    }
    event.preventDefault();
    menu.hidden = false;
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.dataset.kind = header.dataset.row ? 'row' : 'col';
    menu.dataset.index = header.dataset.row || header.dataset.col;
  });

  menu.addEventListener('click', function (event) {
    var action = event.target.getAttribute('data-action');
    if (!action) {
      return;
    }
    var index = Number(menu.dataset.index);
    if (menu.dataset.kind === 'row') {
      if (action === 'insert-before') {
        model.insertRow(index);
      } else if (action === 'insert-after') {
        model.insertRow(index + 1);
      } else {
        model.deleteRow(index);
      }
    } else {
      if (action === 'insert-before') {
        model.insertColumn(index);
      } else if (action === 'insert-after') {
        model.insertColumn(index + 1);
      } else {
        model.deleteColumn(index);
      }
    }
    closeHeaderMenu();
    render();
  });

  document.addEventListener('click', function (event) {
    if (!menu.contains(event.target)) {
      closeHeaderMenu();
    }
  });

  formulaBar.addEventListener('focus', function () {
    formulaDraft = model.getRaw(activeCellId());
    formulaBar.value = formulaDraft;
    formulaBar.select();
  });

  formulaBar.addEventListener('input', function () {
    formulaDraft = formulaBar.value;
  });

  formulaBar.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      model.setCell(activeCellId(), formulaBar.value);
      formulaDraft = null;
      updateSelection(Math.min(model.selection.focus.row + 1, ROW_COUNT - 1), model.selection.focus.col, false);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      model.setCell(activeCellId(), formulaBar.value);
      formulaDraft = null;
      updateSelection(model.selection.focus.row, Math.min(model.selection.focus.col + 1, COL_COUNT - 1), false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      formulaDraft = null;
      render();
      formulaBar.blur();
    }
  });

  formulaBar.addEventListener('blur', function () {
    if (formulaDraft !== null) {
      model.setCell(activeCellId(), formulaBar.value);
      formulaDraft = null;
      render();
    }
  });

  editor.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ row: Math.min(model.selection.focus.row + 1, ROW_COUNT - 1), col: model.selection.focus.col });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit({ row: model.selection.focus.row, col: Math.min(model.selection.focus.col + 1, COL_COUNT - 1) });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (document.activeElement === formulaBar || document.activeElement === editor) {
      return;
    }
    var meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        model.redo();
      } else {
        model.undo();
      }
      render();
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      model.redo();
      render();
      return;
    }
    if (meta) {
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      model.clearRange(model.selection);
      render();
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(model.getRaw(activeCellId()), false);
      return;
    }
    if (event.key.indexOf('Arrow') === 0) {
      event.preventDefault();
      var row = model.selection.focus.row;
      var col = model.selection.focus.col;
      if (event.key === 'ArrowUp') {
        row -= 1;
      } else if (event.key === 'ArrowDown') {
        row += 1;
      } else if (event.key === 'ArrowLeft') {
        col -= 1;
      } else if (event.key === 'ArrowRight') {
        col += 1;
      }
      updateSelection(row, col, event.shiftKey);
      return;
    }
    if (event.key.length === 1 && !event.altKey) {
      event.preventDefault();
      beginEdit(event.key, true);
    }
  });

  document.addEventListener('copy', function (event) {
    handleCopyLike(event, false);
  });

  document.addEventListener('cut', function (event) {
    handleCopyLike(event, true);
  });

  document.addEventListener('paste', function (event) {
    if (document.activeElement === formulaBar || document.activeElement === editor) {
      return;
    }
    var text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    if (!text) {
      return;
    }
    var rows = text.split(/\r?\n/).map(function (line) { return line.split('\t'); });
    applyPastedRows(rows, internalClipboard && internalClipboard.cut && internalClipboard.text === text);
    if (internalClipboard && internalClipboard.cut && internalClipboard.text === text) {
      internalClipboard = null;
    }
    render();
    event.preventDefault();
  });

  window.addEventListener('resize', positionEditor);
  scroller.addEventListener('scroll', positionEditor);
})();
