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

  function pointFromCellName(name) {
    const parsed = window.SpreadsheetCore.parseAddress(name);
    return { row: parsed.row - 1, col: parsed.col - 1 };
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

  function createCoreSheetAdapter(options) {
    const coreApi = window.SpreadsheetCore;
    const actionsApi = window.SpreadsheetActions;
    const core = new coreApi.SpreadsheetCore({ rows: options.rows, cols: options.cols });
    const sheet = {
      rows: core.rows,
      cols: core.cols,
      active: { row: 0, col: 0 },
      getCell(row, col) {
        return core.getRawCell(cellName(row, col));
      },
      setCell(row, col, value) {
        core.setCell(cellName(row, col), value);
      },
      clearCell(row, col) {
        core.setCell(cellName(row, col), '');
      },
      snapshot() {
        const snapshot = {};
        core.cells.forEach(function (raw, address) {
          const point = pointFromCellName(address);
          snapshot[point.row + ',' + point.col] = raw;
        });
        return snapshot;
      },
      load(snapshot) {
        core.cells.clear();
        this.resize(snapshot.rows || this.rows, snapshot.cols || this.cols);
        Object.keys(snapshot.cells || {}).forEach(function (key) {
          const parts = key.split(',').map(Number);
          core.setCell(cellName(parts[0], parts[1]), snapshot.cells[key]);
        });
        this.active = snapshot.active || { row: 0, col: 0 };
      },
      resize(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        core.rows = rows;
        core.cols = cols;
      },
      setActive(row, col) {
        this.active = { row, col };
      }
    };

    const actions = actionsApi.createSpreadsheetActions({
      sheet,
      namespace: options.namespace || options.storageKey,
      storage: options.storage,
      shiftFormulaReferences(formula, source, destination) {
        return coreApi.adjustFormulaForMove(formula, cellName(source.row, source.col), cellName(destination.row, destination.col));
      },
      transformFormulaForStructureChange(formula, change) {
        const index = change.index + 1;
        if (change.type === 'insert-row') return coreApi.adjustFormulaForRowInsert(formula, index, change.count);
        if (change.type === 'delete-row') return coreApi.adjustFormulaForRowDelete(formula, index, change.count);
        if (change.type === 'insert-col') return coreApi.adjustFormulaForColumnInsert(formula, index, change.count);
        if (change.type === 'delete-col') return coreApi.adjustFormulaForColumnDelete(formula, index, change.count);
        return formula;
      }
    });

    const adapter = {
      actions,
      getRaw(name) {
        return core.getRawCell(name);
      },
      setRaw(name, value) {
        const point = pointFromCellName(name);
        actions.setCell(point.row, point.col, value);
        actions.save();
      },
      getDisplay(name) {
        return core.getDisplayValue(name);
      },
      getActive() {
        return sheet.active || { row: 0, col: 0 };
      },
      setActive(row, col) {
        sheet.setActive(row, col);
        actions.save();
      },
      getRangeValues(range) {
        return actions.serializeRange(range);
      },
      clearRange(range) {
        actions.clearRange(range);
        actions.save();
      },
      copy(range, event) {
        return actions.copy(range, event);
      },
      cut(range, event) {
        const result = actions.cut(range, event);
        actions.save();
        return result;
      },
      paste(range, eventOrText) {
        const didPaste = actions.paste(range, eventOrText);
        if (didPaste) actions.save();
        return didPaste;
      },
      undo() {
        const changed = actions.undo();
        if (changed) actions.save();
        return changed;
      },
      redo() {
        const changed = actions.redo();
        if (changed) actions.save();
        return changed;
      },
      insertRows(index, count) {
        actions.insertRows(index, count);
        actions.save();
      },
      deleteRows(index, count) {
        actions.deleteRows(index, count);
        actions.save();
      },
      insertColumns(index, count) {
        actions.insertColumns(index, count);
        actions.save();
      },
      deleteColumns(index, count) {
        actions.deleteColumns(index, count);
        actions.save();
      },
      load() {
        return actions.load();
      }
    };
    adapter.load();
    return adapter;
  }

  function resolveSheet(options) {
    if (options && options.sheet) {
      return options.sheet;
    }
    if (window.SpreadsheetCore && window.SpreadsheetActions) {
      return createCoreSheetAdapter(options || {});
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
    const hasActions = Boolean(sheet.actions);
    const state = {
      selected: { row: 0, col: 0 },
      anchor: { row: 0, col: 0 },
      rangeEnd: { row: 0, col: 0 },
      editing: null,
      dragSelecting: false
    };
    const savedActive = sheet.getActive ? sheet.getActive() : null;
    if (savedActive) {
      state.selected = { row: clamp(savedActive.row, 0, rowCount - 1), col: clamp(savedActive.col, 0, colCount - 1) };
      state.anchor = state.selected;
      state.rangeEnd = state.selected;
    }
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

    const hint = createElement('div', 'hint', 'Enter edits/commits. Shift+arrows extends selection. Delete clears selection. Tab moves to formula bar. Alt+Shift+C/R opens column or row actions.');
    toolbar.append(cellNameBox, formulaWrap, hint);

    const headerActionMenu = createElement('div', 'header-action-menu');
    headerActionMenu.hidden = true;
    headerActionMenu.setAttribute('role', 'menu');
    headerActionMenu.setAttribute('aria-label', 'Header actions');

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
    app.append(toolbar, headerActionMenu, gridShell);
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
      if (!extend && sheet.setActive) {
        sheet.setActive(next.row, next.col);
      }
      renderSelection(focusCell !== false);
    }

    function moveSelection(rowDelta, colDelta, extend) {
      setSelection(state.selected.row + rowDelta, state.selected.col + colDelta, extend, true);
    }

    function commitCell(row, col, value) {
      const name = cellName(row, col);
      sheet.setRaw(name, value);
      renderAll();
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
      if (hasActions && sheet.clearRange) {
        sheet.clearRange({ startRow: bounds.top, startCol: bounds.left, endRow: bounds.bottom, endCol: bounds.right });
      } else {
        for (let row = bounds.top; row <= bounds.bottom; row += 1) {
          for (let col = bounds.left; col <= bounds.right; col += 1) {
            commitCell(row, col, '');
          }
        }
      }
      renderAll();
      renderSelection(true);
    }

    function selectedRange() {
      const bounds = rangeBounds();
      return { startRow: bounds.top, startCol: bounds.left, endRow: bounds.bottom, endCol: bounds.right };
    }

    function refreshAfterAction() {
      renderAll();
      renderSelection(true);
    }

    function maybeHandleCommandKey(event) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return false;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) sheet.redo && sheet.redo();
        else sheet.undo && sheet.undo();
        refreshAfterAction();
        return true;
      }
      if (key === 'y') {
        event.preventDefault();
        sheet.redo && sheet.redo();
        refreshAfterAction();
        return true;
      }
      if (key === 'c') {
        sheet.copy && sheet.copy(selectedRange(), event);
        return Boolean(sheet.copy);
      }
      if (key === 'x') {
        if (sheet.cut) {
          sheet.cut(selectedRange(), event);
          refreshAfterAction();
          return true;
        }
      }
      if (key === 'v') {
        if (sheet.paste) {
          sheet.paste(selectedRange(), event);
          refreshAfterAction();
          return true;
        }
      }
      return false;
    }

    function executeHeaderAction(action, isRow, index) {
      if (action === 'insert-row-before') {
        sheet.insertRows && sheet.insertRows(index, 1);
        setSelection(index, state.selected.col, false, false);
      } else if (action === 'insert-row-after') {
        sheet.insertRows && sheet.insertRows(index + 1, 1);
        setSelection(index + 1, state.selected.col, false, false);
      } else if (action === 'delete-row') {
        sheet.deleteRows && sheet.deleteRows(index, 1);
        setSelection(Math.min(index, rowCount - 1), state.selected.col, false, false);
      } else if (action === 'insert-column-before') {
        sheet.insertColumns && sheet.insertColumns(index, 1);
        setSelection(state.selected.row, index, false, false);
      } else if (action === 'insert-column-after') {
        sheet.insertColumns && sheet.insertColumns(index + 1, 1);
        setSelection(state.selected.row, index + 1, false, false);
      } else if (action === 'delete-column') {
        sheet.deleteColumns && sheet.deleteColumns(index, 1);
        setSelection(state.selected.row, Math.min(index, colCount - 1), false, false);
      }
      refreshAfterAction();
    }

    function addHeaderMenuItem(label, action, isRow, index) {
      const item = createElement('button', 'header-action-item', label);
      item.type = 'button';
      item.dataset.menuAction = action;
      item.setAttribute('role', 'menuitem');
      item.addEventListener('click', function (event) {
        event.preventDefault();
        headerActionMenu.hidden = true;
        executeHeaderAction(action, isRow, index);
      });
      headerActionMenu.appendChild(item);
    }

    function showHeaderMenu(button) {
      const isRow = button.dataset.command === 'row-menu';
      const index = Number(isRow ? button.dataset.row : button.dataset.col);
      headerActionMenu.textContent = '';
      if (isRow) {
        addHeaderMenuItem('Insert row above', 'insert-row-before', true, index);
        addHeaderMenuItem('Insert row below', 'insert-row-after', true, index);
        addHeaderMenuItem('Delete row', 'delete-row', true, index);
      } else {
        addHeaderMenuItem('Insert column left', 'insert-column-before', false, index);
        addHeaderMenuItem('Insert column right', 'insert-column-after', false, index);
        addHeaderMenuItem('Delete column', 'delete-column', false, index);
      }
      headerActionMenu.hidden = false;
      const firstItem = headerActionMenu.querySelector('button');
      if (firstItem) firstItem.focus();
    }

    function hideHeaderMenu(focusCell) {
      headerActionMenu.hidden = true;
      headerActionMenu.textContent = '';
      if (focusCell) getCell(state.selected.row, state.selected.col).focus();
    }

    function openSelectedHeaderMenu(isRow) {
      const header = isRow ? rowHeaders[state.selected.row] : columnHeaders[state.selected.col];
      const button = header && header.querySelector('.header-menu');
      if (button) showHeaderMenu(button);
    }

    function handleCellKeydown(event, cell) {
      if (maybeHandleCommandKey(event)) {
        return;
      }
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (event.altKey && event.shiftKey && (event.key === 'C' || event.key === 'c')) {
        event.preventDefault();
        openSelectedHeaderMenu(false);
      } else if (event.altKey && event.shiftKey && (event.key === 'R' || event.key === 'r')) {
        event.preventDefault();
        openSelectedHeaderMenu(true);
      } else if (event.key === 'Enter' || event.key === 'F2') {
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
        formulaInput.focus();
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
      const headerButton = event.target.closest('.header-menu');
      if (headerButton) {
        return;
      }
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
      if (maybeHandleCommandKey(event)) {
        return;
      }
      if (event.target.classList.contains('cell-editor')) {
        handleEditorKeydown(event);
        return;
      }
      const cell = event.target.closest('[role="gridcell"]');
      if (cell) {
        handleCellKeydown(event, cell);
      }
    });

    grid.addEventListener('click', function (event) {
      const headerButton = event.target.closest('.header-menu');
      if (!headerButton) {
        return;
      }
      event.preventDefault();
      showHeaderMenu(headerButton);
    });

    headerActionMenu.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        hideHeaderMenu(true);
      }
    });

    grid.addEventListener('copy', function (event) {
      if (sheet.copy) sheet.copy(selectedRange(), event);
    });

    grid.addEventListener('cut', function (event) {
      if (sheet.cut) {
        sheet.cut(selectedRange(), event);
        refreshAfterAction();
      }
    });

    grid.addEventListener('paste', function (event) {
      if (sheet.paste) {
        sheet.paste(selectedRange(), event);
        refreshAfterAction();
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (maybeHandleCommandKey(event)) {
        return;
      }
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
