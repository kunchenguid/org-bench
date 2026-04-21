(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./app.js'),
      require('./src/spreadsheet-structure.js')
    );
    return;
  }

  root.SpreadsheetEditing = factory(root.SpreadsheetShell || {}, root.SpreadsheetStructure || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (shellApi, structureApi) {
  function selectionToPersistenceSelection(selection) {
    const position = parseCellId(selection.activeCellId);

    return {
      col: position.columnIndex + 1,
      row: position.rowIndex + 1,
    };
  }

  function persistenceSelectionToCellId(selection) {
    if (!selection || !Number.isInteger(selection.col) || !Number.isInteger(selection.row)) {
      return null;
    }

    if (selection.col < 1 || selection.row < 1) {
      return null;
    }

    return cellPositionToId(selection.col - 1, selection.row - 1);
  }

  function resolvePersistence(options) {
    if (options && options.persistence) {
      return options.persistence;
    }

    if (typeof globalThis !== 'undefined' && typeof globalThis.createSpreadsheetPersistence === 'function') {
      return globalThis.createSpreadsheetPersistence({
        namespace: globalThis.__BENCHMARK_RUN_NAMESPACE__,
      });
    }

    return null;
  }

  function loadPersistedState(persistence) {
    if (!persistence || typeof persistence.load !== 'function') {
      return null;
    }

    return persistence.load();
  }

  function createEditingState(options) {
    const settings = options || {};
    const persistedState = settings.persistedState || {};
    const persistedActiveCellId = persistenceSelectionToCellId(persistedState.selection);
    const activeCellId = persistedActiveCellId || settings.activeCellId || 'A1';

    return {
      cells: { ...(persistedState.cells || {}), ...(settings.cells || {}) },
      selection: {
        activeCellId,
        anchorCellId: activeCellId,
        focusCellId: activeCellId,
      },
      mode: 'navigate',
      formulaBarValue: '',
      draftValue: '',
      editing: null,
      columnCount: settings.columnCount || 26,
      rowCount: settings.rowCount || 100,
    };
  }

  function createSpreadsheetEditingController(options) {
    const settings = options || {};
    const persistence = resolvePersistence(settings);
    const persistedState = loadPersistedState(persistence);
    settings.persistedState = persistedState;
    const state = createEditingState(settings);
    const readCell = settings.getCell || function (cellId) {
      const raw = state.cells[cellId] || '';

      return {
        raw: raw,
        display: raw,
      };
    };
    const commitCell = settings.commitCell || function (cellId, raw) {
      if (raw === undefined || raw === null || raw === '') {
        delete state.cells[cellId];
        return;
      }

      state.cells[cellId] = String(raw);
    };

    function persistState() {
      if (!persistence || typeof persistence.save !== 'function') {
        return;
      }

      persistence.save({
        cells: state.cells,
        selection: selectionToPersistenceSelection(state.selection),
      });
    }

    function getCellRawValue(cellId) {
      const cell = readCell(cellId);

      return cell && typeof cell.raw === 'string' ? cell.raw : '';
    }

    function getCellDisplayValue(cellId) {
      const cell = readCell(cellId);

      if (cell && typeof cell.display === 'string') {
        return cell.display;
      }

      return getCellRawValue(cellId);
    }

    function syncFormulaBarValue() {
      state.formulaBarValue = state.mode === 'edit'
        ? state.draftValue
        : getCellRawValue(state.selection.activeCellId);
    }

    function selectCell(cellId) {
      state.selection.activeCellId = cellId;
      state.selection.anchorCellId = cellId;
      state.selection.focusCellId = cellId;
      syncFormulaBarValue();
      persistState();
    }

    function moveSelection(columnDelta, rowDelta) {
      const position = parseCellId(state.selection.activeCellId);
      const nextColumn = clamp(position.columnIndex + columnDelta, 0, state.columnCount - 1);
      const nextRow = clamp(position.rowIndex + rowDelta, 0, state.rowCount - 1);

      selectCell(cellPositionToId(nextColumn, nextRow));
    }

    function beginEdit(source, replacementValue) {
      const editSource = source || 'cell';
      const cellId = state.selection.activeCellId;
      const originalValue = getCellRawValue(cellId);

      state.mode = 'edit';
      state.editing = {
        cellId,
        source: editSource,
        originalValue,
      };
      state.draftValue = replacementValue !== undefined ? replacementValue : originalValue;
      syncFormulaBarValue();
    }

    function updateDraftValue(value) {
      if (state.mode !== 'edit') {
        beginEdit('formula-bar', value);
        return;
      }

      state.draftValue = value;
      syncFormulaBarValue();
    }

    function cancelEdit() {
      if (state.mode !== 'edit') {
        return;
      }

      state.mode = 'navigate';
      state.draftValue = '';
      state.editing = null;
      syncFormulaBarValue();
    }

    function commitEdit(move) {
      if (state.mode !== 'edit') {
        return;
      }

      commitCell(state.editing.cellId, state.draftValue);
      state.mode = 'navigate';
      state.draftValue = '';
      state.editing = null;

      if (move === 'down') {
        moveSelection(0, 1);
        return;
      }

      if (move === 'right') {
        moveSelection(1, 0);
        return;
      }

      syncFormulaBarValue();
      persistState();
    }

    function handleKeyDown(event) {
      const key = event.key;

      if (state.mode === 'edit') {
        if (key === 'Enter') {
          commitEdit('down');
        } else if (key === 'Tab') {
          commitEdit('right');
        } else if (key === 'Escape') {
          cancelEdit();
        }
        return;
      }

      if (key === 'Enter' || key === 'F2') {
        beginEdit('cell');
        return;
      }

      if (key === 'ArrowLeft') {
        moveSelection(-1, 0);
      } else if (key === 'ArrowRight') {
        moveSelection(1, 0);
      } else if (key === 'ArrowUp') {
        moveSelection(0, -1);
      } else if (key === 'ArrowDown') {
        moveSelection(0, 1);
      }
    }

    function handleTextInput(text) {
      beginEdit('cell', text);
    }

    function getState() {
      return {
        cells: { ...state.cells },
        selection: { ...state.selection },
        mode: state.mode,
        formulaBarValue: state.formulaBarValue,
        draftValue: state.draftValue,
        editing: state.editing ? { ...state.editing } : null,
        columnCount: state.columnCount,
        rowCount: state.rowCount,
      };
    }

    function applyStructureAction(action) {
      const currentCells = collectCellMap();
      const nextGridSize = getNextGridSize(action);
      state.cells = structureApi.applyStructureOperation(currentCells, action);
      rewriteCommittedCells(currentCells, state.cells);
      state.columnCount = nextGridSize.columnCount;
      state.rowCount = nextGridSize.rowCount;
      state.selection.activeCellId = rewriteSelectionCellId(state.selection.activeCellId, action, nextGridSize);
      state.selection.anchorCellId = rewriteSelectionCellId(state.selection.anchorCellId, action, nextGridSize);
      state.selection.focusCellId = rewriteSelectionCellId(state.selection.focusCellId, action, nextGridSize);
      syncFormulaBarValue();
    }

    function collectCellMap() {
      const cells = {};
      let rowIndex;
      let columnIndex;

      for (rowIndex = 0; rowIndex < state.rowCount; rowIndex += 1) {
        for (columnIndex = 0; columnIndex < state.columnCount; columnIndex += 1) {
          const cellId = cellPositionToId(columnIndex, rowIndex);
          const raw = getCellRawValue(cellId);
          if (raw !== '') {
            cells[cellId] = raw;
          }
        }
      }

      return cells;
    }

    function rewriteCommittedCells(existingCells, nextCells) {
      Object.keys(existingCells).forEach(function (cellId) {
        commitCell(cellId, '');
      });

      Object.keys(nextCells).forEach(function (cellId) {
        commitCell(cellId, nextCells[cellId]);
      });
    }

    function getNextGridSize(action) {
      switch (action.type) {
        case 'insert-row':
          return { columnCount: state.columnCount, rowCount: state.rowCount + 1 };
        case 'delete-row':
          return { columnCount: state.columnCount, rowCount: Math.max(1, state.rowCount - 1) };
        case 'insert-column':
          return { columnCount: state.columnCount + 1, rowCount: state.rowCount };
        case 'delete-column':
          return { columnCount: Math.max(1, state.columnCount - 1), rowCount: state.rowCount };
        default:
          throw new Error(`Unsupported structure action: ${action.type}`);
      }
    }

    function rewriteSelectionCellId(cellId, action, nextGridSize) {
      const rewritten = structureApi.applyStructureOperation({ [cellId]: '__selected__' }, action);
      const nextCellId = Object.keys(rewritten)[0];
      if (nextCellId) {
        return nextCellId;
      }

      const position = parseCellId(cellId);
      return cellPositionToId(
        clamp(position.columnIndex, 0, nextGridSize.columnCount - 1),
        clamp(position.rowIndex, 0, nextGridSize.rowCount - 1)
      );
    }

    syncFormulaBarValue();

    return {
      getState,
      getCellRawValue,
      getCellDisplayValue,
      selectCell,
      beginEdit,
      beginFormulaBarEdit: function () {
        beginEdit('formula-bar');
      },
      updateDraftValue,
      handleTextInput,
      commitEdit,
      cancelEdit,
      handleKeyDown,
      applyStructureAction,
    };
  }

  function attachSpreadsheetEditing(doc, options) {
    if (!doc) {
      return null;
    }

    const settings = options || {};
    const formulaEngine = typeof globalThis !== 'undefined' ? globalThis.SpreadsheetFormulaEngine : null;
    const workbook = formulaEngine && typeof formulaEngine.createWorkbook === 'function'
      ? formulaEngine.createWorkbook()
      : null;
    const formulaInput = doc.getElementById('formula-input');
    const initialCell = doc.querySelector('.grid-cell.active') || doc.querySelector('.grid-cell');
    const persistence = resolvePersistence(settings);
    const controller = createSpreadsheetEditingController({
      activeCellId: initialCell ? initialCell.dataset.cellId : 'A1',
      columnCount: settings.columnCount || doc.querySelectorAll('.column-header').length || 26,
      rowCount: settings.rowCount || doc.querySelectorAll('.row-header').length || 100,
      getCell: workbook ? function (cellId) {
        return workbook.getCell(cellId);
      } : undefined,
      commitCell: workbook ? function (cellId, raw) {
        workbook.setCell(cellId, raw);
      } : undefined,
      persistence,
    });

    function syncDom() {
      const state = controller.getState();
      const activeCellId = state.selection.activeCellId;
      const activeColumn = activeCellId.replace(/[0-9]/g, '');
      const activeRow = activeCellId.replace(/[^0-9]/g, '');

      doc.querySelectorAll('.grid-cell.active, .column-header.active, .row-header.active').forEach(function (node) {
        node.classList.remove('active');
        if (node.classList.contains('grid-cell')) {
          node.setAttribute('aria-selected', 'false');
        }
      });

      doc.querySelectorAll('.grid-cell').forEach(function (cell) {
        const content = cell.querySelector('.grid-cell-content');
        if (content) {
          content.textContent = controller.getCellDisplayValue(cell.dataset.cellId);
        }
      });

      const activeCell = doc.querySelector(`[data-cell-id="${activeCellId}"]`);
      if (activeCell) {
        activeCell.classList.add('active');
        activeCell.setAttribute('aria-selected', 'true');
      }

      const columnHeader = doc.querySelector(`[data-column="${activeColumn}"]`);
      if (columnHeader) {
        columnHeader.classList.add('active');
      }

      const rowHeader = doc.querySelector(`[data-row="${activeRow}"]`);
      if (rowHeader) {
        rowHeader.classList.add('active');
      }

      const nameBox = doc.getElementById('name-box');
      if (nameBox) {
        nameBox.textContent = activeCellId;
      }

      if (formulaInput) {
        formulaInput.value = state.formulaBarValue;
      }
    }

    function rerenderGrid() {
      if (!shellApi || typeof shellApi.createSpreadsheetShellModel !== 'function' || typeof shellApi.renderSpreadsheetShell !== 'function') {
        return;
      }

      shellApi.renderSpreadsheetShell(
        doc,
        shellApi.createSpreadsheetShellModel({
          columnCount: controller.getState().columnCount,
          rowCount: controller.getState().rowCount,
        }),
        controller.getState()
      );
    }

    function closeHeaderMenus() {
      doc.querySelectorAll('.header-actions.is-open').forEach(function (node) {
        node.classList.remove('is-open');

        const toggle = node.querySelector('.header-action-toggle');
        const menu = node.querySelector('.header-action-menu');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
        }
        if (menu) {
          menu.hidden = true;
        }
      });
    }

    function toggleHeaderMenu(container) {
      const toggle = container.querySelector('.header-action-toggle');
      const menu = container.querySelector('.header-action-menu');
      const shouldOpen = !container.classList.contains('is-open');

      closeHeaderMenus();

      if (!shouldOpen) {
        return;
      }

      container.classList.add('is-open');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
      }
      if (menu) {
        menu.hidden = false;
      }
    }

    function focusFormulaInput() {
      if (!formulaInput) {
        return;
      }

      formulaInput.focus();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    }

    doc.addEventListener('click', function (event) {
      const actionToggle = event.target.closest('.header-action-toggle');
      if (actionToggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleHeaderMenu(actionToggle.closest('.header-actions'));
        return;
      }

      const structureAction = event.target.closest('.structure-action');
      if (structureAction) {
        const header = structureAction.closest('.column-header, .row-header');
        const action = header ? resolveStructureAction(header, structureAction.dataset.action, controller.getState()) : null;

        event.preventDefault();
        event.stopPropagation();

        if (!action) {
          closeHeaderMenus();
          return;
        }

        controller.applyStructureAction(action);
        rerenderGrid();
        syncDom();
        closeHeaderMenus();
        focusActiveCell(doc, controller.getState().selection.activeCellId);
        return;
      }

      if (!event.target.closest('.header-actions')) {
        closeHeaderMenus();
      }

      const cell = event.target.closest('.grid-cell');
      if (!cell) {
        return;
      }

      controller.selectCell(cell.dataset.cellId);
      syncDom();
    });

    doc.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('.grid-cell');
      if (!cell) {
        return;
      }

      controller.selectCell(cell.dataset.cellId);
      controller.beginEdit('cell');
      syncDom();
      focusFormulaInput();
    });

    doc.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.target === formulaInput) {
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        controller.handleTextInput(event.key);
        syncDom();
        focusFormulaInput();
        return;
      }

      if (!isNavigationKey(event.key) && event.key !== 'Enter' && event.key !== 'F2' && event.key !== 'Tab' && event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      controller.handleKeyDown({ key: event.key });
      syncDom();

      if (controller.getState().mode === 'edit') {
        focusFormulaInput();
      } else {
        focusActiveCell(doc, controller.getState().selection.activeCellId);
      }
    });

    if (formulaInput) {
      formulaInput.addEventListener('focus', function () {
        if (controller.getState().mode !== 'edit') {
          controller.beginFormulaBarEdit();
          syncDom();
        }
      });

      formulaInput.addEventListener('input', function () {
        controller.updateDraftValue(formulaInput.value);
        syncDom();
      });

      formulaInput.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== 'Tab' && event.key !== 'Escape') {
          return;
        }

        event.preventDefault();

        if (event.key === 'Escape') {
          controller.cancelEdit();
        } else if (event.key === 'Enter') {
          controller.commitEdit('down');
        } else {
          controller.commitEdit('right');
        }

        syncDom();
        focusActiveCell(doc, controller.getState().selection.activeCellId);
      });
    }

    syncDom();
    return controller;
  }

  function focusActiveCell(doc, cellId) {
    const cell = doc.querySelector(`[data-cell-id="${cellId}"]`);
    if (cell) {
      cell.focus();
    }
  }

  function resolveStructureAction(header, action, state) {
    const kind = header.dataset.structureKind;
    const index = Number(header.dataset.structureIndex);

    if (!kind || !index) {
      return null;
    }

    if (action === 'insert-before') {
      return { type: `insert-${kind}`, index };
    }

    if (action === 'insert-after') {
      return { type: `insert-${kind}`, index: index + 1 };
    }

    if (action === 'delete') {
      if ((kind === 'row' && state.rowCount <= 1) || (kind === 'column' && state.columnCount <= 1)) {
        return null;
      }

      return { type: `delete-${kind}`, index };
    }

    return null;
  }

  function isNavigationKey(key) {
    return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
  }

  function parseCellId(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    let columnIndex = 0;
    let index;

    if (!match) {
      throw new Error(`Invalid cell id: ${cellId}`);
    }

    for (index = 0; index < match[1].length; index += 1) {
      columnIndex = (columnIndex * 26) + (match[1].charCodeAt(index) - 64);
    }

    return {
      columnIndex: columnIndex - 1,
      rowIndex: Number(match[2]) - 1,
    };
  }

  function cellPositionToId(columnIndex, rowIndex) {
    return `${columnIndexToLabel(columnIndex)}${rowIndex + 1}`;
  }

  function columnIndexToLabel(index) {
    if (shellApi && typeof shellApi.columnIndexToLabel === 'function') {
      return shellApi.columnIndexToLabel(index);
    }

    let value = index + 1;
    let label = '';

    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }

    return label;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        attachSpreadsheetEditing(document);
      }, { once: true });
    } else {
      attachSpreadsheetEditing(document);
    }
  }

  return {
    createSpreadsheetEditingController,
    attachSpreadsheetEditing,
    resolveStructureAction,
  };
});
