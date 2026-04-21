(function () {
  const a11y = window.CellAccessibility;
  const core = window.GridCore;
  const state = Object.assign(core.buildInitialState(), {
    cells: {},
    displayCells: {},
    draft: '',
    dragAnchor: null,
    pointerDown: false,
  });

  const sheet = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');

  function getCellValue(cell) {
    return state.cells[core.cellKey(cell)] || '';
  }

  function getCellDisplayValue(cell) {
    const key = core.cellKey(cell);
    return Object.prototype.hasOwnProperty.call(state.displayCells, key)
      ? state.displayCells[key]
      : getCellValue(cell);
  }

  function setCellValue(cell, value) {
    const key = core.cellKey(cell);

    if (value) {
      state.cells[key] = value;
      return;
    }

    delete state.cells[key];
  }

  function setCellDisplayValue(cell, value) {
    const key = core.cellKey(cell);

    if (value) {
      state.displayCells[key] = value;
      return;
    }

    delete state.displayCells[key];
  }

  function setCellData(cell, raw, display) {
    setCellValue(cell, raw);
    setCellDisplayValue(cell, display);
  }

  function emit(type, detail) {
    document.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function buildSheet() {
    const fragment = document.createDocumentFragment();
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner-cell';
    corner.scope = 'col';
    headRow.appendChild(corner);

    for (let col = 0; col < core.COLS; col += 1) {
      headRow.appendChild(buildColumnHeader(col));
    }

    thead.appendChild(headRow);
    fragment.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < core.ROWS; row += 1) {
      const tr = document.createElement('tr');
      tr.appendChild(buildRowHeader(row));

      for (let col = 0; col < core.COLS; col += 1) {
        tr.appendChild(buildGridCell({ col, row }));
      }

      tbody.appendChild(tr);
    }

    fragment.appendChild(tbody);
    sheet.appendChild(fragment);
  }

  function buildColumnHeader(col) {
    const th = document.createElement('th');
    th.className = 'col-header';
    th.scope = 'col';
    th.dataset.axis = 'col';
    th.dataset.index = String(col);
    th.appendChild(buildHeaderInner(core.colLabel(col), 'col', col));
    return th;
  }

  function buildRowHeader(row) {
    const th = document.createElement('th');
    th.className = 'row-header';
    th.scope = 'row';
    th.dataset.axis = 'row';
    th.dataset.index = String(row);
    th.appendChild(buildHeaderInner(String(row + 1), 'row', row));
    return th;
  }

  function buildHeaderInner(label, axis, index) {
    const inner = document.createElement('div');
    inner.className = 'header-inner';

    const text = document.createElement('span');
    text.className = 'header-label';
    text.textContent = label;
    inner.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'header-actions';
    actions.appendChild(buildHeaderAction('+', 'insert-before', axis, index));
    actions.appendChild(buildHeaderAction('=', 'insert-after', axis, index));
    actions.appendChild(buildHeaderAction('-', 'delete', axis, index));
    inner.appendChild(actions);

    return inner;
  }

  function buildHeaderAction(label, action, axis, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'header-action';
    button.textContent = label;
    const actionLabel = action === 'delete'
      ? 'Delete '
      : action === 'insert-after'
        ? 'Insert after '
        : 'Insert before ';
    button.title = actionLabel + axis;
    button.dataset.action = action;
    button.dataset.axis = axis;
    button.dataset.index = String(index);
    button.setAttribute('aria-label', button.title + ' ' + (axis === 'row' ? index + 1 : core.colLabel(index)));
    return button;
  }

  function buildGridCell(cell) {
    const td = document.createElement('td');
    td.className = 'grid-cell';
    td.tabIndex = -1;
    td.dataset.col = String(cell.col);
    td.dataset.row = String(cell.row);
    td.dataset.cell = core.cellId(cell);
    td.setAttribute('role', 'gridcell');
    td.setAttribute('aria-label', a11y.buildCellAriaLabel(core.cellId(cell), ''));

    const display = document.createElement('span');
    display.className = 'cell-display';
    td.appendChild(display);

    return td;
  }

  function cellFromElement(element) {
    if (!element || !element.dataset) return null;
    if (!('col' in element.dataset) || !('row' in element.dataset)) return null;
    return { col: Number(element.dataset.col), row: Number(element.dataset.row) };
  }

  function getCellElement(cell) {
    return sheet.querySelector('[data-row="' + cell.row + '"][data-col="' + cell.col + '"]');
  }

  function isInRange(cell, range) {
    if (!range) return false;
    return (
      cell.col >= range.start.col &&
      cell.col <= range.end.col &&
      cell.row >= range.start.row &&
      cell.row <= range.end.row
    );
  }

  function syncFormulaBar() {
    const raw = state.editing ? state.draft : getCellValue(state.active);
    formulaInput.value = raw;
    nameBox.textContent = core.cellId(state.active);
  }

  function commitEdit(moveKey) {
    if (!state.editing) return;

    const cell = state.active;
    const previous = getCellValue(cell);
    setCellValue(cell, state.draft);
    state.editing = false;
    state.draft = '';

    emit('sheet:cell-commit', { cell, previous, raw: getCellValue(cell) });

    if (moveKey) {
      state.active = core.moveActive(cell, moveKey);
      state.range = null;
      state.anchor = null;
    }

    render();
  }

  function cancelEdit() {
    if (!state.editing) return;
    state.editing = false;
    state.draft = '';
    render();
  }

  function startEdit(seed, replace) {
    state.editing = true;
    state.draft = replace ? seed : getCellValue(state.active);
    render();

    const input = getCellElement(state.active).querySelector('.cell-editor');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function updateSelection(next, options) {
    state.active = core.clampCell(next);

    if (options && options.extend) {
      state.anchor = state.anchor || state.active;
      state.range = core.selectionFromAnchor(state.anchor, state.active);
    } else if (options && options.range) {
      state.anchor = options.range.start;
      state.range = options.range;
    } else {
      state.anchor = null;
      state.range = null;
    }

    state.editing = false;
    state.draft = '';
    render();
  }

  function renderCell(cell) {
    const element = getCellElement(cell);
    const value = getCellDisplayValue(cell);
    const active = cell.col === state.active.col && cell.row === state.active.row;
    const inRange = isInRange(cell, state.range);

    element.classList.toggle('active', active);
    element.classList.toggle('in-range', inRange);
    element.classList.toggle('editing', active && state.editing);
    element.tabIndex = active ? 0 : -1;
    element.setAttribute('aria-selected', active ? 'true' : 'false');

    const currentEditor = element.querySelector('.cell-editor');
    if (currentEditor) currentEditor.remove();

    const display = element.querySelector('.cell-display');
    const renderedValue = active && state.editing ? '' : value;
    display.textContent = renderedValue;
    element.setAttribute('aria-label', a11y.buildCellAriaLabel(core.cellId(cell), renderedValue));

    if (active && state.editing) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-editor';
      input.spellcheck = false;
      input.value = state.draft;
      element.appendChild(input);
    }
  }

  function render() {
    for (let row = 0; row < core.ROWS; row += 1) {
      for (let col = 0; col < core.COLS; col += 1) {
        renderCell({ col, row });
      }
    }

    syncFormulaBar();
    const activeCell = getCellElement(state.active);
    if (activeCell && document.activeElement !== formulaInput && !state.editing) {
      activeCell.focus({ preventScroll: true });
    }

    emit('sheet:selection-change', {
      active: state.active,
      range: state.range,
      raw: getCellValue(state.active),
    });
  }

  function clearSelection() {
    const range = state.range || core.selectionFromAnchor(state.active, state.active);

    for (let row = range.start.row; row <= range.end.row; row += 1) {
      for (let col = range.start.col; col <= range.end.col; col += 1) {
          setCellData({ col, row }, '', '');
      }
    }

    emit('sheet:clear-range', { range });
    state.editing = false;
    state.draft = '';
    render();
  }

  sheet.addEventListener('mousedown', function (event) {
    const cellElement = event.target.closest('.grid-cell');
    if (!cellElement) return;

    const cell = cellFromElement(cellElement);
    state.pointerDown = true;
    state.dragAnchor = event.shiftKey && state.anchor ? state.anchor : cell;

    const range = event.shiftKey
      ? core.selectionFromAnchor(state.anchor || state.active, cell)
      : core.selectionFromAnchor(cell, cell);

    updateSelection(cell, { range });
  });

  sheet.addEventListener('mouseover', function (event) {
    if (!state.pointerDown || !state.dragAnchor) return;
    const cellElement = event.target.closest('.grid-cell');
    if (!cellElement) return;

    const cell = cellFromElement(cellElement);
    updateSelection(cell, { range: core.selectionFromAnchor(state.dragAnchor, cell) });
  });

  document.addEventListener('mouseup', function () {
    state.pointerDown = false;
    state.dragAnchor = null;
  });

  sheet.addEventListener('dblclick', function (event) {
    const cellElement = event.target.closest('.grid-cell');
    if (!cellElement) return;

    state.active = cellFromElement(cellElement);
    startEdit(getCellValue(state.active), false);
  });

  sheet.addEventListener('click', function (event) {
    const actionButton = event.target.closest('.header-action');
    if (actionButton) {
      emit('sheet:structure-request', {
        axis: actionButton.dataset.axis,
        index: Number(actionButton.dataset.index),
        action: actionButton.dataset.action,
      });
      return;
    }
  });

  formulaInput.addEventListener('focus', function () {
    state.editing = true;
    state.draft = getCellValue(state.active);
    syncFormulaBar();
  });

  formulaInput.addEventListener('input', function (event) {
    state.editing = true;
    state.draft = event.target.value;
    const activeCell = getCellElement(state.active);
    if (activeCell) renderCell(state.active);
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit('ArrowDown');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  sheet.addEventListener('input', function (event) {
    if (!event.target.classList.contains('cell-editor')) return;
    state.draft = event.target.value;
    syncFormulaBar();
  });

  sheet.addEventListener('keydown', function (event) {
    if (!event.target.classList.contains('cell-editor')) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit('ArrowDown');
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit('ArrowRight');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.target === formulaInput) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const isArrow = /^Arrow/.test(event.key);
    if (state.editing) return;

    if (isArrow) {
      event.preventDefault();
      const base = event.shiftKey ? state.active : core.moveActive(state.active, event.key);
      const next = core.moveActive(state.active, event.key);
      if (event.shiftKey) {
        const anchor = state.anchor || base;
        updateSelection(next, { range: core.selectionFromAnchor(anchor, next) });
      } else {
        updateSelection(next);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEdit(getCellValue(state.active), false);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearSelection();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      updateSelection(core.moveActive(state.active, 'ArrowRight'));
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      startEdit(event.key, true);
    }
  });

  buildSheet();

  function resolveStorageNamespace() {
    const injected = window.__BENCHMARK_STORAGE_NAMESPACE__
      || window.__OPENCODE_STORAGE_NAMESPACE__
      || window.__STORAGE_NAMESPACE__
      || document.documentElement.getAttribute('data-storage-namespace');

    return injected ? String(injected) : 'oracle-sheet:';
  }

  window.spreadsheetShell = {
    getState: function () {
      return JSON.parse(JSON.stringify(state));
    },
    setCellRaw: function (cell, raw) {
      setCellData(cell, raw, raw);
    },
    setCellData: function (cell, raw, display) {
      setCellData(cell, raw, display);
    },
    setActiveCell: function (cell) {
      state.active = core.clampCell(cell);
      state.anchor = null;
      state.range = null;
      state.editing = false;
      state.draft = '';
      render();
    },
    rerender: render,
  };

  const model = window.createDocumentModel({
    storage: window.localStorage,
    namespace: resolveStorageNamespace(),
  });
  const engine = new window.SpreadsheetFormulaEngine.SpreadsheetEngine();
  const controller = window.SpreadsheetController.createSpreadsheetController({
    shell: window.spreadsheetShell,
    model: model,
    engine: engine,
  });

  document.addEventListener('sheet:cell-commit', function (event) {
    controller.commitCell(event.detail.cell, event.detail.raw);
  });

  document.addEventListener('sheet:clear-range', function (event) {
    controller.clearRange(event.detail.range);
  });

  document.addEventListener('sheet:structure-request', function (event) {
    controller.applyStructureChange(event.detail);
  });

  document.addEventListener('sheet:selection-change', function (event) {
    controller.setSelection(event.detail.active, event.detail.range || {
      start: event.detail.active,
      end: event.detail.active,
    });
  });

  document.addEventListener('keydown', function (event) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (event.target && event.target.classList && event.target.classList.contains('cell-editor')) return;

    const key = event.key.toLowerCase();

    if (key === 'c') {
      event.preventDefault();
      controller.copySelection();
      return;
    }

    if (key === 'x') {
      event.preventDefault();
      controller.cutSelection();
      return;
    }

    if (key === 'v') {
      event.preventDefault();
      controller.pasteSelection();
      return;
    }

    if (key === 'z' && event.shiftKey) {
      event.preventDefault();
      controller.redo();
      return;
    }

    if (key === 'z') {
      event.preventDefault();
      controller.undo();
      return;
    }
  });

  controller.hydrate();
})();
