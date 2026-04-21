(function (global) {
  const SHEET_COLUMNS = 26;
  const SHEET_ROWS = 100;
  const DEFAULT_RANGE = {
    startColumn: 0,
    startRow: 0,
    endColumn: 2,
    endRow: 3,
  };
  const EDITOR_KEYS = new Set(['Enter', 'Tab', 'Escape']);
  const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'F2']);

  const workbookApi = resolveDependency(global, './workbook-store.js', 'WorkbookStore');
  const namespaceModule = resolveDependency(global, './storage-namespace.js', 'StorageNamespace');
  const createWorkbookStore = workbookApi && workbookApi.createWorkbookStore;
  const coordsToCellId = workbookApi && workbookApi.coordsToCellId;
  const createStorageNamespaceApi = namespaceModule && namespaceModule.createStorageNamespaceApi;

  function resolveDependency(context, path, globalName) {
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require(path);
    }
    return context[globalName];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
  }

  function getColumnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function buildSurfaceModel() {
    const columns = Array.from({ length: SHEET_COLUMNS }, (_, columnIndex) => ({
      index: columnIndex,
      label: getColumnLabel(columnIndex),
    }));

    const rows = Array.from({ length: SHEET_ROWS }, (_, rowIndex) => ({
      index: rowIndex,
      label: String(rowIndex + 1),
      cells: columns.map((column) => ({
        row: rowIndex,
        column: column.index,
        address: `${column.label}${rowIndex + 1}`,
      })),
    }));

    return {
      formulaBar: {
        label: 'fx',
        name: 'Formula Bar',
        placeholder: 'Selected cell contents will appear here',
      },
      columns,
      rows,
      activeCell: { column: 0, row: 0 },
      range: { ...DEFAULT_RANGE },
    };
  }

  function createNode(document, tagName, className, textContent) {
    const node = document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    if (typeof textContent === 'string') {
      node.textContent = textContent;
    }
    return node;
  }

  function isPrintableKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  function createInteractionController(options) {
    const settings = options || {};
    const store = settings.store;
    const rows = settings.rows || SHEET_ROWS;
    const columns = settings.columns || SHEET_COLUMNS;
    const state = {
      editor: null,
    };

    function getSelection() {
      return store.getSelection();
    }

    function getActivePoint() {
      return getSelection().active;
    }

    function getCellRaw(row, col) {
      const cell = store.getCell(coordsToCellId(row, col));
      return cell ? cell.raw : '';
    }

    function selectCell(row, col) {
      return store.selectCell(clamp(row, 1, rows), clamp(col, 1, columns));
    }

    function moveSelection(deltaRow, deltaCol) {
      const active = getActivePoint();
      return selectCell(active.row + deltaRow, active.col + deltaCol);
    }

    function beginEdit(source, draft) {
      const active = getActivePoint();
      state.editor = {
        source,
        row: active.row,
        col: active.col,
        original: getCellRaw(active.row, active.col),
        draft,
      };
      return getEditorState();
    }

    function startCellEdit() {
      const active = getActivePoint();
      return beginEdit('cell', getCellRaw(active.row, active.col));
    }

    function startFormulaBarEdit() {
      const active = getActivePoint();
      return beginEdit('formula', getCellRaw(active.row, active.col));
    }

    function getEditorState() {
      return state.editor ? {
        source: state.editor.source,
        row: state.editor.row,
        col: state.editor.col,
        original: state.editor.original,
        draft: state.editor.draft,
      } : null;
    }

    function isEditing() {
      return Boolean(state.editor);
    }

    function handleEditorInput(value) {
      if (!state.editor) {
        return null;
      }
      state.editor.draft = String(value);
      return getEditorState();
    }

    function commitEdit(move) {
      if (!state.editor) {
        return getSelection();
      }

      store.commitCell(state.editor.row, state.editor.col, state.editor.draft);
      state.editor = null;

      if (move === 'down') {
        return moveSelection(1, 0);
      }
      if (move === 'right') {
        return moveSelection(0, 1);
      }
      return getSelection();
    }

    function cancelEdit() {
      state.editor = null;
      return getSelection();
    }

    function handleEditorKeyDown(event) {
      if (!state.editor) {
        return getSelection();
      }
      if (event.key === 'Escape') {
        return cancelEdit();
      }
      if (event.key === 'Enter') {
        return commitEdit('down');
      }
      if (event.key === 'Tab') {
        return commitEdit('right');
      }
      return getEditorState();
    }

    function handleGridKeyDown(event) {
      if (state.editor) {
        return handleEditorKeyDown(event);
      }

      switch (event.key) {
        case 'ArrowUp':
          return moveSelection(-1, 0);
        case 'ArrowDown':
          return moveSelection(1, 0);
        case 'ArrowLeft':
          return moveSelection(0, -1);
        case 'ArrowRight':
          return moveSelection(0, 1);
        case 'Enter':
        case 'F2':
          return startCellEdit();
        default:
          if (isPrintableKey(event)) {
            return beginEdit('cell', event.key);
          }
          return getSelection();
      }
    }

    function clickCell(row, col) {
      if (state.editor) {
        commitEdit();
      }
      return selectCell(row, col);
    }

    function doubleClickCell(row, col) {
      selectCell(row, col);
      return startCellEdit();
    }

    return {
      cancelEdit,
      clickCell,
      commitEdit,
      doubleClickCell,
      getCellRaw,
      getEditorState,
      getSelection,
      handleEditorInput,
      handleEditorKeyDown,
      handleGridKeyDown,
      isEditing,
      selectCell,
      startFormulaBarEdit,
    };
  }

  function getSelectionBounds(selection) {
    return {
      startRow: selection.range.start.row,
      endRow: selection.range.end.row,
      startCol: selection.range.start.col,
      endCol: selection.range.end.col,
    };
  }

  function isCellInSelection(row, col, bounds) {
    return row >= bounds.startRow && row <= bounds.endRow && col >= bounds.startCol && col <= bounds.endCol;
  }

  function isSelectionEdge(row, col, bounds, side) {
    if (!isCellInSelection(row, col, bounds)) {
      return false;
    }
    if (side === 'top') {
      return row === bounds.startRow;
    }
    if (side === 'right') {
      return col === bounds.endCol;
    }
    if (side === 'bottom') {
      return row === bounds.endRow;
    }
    return col === bounds.startCol;
  }

  function renderSpreadsheet(document, options) {
    const settings = options || {};
    const mountPoint = document.getElementById('app');
    if (!mountPoint || !createWorkbookStore || !coordsToCellId || !createStorageNamespaceApi) {
      return null;
    }

    const model = buildSurfaceModel();
    const namespaceApi = settings.namespaceApi || createStorageNamespaceApi(global);
    const store = settings.store || createWorkbookStore({
      namespace: namespaceApi.getNamespace(),
      storage: settings.storage || global.localStorage || null,
    });
    const controller = settings.controller || createInteractionController({ store });

    const shell = createNode(document, 'main', 'app-shell');
    const topbar = createNode(document, 'section', 'formula-bar');
    const nameBox = createNode(document, 'div', 'name-box');
    const formulaLabel = createNode(document, 'div', 'formula-label', model.formulaBar.label);
    const formulaInput = createNode(document, 'div', 'formula-input');
    const formulaEditor = createNode(document, 'input', 'formula-editor');
    const sheetViewport = createNode(document, 'section', 'sheet-viewport');
    const grid = createNode(document, 'div', 'sheet-grid');

    const columnHeaders = [];
    const rowHeaders = [];
    const cellMap = new Map();

    nameBox.setAttribute('aria-label', 'Selected cell');
    formulaEditor.type = 'text';
    formulaEditor.placeholder = model.formulaBar.placeholder;
    formulaEditor.setAttribute('aria-label', model.formulaBar.name);
    formulaEditor.spellcheck = false;
    formulaEditor.autocomplete = 'off';

    formulaInput.appendChild(formulaEditor);
    topbar.appendChild(nameBox);
    topbar.appendChild(formulaLabel);
    topbar.appendChild(formulaInput);

    grid.style.setProperty('--column-count', String(model.columns.length));
    grid.setAttribute('tabindex', '0');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Spreadsheet grid');

    const corner = createNode(document, 'div', 'corner-cell');
    grid.appendChild(corner);

    model.columns.forEach((column) => {
      const header = createNode(document, 'div', 'column-header', column.label);
      columnHeaders.push(header);
      grid.appendChild(header);
    });

    model.rows.forEach((row) => {
      const rowHeader = createNode(document, 'div', 'row-header', row.label);
      rowHeaders.push(rowHeader);
      grid.appendChild(rowHeader);

      row.cells.forEach((cell) => {
        const rowValue = cell.row + 1;
        const colValue = cell.column + 1;
        const cellNode = createNode(document, 'div', 'grid-cell');
        const cellText = createNode(document, 'span', 'grid-cell-content');
        cellNode.dataset.row = String(rowValue);
        cellNode.dataset.col = String(colValue);
        cellNode.dataset.address = cell.address;
        cellNode.setAttribute('role', 'gridcell');
        cellNode.setAttribute('aria-label', cell.address);
        cellNode.appendChild(cellText);
        cellMap.set(cell.address, { cellNode, cellText });
        grid.appendChild(cellNode);
      });
    });

    sheetViewport.appendChild(grid);
    shell.appendChild(topbar);
    shell.appendChild(sheetViewport);
    mountPoint.replaceChildren(shell);

    function getCellRecord(row, col) {
      return cellMap.get(coordsToCellId(row, col));
    }

    function syncFormulaBar() {
      const editorState = controller.getEditorState();
      if (editorState) {
        formulaEditor.value = editorState.draft;
        return;
      }

      const active = store.getSelection().active;
      formulaEditor.value = controller.getCellRaw(active.row, active.col);
    }

    function renderCellValues() {
      model.rows.forEach((row) => {
        row.cells.forEach((cell) => {
          const rowValue = cell.row + 1;
          const colValue = cell.column + 1;
          const record = getCellRecord(rowValue, colValue);
          const editorState = controller.getEditorState();
          const editingThisCell = editorState && editorState.source === 'cell' && editorState.row === rowValue && editorState.col === colValue;
          if (!editingThisCell) {
            record.cellNode.classList.remove('is-editing');
            record.cellText.textContent = controller.getCellRaw(rowValue, colValue);
          }
        });
      });
    }

    function renderSelection() {
      const selection = store.getSelection();
      const bounds = getSelectionBounds(selection);
      nameBox.textContent = selection.activeCellId;

      rowHeaders.forEach((header, index) => {
        header.classList.toggle('active-header', selection.active.row === index + 1);
      });

      columnHeaders.forEach((header, index) => {
        header.classList.toggle('active-header', selection.active.col === index + 1);
      });

      model.rows.forEach((row) => {
        row.cells.forEach((cell) => {
          const rowValue = cell.row + 1;
          const colValue = cell.column + 1;
          const record = getCellRecord(rowValue, colValue);
          record.cellNode.classList.toggle('in-range', isCellInSelection(rowValue, colValue, bounds));
          record.cellNode.classList.toggle('range-top', isSelectionEdge(rowValue, colValue, bounds, 'top'));
          record.cellNode.classList.toggle('range-right', isSelectionEdge(rowValue, colValue, bounds, 'right'));
          record.cellNode.classList.toggle('range-bottom', isSelectionEdge(rowValue, colValue, bounds, 'bottom'));
          record.cellNode.classList.toggle('range-left', isSelectionEdge(rowValue, colValue, bounds, 'left'));
          record.cellNode.classList.toggle('active-cell', selection.active.row === rowValue && selection.active.col === colValue);
        });
      });
    }

    function renderCellEditor() {
      const priorEditor = grid.querySelector('.grid-editor');
      if (priorEditor && priorEditor.parentNode) {
        priorEditor.parentNode.removeChild(priorEditor);
      }

      const editorState = controller.getEditorState();
      if (!editorState || editorState.source !== 'cell') {
        return;
      }

      const record = getCellRecord(editorState.row, editorState.col);
      record.cellNode.classList.add('is-editing');
      record.cellText.textContent = '';

      const editor = createNode(document, 'input', 'grid-editor');
      editor.type = 'text';
      editor.value = editorState.draft;
      editor.spellcheck = false;
      editor.setAttribute('aria-label', 'Editing ' + coordsToCellId(editorState.row, editorState.col));

      editor.addEventListener('input', function () {
        controller.handleEditorInput(editor.value);
        syncFormulaBar();
      });

      editor.addEventListener('keydown', function (event) {
        if (!EDITOR_KEYS.has(event.key)) {
          return;
        }

        event.preventDefault();
        controller.handleEditorKeyDown(event);
        refresh();
        grid.focus();
      });

      editor.addEventListener('blur', function () {
        if (!controller.isEditing()) {
          return;
        }
        if (document.activeElement === formulaEditor) {
          return;
        }
        controller.commitEdit();
        refresh();
      });

      record.cellNode.appendChild(editor);
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }

    function refresh() {
      renderCellValues();
      renderSelection();
      syncFormulaBar();
      renderCellEditor();
    }

    grid.addEventListener('mousedown', function (event) {
      const cellNode = event.target.closest('.grid-cell');
      if (!cellNode) {
        return;
      }

      controller.clickCell(Number(cellNode.dataset.row), Number(cellNode.dataset.col));
      refresh();
      grid.focus();
    });

    grid.addEventListener('dblclick', function (event) {
      const cellNode = event.target.closest('.grid-cell');
      if (!cellNode) {
        return;
      }

      controller.doubleClickCell(Number(cellNode.dataset.row), Number(cellNode.dataset.col));
      refresh();
    });

    grid.addEventListener('keydown', function (event) {
      if (!NAVIGATION_KEYS.has(event.key) && !isPrintableKey(event)) {
        return;
      }

      event.preventDefault();
      controller.handleGridKeyDown(event);
      refresh();
    });

    formulaEditor.addEventListener('focus', function () {
      if (!controller.isEditing()) {
        controller.startFormulaBarEdit();
        refresh();
      }
    });

    formulaEditor.addEventListener('input', function () {
      if (!controller.isEditing()) {
        controller.startFormulaBarEdit();
      }
      controller.handleEditorInput(formulaEditor.value);
    });

    formulaEditor.addEventListener('keydown', function (event) {
      if (!EDITOR_KEYS.has(event.key)) {
        return;
      }

      event.preventDefault();
      controller.handleEditorKeyDown(event);
      refresh();
      grid.focus();
    });

    formulaEditor.addEventListener('blur', function () {
      const editorState = controller.getEditorState();
      if (!editorState || editorState.source !== 'formula') {
        return;
      }
      if (document.activeElement && document.activeElement.classList.contains('grid-editor')) {
        return;
      }
      controller.commitEdit();
      refresh();
    });

    refresh();

    return {
      controller,
      grid,
      namespace: namespaceApi.getNamespace(),
      store,
    };
  }

  function boot(options) {
    const settings = options || {};
    const namespaceApi = settings.namespaceApi || createStorageNamespaceApi(global);
    const result = {
      storageNamespace: namespaceApi.getNamespace(),
    };

    if (settings.document) {
      result.surface = renderSpreadsheet(settings.document, settings);
    }

    return result;
  }

  const api = {
    SHEET_COLUMNS,
    SHEET_ROWS,
    boot,
    buildSurfaceModel,
    createInteractionController,
    getColumnLabel,
    renderSpreadsheet,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.SpreadsheetSurface = api;

  if (typeof document !== 'undefined') {
    boot({ document });
  }
})(typeof window !== 'undefined' ? window : globalThis);
