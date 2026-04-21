(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./workbook-store.js'), require('./src/formula-engine.js'));
  } else {
    root.SpreadsheetSurface = factory(root.WorkbookStore, root.SpreadsheetFormulaEngine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (WorkbookStoreApi, FormulaApi) {
  const SHEET_COLUMNS = 26;
  const SHEET_ROWS = 100;
  const FORMULA_PLACEHOLDER = 'Paste or select cells to inspect raw contents';
  const NAVIGATION_KEYS = {
    ArrowUp: { row: -1, col: 0 },
    ArrowDown: { row: 1, col: 0 },
    ArrowLeft: { row: 0, col: -1 },
    ArrowRight: { row: 0, col: 1 },
  };

  function getColumnLabel(index) {
    return String.fromCharCode(65 + index);
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

  function buildSurfaceModel(snapshot) {
    const selection = snapshot && snapshot.selection ? snapshot.selection : createDefaultSelection();
    const columns = Array.from({ length: SHEET_COLUMNS }, function mapColumn(_, columnIndex) {
      return {
        index: columnIndex,
        label: getColumnLabel(columnIndex),
        actions: createHeaderActions('column', columnIndex),
      };
    });

    const rows = Array.from({ length: SHEET_ROWS }, function mapRow(_, rowIndex) {
      return {
        index: rowIndex,
        label: String(rowIndex + 1),
        actions: createHeaderActions('row', rowIndex),
        cells: columns.map(function mapCell(column) {
          return {
            row: rowIndex,
            column: column.index,
            address: column.label + String(rowIndex + 1),
          };
        }),
      };
    });

    return {
      formulaBar: {
        label: 'fx',
        name: 'Formula Bar',
        modeLabel: 'Formula',
        hint: 'Press Enter to commit',
        placeholder: FORMULA_PLACEHOLDER,
      },
      columns,
      rows,
      activeCell: {
        column: selection.active.col - 1,
        row: selection.active.row - 1,
      },
      range: {
        startColumn: selection.range.start.col - 1,
        startRow: selection.range.start.row - 1,
        endColumn: selection.range.end.col - 1,
        endRow: selection.range.end.row - 1,
      },
    };
  }

  function createHeaderActions(axis, index) {
    if (axis === 'column') {
      return [
        { label: 'Insert Left', type: 'insert-column', index: index + 1 },
        { label: 'Insert Right', type: 'insert-column', index: index + 2 },
        { label: 'Delete Column', type: 'delete-column', index: index + 1 },
      ];
    }

    return [
      { label: 'Insert Above', type: 'insert-row', index: index + 1 },
      { label: 'Insert Below', type: 'insert-row', index: index + 2 },
      { label: 'Delete Row', type: 'delete-row', index: index + 1 },
    ];
  }

  function createDefaultSelection() {
    return {
      active: { row: 1, col: 1 },
      anchor: { row: 1, col: 1 },
      range: {
        start: { row: 1, col: 1 },
        end: { row: 1, col: 1 },
      },
      activeCellId: 'A1',
    };
  }

  function selectionToBounds(selection) {
    return {
      start: {
        row: Math.min(selection.range.start.row, selection.range.end.row),
        col: Math.min(selection.range.start.col, selection.range.end.col),
      },
      end: {
        row: Math.max(selection.range.start.row, selection.range.end.row),
        col: Math.max(selection.range.start.col, selection.range.end.col),
      },
    };
  }

  function isCellInRange(cell, bounds) {
    return cell.column + 1 >= bounds.start.col && cell.column + 1 <= bounds.end.col && cell.row + 1 >= bounds.start.row && cell.row + 1 <= bounds.end.row;
  }

  function isRangeEdge(cell, bounds, side) {
    if (!isCellInRange(cell, bounds)) {
      return false;
    }

    if (side === 'top') {
      return cell.row + 1 === bounds.start.row;
    }
    if (side === 'right') {
      return cell.column + 1 === bounds.end.col;
    }
    if (side === 'bottom') {
      return cell.row + 1 === bounds.end.row;
    }
    return cell.column + 1 === bounds.start.col;
  }

  function serializeClipboardMatrix(matrix) {
    return matrix.map(function serializeRow(row) {
      return row.join('\t');
    }).join('\n');
  }

  function parseClipboardText(text) {
    const normalized = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    const rows = normalized.split('\n');
    while (rows.length > 1 && rows[rows.length - 1] === '') {
      rows.pop();
    }
    return rows.map(function parseRow(row) {
      return row.split('\t');
    });
  }

  function getSelectionMatrix(snapshot, bounds) {
    const matrix = [];
    for (let row = bounds.start.row; row <= bounds.end.row; row += 1) {
      const rowValues = [];
      for (let col = bounds.start.col; col <= bounds.end.col; col += 1) {
        const cellId = WorkbookStoreApi.coordsToCellId(row, col);
        rowValues.push(snapshot.cells[cellId] ? snapshot.cells[cellId].raw : '');
      }
      matrix.push(rowValues);
    }
    return matrix;
  }

  function getMatrixShape(matrix) {
    return {
      rows: matrix.length,
      cols: matrix.reduce(function maxColumns(max, row) {
        return Math.max(max, row.length);
      }, 0),
    };
  }

  function getPasteStart(selection, matrix) {
    const bounds = selectionToBounds(selection);
    const shape = getMatrixShape(matrix);
    const targetHeight = bounds.end.row - bounds.start.row + 1;
    const targetWidth = bounds.end.col - bounds.start.col + 1;

    if ((targetHeight > 1 || targetWidth > 1) && targetHeight === shape.rows && targetWidth === shape.cols) {
      return { row: bounds.start.row, col: bounds.start.col };
    }

    return { row: selection.active.row, col: selection.active.col };
  }

  function shiftClipboardMatrix(matrix, rowOffset, colOffset, shiftFormula) {
    return matrix.map(function mapRow(row) {
      return row.map(function mapValue(value) {
        if (typeof value === 'string' && value[0] === '=') {
          return shiftFormula(value, rowOffset, colOffset);
        }
        return value;
      });
    });
  }

  function isNumericDisplayValue(value) {
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(value));
  }

  function clampPoint(point) {
    return {
      row: Math.min(Math.max(point.row, 1), SHEET_ROWS),
      col: Math.min(Math.max(point.col, 1), SHEET_COLUMNS),
    };
  }

  function isPrintableKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  function shouldHandleShellInput(shell, activeElement) {
    if (!shell || !activeElement) {
      return false;
    }

    if (activeElement === shell) {
      return true;
    }

    if (typeof shell.contains === 'function' && shell.contains(activeElement)) {
      return true;
    }

    return activeElement.tagName === 'BODY';
  }

  function createEditController(options) {
    const store = options.store;
    const state = {
      editor: null,
    };

    function getSelection() {
      return store.getSelection();
    }

    function getCellRaw(row, col) {
      const cell = store.getCell(WorkbookStoreApi.coordsToCellId(row, col));
      return cell ? cell.raw : '';
    }

    function getEditorState() {
      return state.editor ? {
        row: state.editor.row,
        col: state.editor.col,
        draft: state.editor.draft,
      } : null;
    }

    function isEditing() {
      return Boolean(state.editor);
    }

    function beginReplace(key) {
      const active = getSelection().active;
      state.editor = {
        row: active.row,
        col: active.col,
        draft: key,
      };
      return getEditorState();
    }

    function appendCharacter(key) {
      if (!state.editor) {
        return beginReplace(key);
      }
      state.editor.draft += key;
      return getEditorState();
    }

    function startFormulaBarEdit() {
      const active = getSelection().active;
      state.editor = {
        row: active.row,
        col: active.col,
        draft: getCellRaw(active.row, active.col),
      };
      return getEditorState();
    }

    function handleGridKeyDown(event) {
      if (isPrintableKey(event)) {
        return appendCharacter(event.key);
      }
      return getSelection();
    }

    function handleTextInput(text) {
      const value = String(text == null ? '' : text);
      if (!value) {
        return getSelection();
      }

      for (let index = 0; index < value.length; index += 1) {
        appendCharacter(value[index]);
      }

      return getEditorState();
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
        const active = store.getSelection().active;
        store.selectCell(Math.min(active.row + 1, SHEET_ROWS), active.col);
      }

      if (move === 'right') {
        const active = store.getSelection().active;
        store.selectCell(active.row, Math.min(active.col + 1, SHEET_COLUMNS));
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

      if (event.key === 'Enter') {
        return commitEdit('down');
      }
      if (event.key === 'Tab') {
        return commitEdit('right');
      }
      if (event.key === 'Escape') {
        return cancelEdit();
      }

      return getEditorState();
    }

    return {
      cancelEdit,
      commitEdit,
      getCellRaw,
      getEditorState,
      getSelection,
      handleEditorInput,
      handleEditorKeyDown,
      handleGridKeyDown,
      handleTextInput,
      isEditing,
      startFormulaBarEdit,
    };
  }

  function resolveNamespace(context) {
    return context.__BENCHMARK_RUN_NAMESPACE__
      || context.BENCHMARK_RUN_NAMESPACE
      || context.__RUN_STORAGE_NAMESPACE__
      || 'spreadsheet';
  }

  function createSpreadsheetApp(document, options) {
    const settings = options || {};
    const formulaModule = FormulaApi || {};
    const shiftFormula = typeof formulaModule.shiftFormula === 'function'
      ? formulaModule.shiftFormula
      : function passthroughFormula(raw) {
        return raw;
      };
    const updateFormulaForStructuralChange = typeof formulaModule.updateFormulaForStructuralChange === 'function'
      ? formulaModule.updateFormulaForStructuralChange
      : function passthroughStructuralFormula(raw) {
        return raw;
      };
    const store = settings.store || WorkbookStoreApi.createWorkbookStore({
      namespace: resolveNamespace(typeof window !== 'undefined' ? window : globalThis),
      storage: typeof window !== 'undefined' ? window.localStorage : null,
      formulaHelpers: { shiftFormula, updateFormulaForStructuralChange },
    });
    const editController = createEditController({ store });
    const mountPoint = document.getElementById('app');

    if (!mountPoint) {
      return null;
    }

    const model = buildSurfaceModel();
    const elements = {
      cellNodes: Object.create(null),
      columnHeaders: Object.create(null),
      rowHeaders: Object.create(null),
    };
    let clipboardState = null;
    let dragState = null;

    const shell = createNode(document, 'main', 'app-shell');
    const topbar = createNode(document, 'section', 'formula-bar');
    const nameBox = createNode(document, 'div', 'name-box', 'A1');
    const formulaMeta = createNode(document, 'div', 'formula-meta');
    const formulaLabel = createNode(document, 'div', 'formula-label', model.formulaBar.label);
    const formulaCaption = createNode(document, 'div', 'formula-caption');
    const formulaMode = createNode(document, 'span', 'formula-mode', model.formulaBar.modeLabel);
    const formulaHint = createNode(document, 'span', 'formula-hint', model.formulaBar.hint);
    const formulaInput = createNode(document, 'div', 'formula-input');
    const formulaText = createNode(document, 'span', 'formula-placeholder', model.formulaBar.placeholder);
    const sheetViewport = createNode(document, 'section', 'sheet-viewport');
    const grid = createNode(document, 'div', 'sheet-grid');

    shell.tabIndex = 0;
    shell.setAttribute('role', 'application');
    nameBox.setAttribute('aria-label', 'Selected cell');
    formulaInput.setAttribute('aria-label', model.formulaBar.name);
    formulaInput.setAttribute('role', 'textbox');
    formulaInput.setAttribute('aria-readonly', 'true');
    sheetViewport.tabIndex = -1;
    grid.setAttribute('role', 'grid');
    grid.style.setProperty('--column-count', String(model.columns.length));

    formulaCaption.appendChild(formulaMode);
    formulaCaption.appendChild(formulaHint);
    formulaMeta.appendChild(formulaLabel);
    formulaMeta.appendChild(formulaCaption);
    formulaInput.appendChild(formulaText);
    topbar.appendChild(nameBox);
    topbar.appendChild(formulaMeta);
    topbar.appendChild(formulaInput);

    grid.appendChild(createNode(document, 'div', 'corner-cell'));

    model.columns.forEach(function createColumn(column) {
      const header = createNode(document, 'div', 'column-header');
      const label = createNode(document, 'span', 'header-label', column.label);
      const actions = createHeaderActionButtons(document, column.actions, applyHeaderAction);
      header.dataset.column = column.label;
      header.appendChild(label);
      header.appendChild(actions);
      elements.columnHeaders[column.index + 1] = header;
      grid.appendChild(header);
    });

    model.rows.forEach(function createRow(row) {
      const rowHeader = createNode(document, 'div', 'row-header');
      const label = createNode(document, 'span', 'header-label', row.label);
      const actions = createHeaderActionButtons(document, row.actions, applyHeaderAction);
      rowHeader.dataset.row = row.label;
      rowHeader.appendChild(label);
      rowHeader.appendChild(actions);
      elements.rowHeaders[row.index + 1] = rowHeader;
      grid.appendChild(rowHeader);

      row.cells.forEach(function createCell(cell) {
        const cellNode = createNode(document, 'div', 'grid-cell');
        const valueNode = createNode(document, 'div', 'cell-value');
        cellNode.dataset.address = cell.address;
        cellNode.dataset.row = String(cell.row + 1);
        cellNode.dataset.col = String(cell.column + 1);
        cellNode.setAttribute('role', 'gridcell');
        cellNode.setAttribute('aria-label', cell.address);
        cellNode.appendChild(valueNode);
        elements.cellNodes[cell.address] = cellNode;
        grid.appendChild(cellNode);
      });
    });

    sheetViewport.appendChild(grid);
    shell.appendChild(topbar);
    shell.appendChild(sheetViewport);
    mountPoint.replaceChildren(shell);

    function buildDisplayValues(snapshot) {
      const displayValues = Object.create(null);
      if (!formulaModule || typeof formulaModule.createSpreadsheetEngine !== 'function') {
        return displayValues;
      }

      const engine = formulaModule.createSpreadsheetEngine();
      Object.keys(snapshot.cells).forEach(function seedCell(cellId) {
        engine.setCell(cellId, snapshot.cells[cellId].raw);
      });
      Object.keys(snapshot.cells).forEach(function computeCell(cellId) {
        displayValues[cellId] = engine.getDisplayText(cellId);
      });
      return displayValues;
    }

    function createHeaderActionButtons(doc, actions, onAction) {
      const container = createNode(doc, 'div', 'header-actions');

      actions.forEach(function appendAction(action) {
        const button = createNode(doc, 'button', 'header-action-button', action.label[0]);
        button.type = 'button';
        button.title = action.label;
        button.setAttribute('aria-label', action.label);
        button.addEventListener('click', function handleClick(event) {
          event.preventDefault();
          event.stopPropagation();
          onAction(action);
        });
        container.appendChild(button);
      });

      return container;
    }

    function render() {
      const snapshot = store.getSnapshot();
      const bounds = selectionToBounds(snapshot.selection);
      const displayValues = buildDisplayValues(snapshot);
      const activeCellId = snapshot.selection.activeCellId;
      const activeRaw = snapshot.cells[activeCellId] ? snapshot.cells[activeCellId].raw : '';
      const editorState = editController.getEditorState();
      const formulaValue = editorState ? editorState.draft : activeRaw;

      nameBox.textContent = activeCellId;
      formulaText.textContent = formulaValue || FORMULA_PLACEHOLDER;
      formulaText.className = formulaValue ? 'formula-value' : 'formula-placeholder';

      Object.keys(elements.columnHeaders).forEach(function resetColumn(key) {
        elements.columnHeaders[key].className = 'column-header';
      });
      Object.keys(elements.rowHeaders).forEach(function resetRow(key) {
        elements.rowHeaders[key].className = 'row-header';
      });

      elements.columnHeaders[snapshot.selection.active.col].classList.add('active-header');
      elements.rowHeaders[snapshot.selection.active.row].classList.add('active-header');

      Object.keys(elements.cellNodes).forEach(function updateCell(cellId) {
        const cellNode = elements.cellNodes[cellId];
        const valueNode = cellNode.firstChild;
        const coords = WorkbookStoreApi.cellIdToCoords(cellId);
        const cell = { row: coords.row - 1, column: coords.col - 1 };
        const isActive = cellId === activeCellId;
        const inRange = isCellInRange(cell, bounds);
        const display = Object.prototype.hasOwnProperty.call(displayValues, cellId)
          ? displayValues[cellId]
          : (snapshot.cells[cellId] ? snapshot.cells[cellId].raw : '');

        cellNode.className = 'grid-cell';
        cellNode.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (inRange) {
          cellNode.classList.add('in-range');
        }
        if (isActive) {
          cellNode.classList.add('active-cell');
        }
        if (isRangeEdge(cell, bounds, 'top')) {
          cellNode.classList.add('range-top');
        }
        if (isRangeEdge(cell, bounds, 'right')) {
          cellNode.classList.add('range-right');
        }
        if (isRangeEdge(cell, bounds, 'bottom')) {
          cellNode.classList.add('range-bottom');
        }
        if (isRangeEdge(cell, bounds, 'left')) {
          cellNode.classList.add('range-left');
        }
        if (isNumericDisplayValue(display)) {
          cellNode.classList.add('numeric-cell');
        }
        if (typeof display === 'string' && display[0] === '#') {
          cellNode.classList.add('is-error');
        }

        valueNode.textContent = display;
      });

      if (editorState) {
        const editorCellId = WorkbookStoreApi.coordsToCellId(editorState.row, editorState.col);
        const editorCellNode = elements.cellNodes[editorCellId];
        const valueNode = editorCellNode.firstChild;
        editorCellNode.classList.add('editing-cell');
        valueNode.textContent = editorState.draft;
      }
    }

    function applyHeaderAction(action) {
      if (action.type === 'insert-row') {
        store.insertRows(action.index, 1);
      } else if (action.type === 'delete-row') {
        store.deleteRows(action.index, 1);
      } else if (action.type === 'insert-column') {
        store.insertColumns(action.index, 1);
      } else if (action.type === 'delete-column') {
        store.deleteColumns(action.index, 1);
      }

      render();
    }

    function getPointFromTarget(target) {
      if (!target || typeof target.closest !== 'function') {
        return null;
      }
      const cellNode = target.closest('.grid-cell');
      if (!cellNode) {
        return null;
      }
      return {
        row: Number(cellNode.dataset.row),
        col: Number(cellNode.dataset.col),
      };
    }

    function updateRangeSelection(point) {
      if (!dragState) {
        return;
      }
      store.selectRange(dragState.anchor, point, point, dragState.anchor);
      render();
    }

    function stopDragging() {
      dragState = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(event) {
      const point = getPointFromTarget(event.target);
      if (point) {
        updateRangeSelection(point);
      }
    }

    function handleMouseUp() {
      stopDragging();
    }

    function handleMouseDown(event) {
      const point = getPointFromTarget(event.target);
      if (!point) {
        return;
      }
      event.preventDefault();
      if (editController.isEditing()) {
        editController.commitEdit();
      }
      shell.focus();

      const selection = store.getSelection();
      if (event.shiftKey) {
        const anchor = selection.anchor || selection.active;
        store.selectRange(anchor, point, point, anchor);
        render();
        return;
      }

      dragState = { anchor: point };
      store.selectCell(point.row, point.col);
      render();
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    function handleKeyDown(event) {
      if (editController.isEditing()) {
        if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
          event.preventDefault();
          editController.handleEditorKeyDown(event);
          render();
        }
        return;
      }

      if (isPrintableKey(event)) {
        event.preventDefault();
        editController.handleGridKeyDown(event);
        render();
        return;
      }

      const navigation = NAVIGATION_KEYS[event.key];
      if (navigation) {
        event.preventDefault();
        const selection = store.getSelection();
        const nextPoint = clampPoint({
          row: selection.active.row + navigation.row,
          col: selection.active.col + navigation.col,
        });

        if (event.shiftKey) {
          const anchor = selection.anchor || selection.active;
          store.selectRange(anchor, nextPoint, nextPoint, anchor);
        } else {
          store.selectCell(nextPoint.row, nextPoint.col);
        }

        render();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        store.clearSelection();
        render();
      }
    }

    function handleBeforeInput(event) {
      if (!shouldHandleShellInput(shell, document.activeElement)) {
        return;
      }

      if (event.inputType !== 'insertText' && event.inputType !== 'insertCompositionText') {
        return;
      }

      if (!event.data) {
        return;
      }

      event.preventDefault();
      editController.handleTextInput(event.data);
      render();
    }

    function canHandleClipboardEvent() {
      return document.activeElement === shell || shell.contains(document.activeElement);
    }

    function buildClipboardPayload(isCut) {
      const snapshot = store.getSnapshot();
      const selection = store.getSelection();
      const bounds = selectionToBounds(selection);
      const matrix = getSelectionMatrix(snapshot, bounds);
      return {
        cut: isCut,
        range: bounds,
        source: { row: bounds.start.row, col: bounds.start.col },
        matrix,
        text: serializeClipboardMatrix(matrix),
      };
    }

    function handleCopy(event) {
      if (!canHandleClipboardEvent()) {
        return;
      }
      const payload = buildClipboardPayload(false);
      clipboardState = payload;
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', payload.text);
      }
      event.preventDefault();
    }

    function handleCut(event) {
      if (!canHandleClipboardEvent()) {
        return;
      }
      const payload = buildClipboardPayload(true);
      clipboardState = payload;
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', payload.text);
      }
      event.preventDefault();
    }

    function handlePaste(event) {
      if (!canHandleClipboardEvent()) {
        return;
      }

      const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
      const payload = clipboardState && clipboardState.text === text ? clipboardState : null;
      const matrix = payload ? payload.matrix : parseClipboardText(text);
      if (!matrix.length) {
        return;
      }

      const start = getPasteStart(store.getSelection(), matrix);
      if (payload && payload.cut) {
        store.cutSelection(payload.range, start);
        clipboardState = null;
      } else {
        const matrixToPaste = payload
          ? shiftClipboardMatrix(payload.matrix, start.row - payload.source.row, start.col - payload.source.col, shiftFormula)
          : matrix;
        store.pasteBlock(start.row, start.col, matrixToPaste);
      }

      event.preventDefault();
      render();
    }

    shell.addEventListener('mousedown', handleMouseDown);
    shell.addEventListener('keydown', handleKeyDown);
    shell.addEventListener('beforeinput', handleBeforeInput);
    document.addEventListener('keydown', handleDocumentKeyDown);
    document.addEventListener('beforeinput', handleDocumentBeforeInput);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);

    render();

    return {
      render,
      store,
      shell,
      destroy() {
        stopDragging();
        shell.removeEventListener('mousedown', handleMouseDown);
        shell.removeEventListener('keydown', handleKeyDown);
        shell.removeEventListener('beforeinput', handleBeforeInput);
        document.removeEventListener('keydown', handleDocumentKeyDown);
        document.removeEventListener('beforeinput', handleDocumentBeforeInput);
        document.removeEventListener('copy', handleCopy);
        document.removeEventListener('cut', handleCut);
        document.removeEventListener('paste', handlePaste);
      },
    };
  }

  function renderSpreadsheet(document, options) {
    return createSpreadsheetApp(document, options);
  }

  const api = {
    SHEET_COLUMNS,
    SHEET_ROWS,
    buildSurfaceModel,
    createEditController,
    createSpreadsheetApp,
    getColumnLabel,
    getPasteStart,
    getSelectionMatrix,
    parseClipboardText,
    renderSpreadsheet,
    selectionToBounds,
    shouldHandleShellInput,
    serializeClipboardMatrix,
    shiftClipboardMatrix,
  };

  if (typeof document !== 'undefined') {
    renderSpreadsheet(document);
  }

  return api;
});
    function handleDocumentKeyDown(event) {
      if (event.defaultPrevented || !shouldHandleShellInput(shell, document.activeElement)) {
        return;
      }
      handleKeyDown(event);
    }

    function handleDocumentBeforeInput(event) {
      if (event.defaultPrevented || !shouldHandleShellInput(shell, document.activeElement)) {
        return;
      }
      handleBeforeInput(event);
    }
