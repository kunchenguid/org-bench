(function () {
  'use strict';

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const PRINTABLE_KEY = /^.$/;

  function columnName(index) {
    let value = index + 1;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function cellName(row, col) {
    return columnName(col) + String(row + 1);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isNumberLike(value) {
    return value.trim() !== '' && Number.isFinite(Number(value));
  }

  function createMemorySheet() {
    const cells = Object.create(null);
    return {
      getRaw(name) {
        return cells[name] || '';
      },
      setRaw(name, value) {
        if (value) {
          cells[name] = value;
        } else {
          delete cells[name];
        }
      },
      getDisplay(name) {
        return cells[name] || '';
      }
    };
  }

  function resolveSheet(options) {
    if (options && options.sheet) {
      return options.sheet;
    }
    if (window.OracleSpreadsheetModel && typeof window.OracleSpreadsheetModel.createSheet === 'function') {
      return window.OracleSpreadsheetModel.createSheet(options || {});
    }
    return createMemorySheet();
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function createApp(root, options) {
    const config = options || {};
    const rowCount = config.rows || DEFAULT_ROWS;
    const colCount = config.cols || DEFAULT_COLS;
    const sheet = resolveSheet(config);
    const state = {
      selected: { row: 0, col: 0 },
      anchor: { row: 0, col: 0 },
      rangeEnd: { row: 0, col: 0 },
      editing: null,
      dragSelecting: false
    };
    const cellElements = new Map();
    const columnHeaders = [];
    const rowHeaders = [];

    root.textContent = '';
    const app = createElement('section', 'spreadsheet-app');
    app.setAttribute('aria-label', 'Spreadsheet');

    const toolbar = createElement('header', 'toolbar');
    const cellNameBox = createElement('div', 'cell-name', 'A1');
    cellNameBox.setAttribute('aria-live', 'polite');

    const formulaWrap = createElement('div', 'formula-wrap');
    const formulaLabel = createElement('label', '', 'fx');
    formulaLabel.setAttribute('for', 'formula-input');
    const formulaInput = createElement('input', 'formula-input');
    formulaInput.id = 'formula-input';
    formulaInput.setAttribute('aria-label', 'Formula bar raw cell contents');
    formulaInput.setAttribute('autocomplete', 'off');
    formulaInput.setAttribute('spellcheck', 'false');
    formulaWrap.append(formulaLabel, formulaInput);

    const hint = createElement('div', 'hint', 'Enter edits/commits. Shift+arrows extends selection. Delete clears selection.');
    toolbar.append(cellNameBox, formulaWrap, hint);

    const gridShell = createElement('div', 'grid-shell');
    const grid = createElement('div', 'sheet-grid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-rowcount', String(rowCount));
    grid.setAttribute('aria-colcount', String(colCount));
    grid.tabIndex = -1;

    const corner = createElement('div', 'corner', '');
    grid.appendChild(corner);

    for (let col = 0; col < colCount; col += 1) {
      const colLabel = columnName(col);
      const header = createElement('div', 'column-header');
      const label = createElement('span', 'header-label', colLabel);
      const menu = createElement('button', 'header-menu', '⋯');
      header.setAttribute('role', 'columnheader');
      header.dataset.col = String(col);
      menu.type = 'button';
      menu.dataset.command = 'column-menu';
      menu.dataset.col = String(col);
      menu.setAttribute('aria-label', 'Column ' + colLabel + ' options: insert left, insert right, delete column');
      header.append(label, menu);
      columnHeaders.push(header);
      grid.appendChild(header);
    }

    for (let row = 0; row < rowCount; row += 1) {
      const rowNumber = String(row + 1);
      const rowHeader = createElement('div', 'row-header');
      const label = createElement('span', 'header-label', rowNumber);
      const menu = createElement('button', 'header-menu', '⋯');
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.dataset.row = String(row);
      menu.type = 'button';
      menu.dataset.command = 'row-menu';
      menu.dataset.row = String(row);
      menu.setAttribute('aria-label', 'Row ' + rowNumber + ' options: insert above, insert below, delete row');
      rowHeader.append(label, menu);
      rowHeaders.push(rowHeader);
      grid.appendChild(rowHeader);

      for (let col = 0; col < colCount; col += 1) {
        const name = cellName(row, col);
        const cell = createElement('div', 'cell');
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-selected', 'false');
        cell.setAttribute('aria-label', name + ' blank');
        cell.tabIndex = -1;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.cell = name;
        cellElements.set(name, cell);
        grid.appendChild(cell);
      }
    }

    gridShell.appendChild(grid);
    app.append(toolbar, gridShell);
    root.appendChild(app);

    function rangeBounds() {
      return {
        top: Math.min(state.anchor.row, state.rangeEnd.row),
        bottom: Math.max(state.anchor.row, state.rangeEnd.row),
        left: Math.min(state.anchor.col, state.rangeEnd.col),
        right: Math.max(state.anchor.col, state.rangeEnd.col)
      };
    }

    function getCell(row, col) {
      return cellElements.get(cellName(row, col));
    }

    function renderCell(row, col) {
      const name = cellName(row, col);
      const cell = getCell(row, col);
      const raw = sheet.getRaw(name);
      const display = sheet.getDisplay(name);
      cell.textContent = display;
      cell.classList.toggle('numeric', isNumberLike(display));
      cell.classList.toggle('error', display.charAt(0) === '#');
      cell.setAttribute('aria-label', name + (raw ? ' ' + raw : ' blank'));
    }

    function renderSelection(focusCell) {
      const bounds = rangeBounds();
      for (let row = 0; row < rowCount; row += 1) {
        rowHeaders[row].classList.toggle('header-active', row === state.selected.row);
        for (let col = 0; col < colCount; col += 1) {
          if (row === 0) {
            columnHeaders[col].classList.toggle('header-active', col === state.selected.col);
          }
          const cell = getCell(row, col);
          const inRange = row >= bounds.top && row <= bounds.bottom && col >= bounds.left && col <= bounds.right;
          const active = row === state.selected.row && col === state.selected.col;
          cell.classList.toggle('in-range', inRange);
          cell.classList.toggle('active', active);
          cell.setAttribute('aria-selected', active ? 'true' : 'false');
          cell.tabIndex = active ? 0 : -1;
        }
      }

      const selectedName = cellName(state.selected.row, state.selected.col);
      cellNameBox.textContent = selectedName;
      formulaInput.value = sheet.getRaw(selectedName);
      if (focusCell) {
        getCell(state.selected.row, state.selected.col).focus({ preventScroll: false });
      }
    }

    function renderAll() {
      for (let row = 0; row < rowCount; row += 1) {
        for (let col = 0; col < colCount; col += 1) {
          renderCell(row, col);
        }
      }
      renderSelection(false);
    }

    function setSelection(row, col, extend, focusCell) {
      const next = {
        row: clamp(row, 0, rowCount - 1),
        col: clamp(col, 0, colCount - 1)
      };
      state.selected = next;
      state.rangeEnd = next;
      if (!extend) {
        state.anchor = next;
      }
      renderSelection(focusCell !== false);
    }

    function moveSelection(rowDelta, colDelta, extend) {
      setSelection(state.selected.row + rowDelta, state.selected.col + colDelta, extend, true);
    }

    function commitCell(row, col, value) {
      const name = cellName(row, col);
      sheet.setRaw(name, value);
      renderCell(row, col);
    }

    function stopEditing(commit, move) {
      if (!state.editing) {
        return;
      }
      const editing = state.editing;
      const value = editing.input.value;
      editing.input.remove();
      state.editing = null;
      if (commit) {
        commitCell(editing.row, editing.col, value);
      }
      if (move === 'down') {
        setSelection(editing.row + 1, editing.col, false, true);
      } else if (move === 'right') {
        setSelection(editing.row, editing.col + 1, false, true);
      } else {
        setSelection(editing.row, editing.col, false, true);
      }
    }

    function beginEditing(row, col, mode, seed) {
      if (state.editing) {
        stopEditing(true);
      }
      setSelection(row, col, false, false);
      const cell = getCell(row, col);
      const name = cellName(row, col);
      const input = createElement('input', 'cell-editor');
      input.setAttribute('aria-label', 'Editing ' + name);
      input.value = mode === 'replace' ? seed : sheet.getRaw(name);
      cell.appendChild(input);
      state.editing = { row, col, input };
      input.focus();
      input.select();
    }

    function clearRange() {
      const bounds = rangeBounds();
      for (let row = bounds.top; row <= bounds.bottom; row += 1) {
        for (let col = bounds.left; col <= bounds.right; col += 1) {
          commitCell(row, col, '');
        }
      }
      renderSelection(true);
    }

    function handleCellKeydown(event, cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        beginEditing(row, col, 'preserve');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1, 0, event.shiftKey);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1, 0, event.shiftKey);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(0, 1, event.shiftKey);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelection(0, -1, event.shiftKey);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        moveSelection(0, event.shiftKey ? -1 : 1, false);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        clearRange();
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && PRINTABLE_KEY.test(event.key)) {
        event.preventDefault();
        beginEditing(row, col, 'replace', event.key);
      }
    }

    function handleEditorKeydown(event) {
      if (!state.editing) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        stopEditing(true, 'down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        stopEditing(true, 'right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        stopEditing(false);
      }
    }

    grid.addEventListener('mousedown', function (event) {
      const cell = event.target.closest('[role="gridcell"]');
      if (!cell || state.editing) {
        return;
      }
      event.preventDefault();
      state.dragSelecting = true;
      setSelection(Number(cell.dataset.row), Number(cell.dataset.col), event.shiftKey, true);
    });

    grid.addEventListener('mouseover', function (event) {
      if (!state.dragSelecting) {
        return;
      }
      const cell = event.target.closest('[role="gridcell"]');
      if (cell) {
        setSelection(Number(cell.dataset.row), Number(cell.dataset.col), true, false);
      }
    });

    document.addEventListener('mouseup', function () {
      state.dragSelecting = false;
    });

    grid.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('[role="gridcell"]');
      if (cell) {
        beginEditing(Number(cell.dataset.row), Number(cell.dataset.col), 'preserve');
      }
    });

    grid.addEventListener('keydown', function (event) {
      if (event.target.classList.contains('cell-editor')) {
        handleEditorKeydown(event);
        return;
      }
      const cell = event.target.closest('[role="gridcell"]');
      if (cell) {
        handleCellKeydown(event, cell);
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitCell(state.selected.row, state.selected.col, formulaInput.value);
        renderSelection(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        formulaInput.value = sheet.getRaw(cellName(state.selected.row, state.selected.col));
        getCell(state.selected.row, state.selected.col).focus();
      }
    });

    formulaInput.addEventListener('input', function () {
      const name = cellName(state.selected.row, state.selected.col);
      cellNameBox.textContent = name;
    });

    renderAll();
    getCell(0, 0).focus();

    return {
      destroy() {
        root.textContent = '';
      },
      getSelection() {
        return cellName(state.selected.row, state.selected.col);
      }
    };
  }

  window.OracleSpreadsheet = {
    createApp,
    columnName,
    cellName
  };
}());
