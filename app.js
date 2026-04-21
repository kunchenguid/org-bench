(function () {
  const Engine = window.SpreadsheetEngine;
  const History = window.SpreadsheetHistory;
  const ROWS = 100;
  const COLS = 26;
  const STORAGE_KEY = getStorageNamespace() + ':sheet-state';

  const state = {
    sheet: Engine.createSheet(ROWS, COLS),
    selection: { row: 0, col: 0 },
    range: null,
    editing: null,
    dragAnchor: null,
    history: History.createHistory(50),
    clipboard: null,
    headerMenu: null,
  };

  const table = document.getElementById('sheetTable');
  const scroller = document.getElementById('gridScroller');
  const formulaInput = document.getElementById('formulaInput');
  const selectionLabel = document.getElementById('selectionLabel');
  const editor = document.getElementById('cellEditor');
  const menu = document.getElementById('headerMenu');

  restoreState();
  renderGrid();
  render();
  bindEvents();

  function getStorageNamespace() {
    return String(
      window.__RUN_STORAGE_NAMESPACE ||
      window.RUN_STORAGE_NAMESPACE ||
      window.STORAGE_NAMESPACE ||
      document.documentElement.getAttribute('data-storage-namespace') ||
      'apple-sheet'
    );
  }

  function cloneSheet(sheet) {
    return { rows: sheet.rows, cols: sheet.cols, cells: Object.assign({}, sheet.cells) };
  }

  function snapshot() {
    return {
      sheet: cloneSheet(state.sheet),
      selection: Object.assign({}, state.selection),
      range: state.range ? Object.assign({}, state.range) : null,
    };
  }

  function restoreSnapshot(entry) {
    state.sheet = cloneSheet(entry.sheet);
    state.selection = Object.assign({}, entry.selection);
    state.range = entry.range ? Object.assign({}, entry.range) : null;
    state.editing = null;
    render();
    persistState();
  }

  function renderGrid() {
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);
    for (let col = 0; col < COLS; col += 1) {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.textContent = Engine.indexToColumn(col);
      th.dataset.col = String(col);
      th.dataset.headerType = 'col';
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < ROWS; row += 1) {
      const tr = document.createElement('tr');
      const header = document.createElement('th');
      header.className = 'row-header';
      header.textContent = String(row + 1);
      header.dataset.row = String(row);
      header.dataset.headerType = 'row';
      tr.appendChild(header);
      for (let col = 0; col < COLS; col += 1) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.tabIndex = -1;
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }

  function bindEvents() {
    table.addEventListener('mousedown', onTableMouseDown);
    table.addEventListener('dblclick', onTableDoubleClick);
    table.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', onStructureToolbarClick);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('beforeunload', persistState);
    document.addEventListener('click', hideMenu);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);

    formulaInput.addEventListener('focus', function () {
      startEdit(true, getRawCell(state.selection.row, state.selection.col));
      formulaInput.select();
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(formulaInput.value, { row: state.selection.row + 1, col: state.selection.col });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(formulaInput.value, { row: state.selection.row, col: state.selection.col + 1 });
      }
    });

    formulaInput.addEventListener('input', function () {
      if (state.editing) {
        state.editing.value = formulaInput.value;
        syncEditor();
      }
    });

    editor.addEventListener('input', function () {
      if (state.editing) {
        state.editing.value = editor.value;
        formulaInput.value = editor.value;
      }
    });

    editor.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commitEdit(editor.value, { row: state.selection.row + 1, col: state.selection.col });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(editor.value, { row: state.selection.row, col: state.selection.col + 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    editor.addEventListener('blur', function () {
      if (state.editing && document.activeElement !== formulaInput) {
        commitEdit(editor.value, state.selection);
      }
    });
  }

  function getRawCell(row, col) {
    return state.sheet.cells[Engine.toCellKey(row, col)] || '';
  }

  function setRawCell(row, col, raw) {
    Engine.setCell(state.sheet, row, col, raw);
  }

  function render() {
    const evaluation = Engine.evaluateSheet(state.sheet);
    const range = getNormalizedRange();
    selectionLabel.textContent = Engine.toCellKey(state.selection.row, state.selection.col);
    formulaInput.value = state.editing ? state.editing.value : getRawCell(state.selection.row, state.selection.col);

    table.querySelectorAll('.cell').forEach(function (cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const key = Engine.toCellKey(row, col);
      const raw = getRawCell(row, col);
      const display = evaluation.display[key] || '';
      cell.textContent = display;
      cell.classList.toggle('active', row === state.selection.row && col === state.selection.col);
      cell.classList.toggle('anchor', row === state.selection.row && col === state.selection.col);
      cell.classList.toggle('numeric', /^[-+]?\d/.test(display));
      cell.classList.toggle('error', display.charAt(0) === '#');
      cell.classList.toggle('in-range', Boolean(range && row >= range.top && row <= range.bottom && col >= range.left && col <= range.right));
      cell.dataset.raw = raw;
    });

    if (state.editing && !state.editing.formulaOnly) {
      positionEditor();
    } else {
      editor.style.display = 'none';
    }
  }

  function getNormalizedRange() {
    if (!state.range) {
      return null;
    }
    return {
      top: Math.min(state.range.startRow, state.range.endRow),
      bottom: Math.max(state.range.startRow, state.range.endRow),
      left: Math.min(state.range.startCol, state.range.endCol),
      right: Math.max(state.range.startCol, state.range.endCol),
    };
  }

  function selectCell(row, col, extend) {
    state.selection = { row: clamp(row, 0, ROWS - 1), col: clamp(col, 0, COLS - 1) };
    if (extend) {
      if (!state.range) {
        state.range = {
          startRow: state.selection.row,
          startCol: state.selection.col,
          endRow: state.selection.row,
          endCol: state.selection.col,
        };
      }
      state.range.endRow = state.selection.row;
      state.range.endCol = state.selection.col;
    } else {
      state.range = null;
    }
    render();
    ensureActiveCellVisible();
    persistState();
  }

  function onTableMouseDown(event) {
    hideMenu();
    const header = event.target.closest('[data-header-type]');
    if (header) {
      const row = header.dataset.row ? Number(header.dataset.row) : 0;
      const col = header.dataset.col ? Number(header.dataset.col) : 0;
      if (header.dataset.headerType === 'row') {
        state.selection = { row: row, col: 0 };
        state.range = { startRow: row, endRow: row, startCol: 0, endCol: COLS - 1 };
      } else {
        state.selection = { row: 0, col: col };
        state.range = { startRow: 0, endRow: ROWS - 1, startCol: col, endCol: col };
      }
      render();
      return;
    }
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (event.shiftKey) {
      if (!state.range) {
        state.range = { startRow: state.selection.row, startCol: state.selection.col, endRow: row, endCol: col };
      } else {
        state.range.endRow = row;
        state.range.endCol = col;
      }
      state.selection = { row: row, col: col };
    } else {
      state.selection = { row: row, col: col };
      state.range = { startRow: row, startCol: col, endRow: row, endCol: col };
      state.dragAnchor = { row: row, col: col };
    }
    cancelInlineEditOnly();
    render();
    persistState();
  }

  function onWindowMouseMove(event) {
    if (!state.dragAnchor) {
      return;
    }
    const cell = event.target.closest ? event.target.closest('.cell') : null;
    if (!cell) {
      return;
    }
    state.selection = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    state.range = {
      startRow: state.dragAnchor.row,
      startCol: state.dragAnchor.col,
      endRow: state.selection.row,
      endCol: state.selection.col,
    };
    render();
  }

  function onWindowMouseUp() {
    state.dragAnchor = null;
  }

  function onTableDoubleClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    startEdit(false, getRawCell(Number(cell.dataset.row), Number(cell.dataset.col)));
  }

  function onWindowKeyDown(event) {
    if (menu.contains(event.target)) {
      return;
    }
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (document.activeElement === formulaInput || document.activeElement === editor) {
      return;
    }
    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      startEdit(false, getRawCell(state.selection.row, state.selection.col));
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key === 'Escape') {
      state.range = null;
      render();
      return;
    }
    const nav = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
      Tab: { row: 0, col: event.shiftKey ? -1 : 1 },
    }[event.key];
    if (nav) {
      event.preventDefault();
      moveSelection(nav.row, nav.col, event.shiftKey);
      return;
    }
    if (!meta && event.key.length === 1) {
      event.preventDefault();
      startEdit(false, event.key, true);
    }
  }

  function moveSelection(rowDelta, colDelta, extend) {
    const nextRow = clamp(state.selection.row + rowDelta, 0, ROWS - 1);
    const nextCol = clamp(state.selection.col + colDelta, 0, COLS - 1);
    if (extend) {
      if (!state.range) {
        state.range = {
          startRow: state.selection.row,
          startCol: state.selection.col,
          endRow: nextRow,
          endCol: nextCol,
        };
      } else {
        state.range.endRow = nextRow;
        state.range.endCol = nextCol;
      }
    } else {
      state.range = null;
    }
    state.selection = { row: nextRow, col: nextCol };
    render();
    ensureActiveCellVisible();
    persistState();
  }

  function startEdit(formulaOnly, value, replace) {
    state.editing = {
      formulaOnly: Boolean(formulaOnly),
      value: value == null ? '' : String(value),
      initial: getRawCell(state.selection.row, state.selection.col),
    };
    if (replace) {
      state.editing.value = value;
    }
    formulaInput.value = state.editing.value;
    if (formulaOnly) {
      editor.style.display = 'none';
      return;
    }
    positionEditor();
    editor.value = state.editing.value;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  function syncEditor() {
    if (state.editing && !state.editing.formulaOnly) {
      editor.value = state.editing.value;
    }
  }

  function positionEditor() {
    const active = getCellElement(state.selection.row, state.selection.col);
    if (!active) {
      return;
    }
    const cellRect = active.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    editor.style.display = 'block';
    editor.style.top = String(cellRect.top - scrollerRect.top + scroller.scrollTop - 1) + 'px';
    editor.style.left = String(cellRect.left - scrollerRect.left + scroller.scrollLeft - 1) + 'px';
    editor.style.width = String(cellRect.width + 2) + 'px';
    editor.style.height = String(cellRect.height + 2) + 'px';
  }

  function cancelInlineEditOnly() {
    state.editing = null;
    editor.style.display = 'none';
    formulaInput.value = getRawCell(state.selection.row, state.selection.col);
  }

  function cancelEdit() {
    state.editing = null;
    editor.style.display = 'none';
    formulaInput.value = getRawCell(state.selection.row, state.selection.col);
    render();
  }

  function commitEdit(value, nextSelection) {
    runAction('commit', function () {
      setRawCell(state.selection.row, state.selection.col, value);
      state.editing = null;
      editor.style.display = 'none';
      state.range = null;
      state.selection = {
        row: clamp(nextSelection.row, 0, ROWS - 1),
        col: clamp(nextSelection.col, 0, COLS - 1),
      };
    });
    render();
    ensureActiveCellVisible();
    persistState();
  }

  function clearSelection() {
    const range = getNormalizedRange() || {
      top: state.selection.row,
      bottom: state.selection.row,
      left: state.selection.col,
      right: state.selection.col,
    };
    runAction('clear', function () {
      for (let row = range.top; row <= range.bottom; row += 1) {
        for (let col = range.left; col <= range.right; col += 1) {
          setRawCell(row, col, '');
        }
      }
      state.range = null;
    });
    render();
    persistState();
  }

  function getSelectionBlock() {
    const range = getNormalizedRange() || {
      top: state.selection.row,
      bottom: state.selection.row,
      left: state.selection.col,
      right: state.selection.col,
    };
    const rows = [];
    for (let row = range.top; row <= range.bottom; row += 1) {
      const cols = [];
      for (let col = range.left; col <= range.right; col += 1) {
        cols.push(getRawCell(row, col));
      }
      rows.push(cols);
    }
    return { range: range, rows: rows };
  }

  function onCopy(event) {
    const block = getSelectionBlock();
    const text = block.rows.map(function (row) { return row.join('\t'); }).join('\n');
    state.clipboard = { block: block, cut: false, text: text };
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  }

  function onCut(event) {
    const block = getSelectionBlock();
    const text = block.rows.map(function (row) { return row.join('\t'); }).join('\n');
    state.clipboard = { block: block, cut: true, text: text };
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  }

  function onPaste(event) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    const block = text.split(/\r?\n/).map(function (line) { return line.split('\t'); });
    const sourceBlock = state.clipboard && state.clipboard.text === text ? state.clipboard.block : null;
    applyPastedBlock(block, sourceBlock);
    event.preventDefault();
  }

  function applyPastedBlock(rows, sourceBlock) {
    const actionLabel = state.clipboard && state.clipboard.cut && sourceBlock ? 'cut' : 'paste';
    runAction(actionLabel, function () {
      const target = getNormalizedRange();
      const targetRows = rows.length;
      const targetCols = rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
      const fillMatchingRange = target && target.bottom - target.top + 1 === targetRows && target.right - target.left + 1 === targetCols;
      const startRow = fillMatchingRange ? target.top : state.selection.row;
      const startCol = fillMatchingRange ? target.left : state.selection.col;

      for (let r = 0; r < targetRows; r += 1) {
        for (let c = 0; c < targetCols; c += 1) {
          let value = rows[r][c] || '';
          if (sourceBlock) {
            const sourceRow = sourceBlock.range.top + Math.min(r, sourceBlock.range.bottom - sourceBlock.range.top);
            const sourceCol = sourceBlock.range.left + Math.min(c, sourceBlock.range.right - sourceBlock.range.left);
            value = value.charAt(0) === '=' ? Engine.copyFormula(value, { row: sourceRow, col: sourceCol }, { row: startRow + r, col: startCol + c }) : value;
          }
          setRawCell(startRow + r, startCol + c, value);
        }
      }

      if (state.clipboard && state.clipboard.cut && sourceBlock) {
        for (let row = sourceBlock.range.top; row <= sourceBlock.range.bottom; row += 1) {
          for (let col = sourceBlock.range.left; col <= sourceBlock.range.right; col += 1) {
            if (row < startRow || row >= startRow + targetRows || col < startCol || col >= startCol + targetCols) {
              setRawCell(row, col, '');
            }
          }
        }
      }

      state.selection = { row: clamp(startRow, 0, ROWS - 1), col: clamp(startCol, 0, COLS - 1) };
      state.range = {
        startRow: startRow,
        endRow: clamp(startRow + targetRows - 1, 0, ROWS - 1),
        startCol: startCol,
        endCol: clamp(startCol + targetCols - 1, 0, COLS - 1),
      };
    });
    state.clipboard = null;
    render();
    persistState();
  }

  function undo() {
    const entry = History.undoAction(state.history);
    if (!entry) {
      return;
    }
    restoreSnapshot(entry.state);
  }

  function redo() {
    const entry = History.redoAction(state.history);
    if (!entry) {
      return;
    }
    restoreSnapshot(entry.state);
  }

  function onContextMenu(event) {
    const header = event.target.closest('[data-header-type]');
    if (!header) {
      hideMenu();
      return;
    }
    event.preventDefault();
    state.headerMenu = {
      type: header.dataset.headerType,
      index: Number(header.dataset.headerType === 'row' ? header.dataset.row : header.dataset.col),
    };
    menu.innerHTML = '';
    getMenuActions(state.headerMenu).forEach(function (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', function () {
        action.run();
        hideMenu();
      });
      menu.appendChild(button);
    });
    menu.style.left = String(event.clientX) + 'px';
    menu.style.top = String(event.clientY) + 'px';
    menu.classList.remove('hidden');
  }

  function onStructureToolbarClick(event) {
    const button = event.target.closest('[data-structure-action]');
    if (!button) {
      return;
    }
    if (state.editing) {
      commitEdit(state.editing.value, state.selection);
    }
    switch (button.dataset.structureAction) {
      case 'insert-row-above':
        insertRow(state.selection.row);
        break;
      case 'insert-row-below':
        insertRow(state.selection.row + 1);
        break;
      case 'delete-row':
        deleteRow(state.selection.row);
        break;
      case 'insert-col-left':
        insertCol(state.selection.col);
        break;
      case 'insert-col-right':
        insertCol(state.selection.col + 1);
        break;
      case 'delete-col':
        deleteCol(state.selection.col);
        break;
      default:
        break;
    }
  }

  function getMenuActions(menuState) {
    if (menuState.type === 'row') {
      return [
        { label: 'Insert Row Above', run: function () { insertRow(menuState.index); } },
        { label: 'Insert Row Below', run: function () { insertRow(menuState.index + 1); } },
        { label: 'Delete Row', run: function () { deleteRow(menuState.index); } },
      ];
    }
    return [
      { label: 'Insert Column Left', run: function () { insertCol(menuState.index); } },
      { label: 'Insert Column Right', run: function () { insertCol(menuState.index + 1); } },
      { label: 'Delete Column', run: function () { deleteCol(menuState.index); } },
    ];
  }

  function hideMenu() {
    menu.classList.add('hidden');
  }

  function rewriteAllFormulas(change) {
    Object.keys(state.sheet.cells).forEach(function (key) {
      const raw = state.sheet.cells[key];
      if (raw && raw.charAt(0) === '=') {
        state.sheet.cells[key] = Engine.applyStructuralChange(raw, change);
      }
    });
  }

  function insertRow(index) {
    runAction('insert-row', function () {
      const nextCells = {};
      Object.keys(state.sheet.cells).forEach(function (key) {
        const ref = Engine.parseRef(key);
        const row = ref.row >= index ? ref.row + 1 : ref.row;
        nextCells[Engine.toCellKey(row, ref.col)] = state.sheet.cells[key];
      });
      state.sheet.cells = nextCells;
      rewriteAllFormulas({ type: 'insert-row', index: index, count: 1 });
      if (state.selection.row >= index) {
        state.selection.row += 1;
      }
    });
    render();
    persistState();
  }

  function deleteRow(index) {
    runAction('delete-row', function () {
      const nextCells = {};
      Object.keys(state.sheet.cells).forEach(function (key) {
        const ref = Engine.parseRef(key);
        if (ref.row === index) {
          return;
        }
        const row = ref.row > index ? ref.row - 1 : ref.row;
        nextCells[Engine.toCellKey(row, ref.col)] = state.sheet.cells[key];
      });
      state.sheet.cells = nextCells;
      rewriteAllFormulas({ type: 'delete-row', index: index, count: 1 });
      state.selection.row = clamp(state.selection.row > index ? state.selection.row - 1 : state.selection.row, 0, ROWS - 1);
    });
    render();
    persistState();
  }

  function insertCol(index) {
    runAction('insert-col', function () {
      const nextCells = {};
      Object.keys(state.sheet.cells).forEach(function (key) {
        const ref = Engine.parseRef(key);
        const col = ref.col >= index ? ref.col + 1 : ref.col;
        nextCells[Engine.toCellKey(ref.row, col)] = state.sheet.cells[key];
      });
      state.sheet.cells = nextCells;
      rewriteAllFormulas({ type: 'insert-col', index: index, count: 1 });
      if (state.selection.col >= index) {
        state.selection.col += 1;
      }
    });
    render();
    persistState();
  }

  function deleteCol(index) {
    runAction('delete-col', function () {
      const nextCells = {};
      Object.keys(state.sheet.cells).forEach(function (key) {
        const ref = Engine.parseRef(key);
        if (ref.col === index) {
          return;
        }
        const col = ref.col > index ? ref.col - 1 : ref.col;
        nextCells[Engine.toCellKey(ref.row, col)] = state.sheet.cells[key];
      });
      state.sheet.cells = nextCells;
      rewriteAllFormulas({ type: 'delete-col', index: index, count: 1 });
      state.selection.col = clamp(state.selection.col > index ? state.selection.col - 1 : state.selection.col, 0, COLS - 1);
    });
    render();
    persistState();
  }

  function runAction(label, fn) {
    const before = snapshot();
    fn();
    const after = snapshot();
    History.recordAction(state.history, before, after, label);
  }

  function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sheet: state.sheet,
      selection: state.selection,
      range: state.range,
    }));
  }

  function restoreState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      state.sheet = parsed.sheet || state.sheet;
      state.selection = parsed.selection || state.selection;
      state.range = parsed.range || state.range;
    } catch (_error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function ensureActiveCellVisible() {
    const cell = getCellElement(state.selection.row, state.selection.col);
    if (!cell) {
      return;
    }
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function getCellElement(row, col) {
    return table.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
