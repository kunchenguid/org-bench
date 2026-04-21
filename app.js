(function () {
  'use strict';

  var api = window.SpreadsheetApp;
  var sheet = api.createSpreadsheet();
  var gridNode = document.getElementById('grid');
  var formulaInput = document.getElementById('formula-input');
  var nameBox = document.querySelector('.name-box');
  var storageNamespace = String(
    window.__BENCHMARK_STORAGE_NAMESPACE__ ||
    window.BENCHMARK_STORAGE_NAMESPACE ||
    document.documentElement.getAttribute('data-storage-namespace') ||
    'northstar-sheet:'
  );
  var storageKey = storageNamespace + 'workbook';
  var selectionKey = storageNamespace + 'selection';
  var selection = {
    anchorRow: 0,
    anchorCol: 0,
    focusRow: 0,
    focusCol: 0,
  };
  var isMouseSelecting = false;
  var isEditing = false;
  var formulaDraft = '';
  var suppressFormulaChange = false;
  var internalClipboardToken = '';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getBounds() {
    var state = sheet.getState();
    return {
      rows: state.rowCount,
      cols: state.colCount,
    };
  }

  function currentCellAddress() {
    return api.formatAddress(selection.focusRow, selection.focusCol);
  }

  function getSelectionRect() {
    return {
      top: Math.min(selection.anchorRow, selection.focusRow),
      bottom: Math.max(selection.anchorRow, selection.focusRow),
      left: Math.min(selection.anchorCol, selection.focusCol),
      right: Math.max(selection.anchorCol, selection.focusCol),
    };
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(sheet.getState()));
    localStorage.setItem(selectionKey, JSON.stringify(selection));
  }

  function load() {
    try {
      var workbook = localStorage.getItem(storageKey);
      var savedSelection = localStorage.getItem(selectionKey);
      if (workbook) {
        sheet.loadState(JSON.parse(workbook));
      }
      if (savedSelection) {
        var parsed = JSON.parse(savedSelection);
        selection.anchorRow = parsed.anchorRow || 0;
        selection.anchorCol = parsed.anchorCol || 0;
        selection.focusRow = parsed.focusRow || 0;
        selection.focusCol = parsed.focusCol || 0;
      }
    } catch (error) {
      console.error(error);
    }
  }

  function getRawAt(row, col) {
    return sheet.getRawValue(api.formatAddress(row, col));
  }

  function getDisplayAt(row, col) {
    return sheet.getDisplayValue(api.formatAddress(row, col));
  }

  function setCellAt(row, col, raw) {
    sheet.setCell(api.formatAddress(row, col), raw);
    save();
  }

  function classifyValue(display, raw) {
    if (display === '') {
      return '';
    }
    if (display[0] === '#') {
      return 'error';
    }
    if (display === 'TRUE' || display === 'FALSE') {
      return 'boolean';
    }
    if (raw && raw[0] !== '=' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw.trim())) {
      return 'numeric';
    }
    if (raw && raw[0] === '=' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(display.trim())) {
      return 'numeric';
    }
    return '';
  }

  function updateFormulaBar() {
    var address = currentCellAddress();
    var raw = getRawAt(selection.focusRow, selection.focusCol);
    nameBox.textContent = address;
    suppressFormulaChange = true;
    formulaInput.value = isEditing ? formulaDraft : raw;
    suppressFormulaChange = false;
  }

  function scrollIntoView() {
    var cell = gridNode.querySelector('[data-row="' + selection.focusRow + '"][data-col="' + selection.focusCol + '"]');
    if (cell) {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function render() {
    var dims = getBounds();
    var rect = getSelectionRect();
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    var col;
    var row;

    corner.className = 'corner';
    corner.textContent = '';
    headRow.appendChild(corner);
    for (col = 0; col < dims.cols; col += 1) {
      var colHeader = document.createElement('th');
      colHeader.textContent = api.indexToColumnLabel(col);
      colHeader.dataset.colHeader = String(col);
      headRow.appendChild(colHeader);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (row = 0; row < dims.rows; row += 1) {
      var bodyRow = document.createElement('tr');
      var rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      rowHeader.dataset.rowHeader = String(row);
      bodyRow.appendChild(rowHeader);

      for (col = 0; col < dims.cols; col += 1) {
        var td = document.createElement('td');
        var cell = document.createElement('div');
        var text = document.createElement('div');
        var display = getDisplayAt(row, col);
        var raw = getRawAt(row, col);
        var inRange = row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;
        var classes = ['cell'];

        if (inRange) {
          classes.push('range');
        }
        if (row === selection.anchorRow && col === selection.anchorCol) {
          classes.push('anchor');
        }
        if (row === selection.focusRow && col === selection.focusCol) {
          classes.push('active');
        }
        var typeClass = classifyValue(display, raw);
        if (typeClass) {
          classes.push(typeClass);
        }

        cell.className = classes.join(' ');
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        text.className = 'cell-text';
        text.textContent = display;
        cell.appendChild(text);
        td.appendChild(cell);
        bodyRow.appendChild(td);
      }
      tbody.appendChild(bodyRow);
    }
    table.appendChild(tbody);

    gridNode.replaceChildren(table);
    updateFormulaBar();
    scrollIntoView();
  }

  function commitEdit(move) {
    setCellAt(selection.focusRow, selection.focusCol, formulaDraft);
    isEditing = false;
    if (move) {
      moveSelection(move.row, move.col, false);
    }
    render();
  }

  function cancelEdit() {
    isEditing = false;
    formulaDraft = '';
    render();
  }

  function beginEdit(seed, replace) {
    var raw = getRawAt(selection.focusRow, selection.focusCol);
    isEditing = true;
    formulaDraft = replace ? seed : (seed == null ? raw : seed);
    updateFormulaBar();
    formulaInput.focus();
    formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
  }

  function moveSelection(rowDelta, colDelta, extend) {
    var dims = getBounds();
    selection.focusRow = clamp(selection.focusRow + rowDelta, 0, dims.rows - 1);
    selection.focusCol = clamp(selection.focusCol + colDelta, 0, dims.cols - 1);
    if (!extend) {
      selection.anchorRow = selection.focusRow;
      selection.anchorCol = selection.focusCol;
    }
    save();
    render();
  }

  function setSelection(row, col, extend) {
    var dims = getBounds();
    selection.focusRow = clamp(row, 0, dims.rows - 1);
    selection.focusCol = clamp(col, 0, dims.cols - 1);
    if (!extend) {
      selection.anchorRow = selection.focusRow;
      selection.anchorCol = selection.focusCol;
    }
    save();
    render();
  }

  function clearSelection() {
    var rect = getSelectionRect();
    var row;
    var col;
    for (row = rect.top; row <= rect.bottom; row += 1) {
      for (col = rect.left; col <= rect.right; col += 1) {
        sheet.setCell(api.formatAddress(row, col), '', { skipHistory: row !== rect.top || col !== rect.left });
      }
    }
    save();
    render();
  }

  function selectionRangeObject() {
    var rect = getSelectionRect();
    return {
      startRow: rect.top,
      startCol: rect.left,
      endRow: rect.bottom,
      endCol: rect.right,
    };
  }

  function selectedRawMatrix() {
    var rect = getSelectionRect();
    var rows = [];
    var row;
    var col;
    for (row = rect.top; row <= rect.bottom; row += 1) {
      var cols = [];
      for (col = rect.left; col <= rect.right; col += 1) {
        cols.push(getRawAt(row, col));
      }
      rows.push(cols);
    }
    return rows;
  }

  function matrixToTsv(matrix) {
    return matrix.map(function (row) {
      return row.join('\t');
    }).join('\n');
  }

  function pasteText(text) {
    var rows = text.replace(/\r/g, '').split('\n');
    var startRow = selection.focusRow;
    var startCol = selection.focusCol;
    var row;
    var col;
    for (row = 0; row < rows.length; row += 1) {
      if (rows[row] === '' && row === rows.length - 1 && rows.length > 1) {
        continue;
      }
      var cols = rows[row].split('\t');
      for (col = 0; col < cols.length; col += 1) {
        sheet.setCell(api.formatAddress(startRow + row, startCol + col), cols[col], { skipHistory: row !== 0 || col !== 0 });
      }
    }
    save();
    render();
  }

  function handleAction(action) {
    switch (action) {
      case 'undo':
        sheet.undo();
        break;
      case 'redo':
        sheet.redo();
        break;
      case 'insert-row-above':
        sheet.insertRow(selection.focusRow);
        selection.focusRow += 1;
        selection.anchorRow = selection.focusRow;
        break;
      case 'delete-row':
        sheet.deleteRow(selection.focusRow);
        selection.focusRow = clamp(selection.focusRow, 0, getBounds().rows - 1);
        selection.anchorRow = selection.focusRow;
        break;
      case 'insert-col-left':
        sheet.insertColumn(selection.focusCol);
        selection.focusCol += 1;
        selection.anchorCol = selection.focusCol;
        break;
      case 'delete-col':
        sheet.deleteColumn(selection.focusCol);
        selection.focusCol = clamp(selection.focusCol, 0, getBounds().cols - 1);
        selection.anchorCol = selection.focusCol;
        break;
    }
    save();
    render();
  }

  gridNode.addEventListener('mousedown', function (event) {
    var cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    event.preventDefault();
    isMouseSelecting = true;
    isEditing = false;
    setSelection(Number(cell.dataset.row), Number(cell.dataset.col), event.shiftKey);
  });

  gridNode.addEventListener('mouseover', function (event) {
    var cell = event.target.closest('.cell');
    if (!isMouseSelecting || !cell) {
      return;
    }
    setSelection(Number(cell.dataset.row), Number(cell.dataset.col), true);
  });

  window.addEventListener('mouseup', function () {
    isMouseSelecting = false;
  });

  gridNode.addEventListener('dblclick', function (event) {
    var cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    setSelection(Number(cell.dataset.row), Number(cell.dataset.col), false);
    beginEdit(null, false);
  });

  formulaInput.addEventListener('input', function () {
    if (suppressFormulaChange) {
      return;
    }
    isEditing = true;
    formulaDraft = formulaInput.value;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ row: 1, col: 0 });
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit({ row: 0, col: event.shiftKey ? -1 : 1 });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.querySelector('.actions').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (button) {
      handleAction(button.dataset.action);
    }
  });

  document.addEventListener('keydown', function (event) {
    var meta = event.metaKey || event.ctrlKey;
    if (document.activeElement === formulaInput) {
      return;
    }
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        sheet.redo();
      } else {
        sheet.undo();
      }
      save();
      render();
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      sheet.redo();
      save();
      render();
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(null, false);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key.length === 1 && !meta && !event.altKey) {
      event.preventDefault();
      beginEdit(event.key, true);
      return;
    }
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        moveSelection(-1, 0, event.shiftKey);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveSelection(1, 0, event.shiftKey);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveSelection(0, -1, event.shiftKey);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveSelection(0, 1, event.shiftKey);
        break;
      case 'Tab':
        event.preventDefault();
        moveSelection(0, event.shiftKey ? -1 : 1, false);
        break;
    }
  });

  document.addEventListener('copy', function (event) {
    sheet.copyRange(selectionRangeObject(), false);
    internalClipboardToken = matrixToTsv(selectedRawMatrix());
    event.clipboardData.setData('text/plain', internalClipboardToken);
    event.preventDefault();
  });

  document.addEventListener('cut', function (event) {
    sheet.copyRange(selectionRangeObject(), true);
    internalClipboardToken = matrixToTsv(selectedRawMatrix());
    event.clipboardData.setData('text/plain', internalClipboardToken);
    event.preventDefault();
  });

  document.addEventListener('paste', function (event) {
    var text = event.clipboardData.getData('text/plain');
    event.preventDefault();
    if (text === internalClipboardToken) {
      sheet.pasteRange(selectionRangeObject());
      save();
      render();
      return;
    }
    pasteText(text);
  });

  load();
  render();
})();
