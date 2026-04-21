(function () {
  const core = window.SpreadsheetCore;
  const COLS = 26;
  const ROWS = 100;
  const STORAGE_KEY = getStorageNamespace() + 'northsheet:v1';

  const sheet = core.createSheet();
  const grid = document.getElementById('grid');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');

  let activeCellId = 'A1';
  let editing = null;

  hydrate();
  renderGrid();
  syncFormulaBar();
  bindEvents();

  function getStorageNamespace() {
    return window.__RUN_STORAGE_NAMESPACE__
      || window.RUN_STORAGE_NAMESPACE
      || document.documentElement.dataset.storageNamespace
      || 'local:';
  }

  function hydrate() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      Object.entries(stored.cells || {}).forEach(([cellId, raw]) => core.setCellRaw(sheet, cellId, raw));
      if (stored.activeCellId) {
        activeCellId = stored.activeCellId;
      }
    } catch (_error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function persist() {
    const cells = {};
    for (const [cellId, raw] of sheet.cells.entries()) {
      cells[cellId] = raw;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cells, activeCellId }));
  }

  function renderGrid() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(div('corner', ''));
    for (let col = 0; col < COLS; col += 1) {
      fragment.appendChild(div('column-header', core.columnIndexToLabel(col)));
    }

    for (let row = 0; row < ROWS; row += 1) {
      fragment.appendChild(div('row-header', String(row + 1)));
      for (let col = 0; col < COLS; col += 1) {
        const cellId = core.pointToCellId(col, row);
        const cell = div('cell', '');
        cell.dataset.cellId = cellId;
        fragment.appendChild(cell);
      }
    }

    grid.replaceChildren(fragment);
    renderCells();
  }

  function renderCells() {
    const nodes = grid.querySelectorAll('.cell');
    nodes.forEach((node) => {
      const isActive = node.dataset.cellId === activeCellId;
      node.classList.toggle('active', isActive);
      node.classList.remove('editing');
      if (editing && editing.cellId === node.dataset.cellId) {
        renderEditor(node, editing.value);
        return;
      }
      node.textContent = core.evaluateCell(sheet, node.dataset.cellId).display;
    });
    nameBox.textContent = activeCellId;
  }

  function renderEditor(cellNode, value) {
    cellNode.classList.add('editing', 'active');
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = value;
    input.spellcheck = false;
    cellNode.replaceChildren(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', onEditorKeyDown);
    input.addEventListener('input', () => {
      editing.value = input.value;
      formulaInput.value = editing.value;
    });
    input.addEventListener('blur', () => commitEdit('stay'));
  }

  function bindEvents() {
    grid.addEventListener('click', (event) => {
      const cell = event.target.closest('.cell');
      if (!cell) {
        return;
      }
      selectCell(cell.dataset.cellId);
    });

    grid.addEventListener('dblclick', (event) => {
      const cell = event.target.closest('.cell');
      if (!cell) {
        return;
      }
      startEdit(cell.dataset.cellId, core.getCellRaw(sheet, cell.dataset.cellId));
    });

    formulaInput.addEventListener('focus', () => {
      startEdit(activeCellId, core.getCellRaw(sheet, activeCellId), true);
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    });

    formulaInput.addEventListener('input', () => {
      if (!editing || editing.cellId !== activeCellId) {
        startEdit(activeCellId, formulaInput.value, true);
      }
      editing.value = formulaInput.value;
      const activeNode = grid.querySelector(`[data-cell-id="${activeCellId}"]`);
      const editor = activeNode && activeNode.querySelector('.cell-input');
      if (editor && editor.value !== formulaInput.value) {
        editor.value = formulaInput.value;
      }
    });

    formulaInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit('down');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.target === formulaInput || event.target.classList.contains('cell-input')) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        startEdit(activeCellId, event.key);
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        startEdit(activeCellId, core.getCellRaw(sheet, activeCellId));
        return;
      }
      const next = nextCellForKey(activeCellId, event.key);
      if (next) {
        event.preventDefault();
        selectCell(next);
      }
    });
  }

  function onEditorKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit('down');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit('right');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  function selectCell(cellId) {
    activeCellId = cellId;
    editing = null;
    renderCells();
    syncFormulaBar();
    persist();
  }

  function startEdit(cellId, value, fromFormulaBar) {
    activeCellId = cellId;
    editing = { cellId, value, previous: core.getCellRaw(sheet, cellId), fromFormulaBar: Boolean(fromFormulaBar) };
    renderCells();
    syncFormulaBar();
  }

  function commitEdit(move) {
    if (!editing) {
      return;
    }
    const { cellId, value } = editing;
    core.setCellRaw(sheet, cellId, value);
    editing = null;
    if (move === 'down' || move === 'right') {
      activeCellId = nextCellForKey(cellId, move === 'down' ? 'ArrowDown' : 'ArrowRight');
    }
    renderCells();
    syncFormulaBar();
    persist();
  }

  function cancelEdit() {
    editing = null;
    renderCells();
    syncFormulaBar();
  }

  function syncFormulaBar() {
    formulaInput.value = editing && editing.cellId === activeCellId
      ? editing.value
      : core.getCellRaw(sheet, activeCellId);
    nameBox.textContent = activeCellId;
  }

  function nextCellForKey(cellId, key) {
    const point = core.cellIdToPoint(cellId);
    if (key === 'ArrowUp') {
      return core.pointToCellId(point.col, Math.max(0, point.row - 1));
    }
    if (key === 'ArrowDown') {
      return core.pointToCellId(point.col, Math.min(ROWS - 1, point.row + 1));
    }
    if (key === 'ArrowLeft') {
      return core.pointToCellId(Math.max(0, point.col - 1), point.row);
    }
    if (key === 'ArrowRight') {
      return core.pointToCellId(Math.min(COLS - 1, point.col + 1), point.row);
    }
    return null;
  }

  function div(className, text) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = text;
    return node;
  }
})();
