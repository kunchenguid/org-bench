'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./spreadsheet-store.js'), require('./clipboard.js'));
    return;
  }

  root.SpreadsheetEditing = factory(root.SpreadsheetStore, root.SpreadsheetClipboard);
})(typeof globalThis !== 'undefined' ? globalThis : window, function (SpreadsheetStore, SpreadsheetClipboard) {
  const MAX_ROWS = 100;
  const MAX_COLUMNS = 26;

  function createEditingController(options) {
    const store = options.store;
    const maxRows = options && options.maxRows ? options.maxRows : MAX_ROWS;
    const maxColumns = options && options.maxColumns ? options.maxColumns : MAX_COLUMNS;
    const listeners = new Set();
    const editing = {
      active: false,
      source: 'cell',
      cellId: pointToCellId(store.getSnapshot().activeCell),
      draft: '',
      originalRaw: '',
    };

    function getViewModel() {
      const snapshot = store.getSnapshot();
      const activeCell = clampPoint(snapshot.activeCell, maxRows, maxColumns);
      const activeCellId = pointToCellId(activeCell);

      return {
        activeCell,
        activeCellId,
        selection: snapshot.selection,
        editing: {
          active: editing.active,
          source: editing.source,
          cellId: editing.cellId || activeCellId,
          draft: editing.draft,
        },
      };
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    function notify(reason) {
      const viewModel = getViewModel();
      for (const listener of listeners) {
        listener(viewModel, reason);
      }
    }

    function selectCell(point) {
      const nextPoint = clampPoint(point, maxRows, maxColumns);
      store.setActiveCell(nextPoint);
      store.setSelection({
        anchor: nextPoint,
        focus: nextPoint,
      });
      notify('select');
    }

    function beginEdit(options) {
      const viewModel = getViewModel();
      const source = options && options.source ? options.source : 'cell';
      const cellId = viewModel.activeCellId;
      const raw = store.getRawCell(cellId);

      editing.active = true;
      editing.source = source;
      editing.cellId = cellId;
      editing.draft = raw;
      editing.originalRaw = raw;
      notify('begin-edit');
    }

    function replaceSelectionWithText(text) {
      const viewModel = getViewModel();
      editing.active = true;
      editing.source = 'cell';
      editing.cellId = viewModel.activeCellId;
      editing.originalRaw = store.getRawCell(viewModel.activeCellId);
      editing.draft = String(text);
      notify('replace-selection');
    }

    function updateDraft(value) {
      if (!editing.active) {
        beginEdit({ source: 'formula' });
      }

      editing.draft = String(value);
      notify('update-draft');
    }

    function cancelEdit() {
      if (!editing.active) {
        return false;
      }

      resetEditingState();
      notify('cancel-edit');
      return true;
    }

    function commitEdit(options) {
      if (!editing.active) {
        return false;
      }

      const move = options && options.move ? options.move : 'none';
      const cellId = editing.cellId || getViewModel().activeCellId;
      const point = cellIdToPoint(cellId);
      const nextPoint = movePoint(point, move, maxRows, maxColumns);

      store.setCell(cellId, editing.draft, { label: 'edit' });
      store.setActiveCell(nextPoint);
      store.setSelection({
        anchor: nextPoint,
        focus: nextPoint,
      });
      resetEditingState();
      notify('commit-edit');
      return true;
    }

    function moveSelection(direction) {
      const snapshot = store.getSnapshot();
      const nextPoint = movePoint(snapshot.activeCell, direction, maxRows, maxColumns);
      store.setActiveCell(nextPoint);
      store.setSelection({
        anchor: nextPoint,
        focus: nextPoint,
      });
      notify('move-selection');
    }

    function getFormulaBarText() {
      const viewModel = getViewModel();
      if (editing.active) {
        return editing.draft;
      }
      return store.getRawCell(viewModel.activeCellId);
    }

    function resetEditingState() {
      editing.active = false;
      editing.source = 'cell';
      editing.cellId = getViewModel().activeCellId;
      editing.draft = '';
      editing.originalRaw = '';
    }

    return {
      subscribe,
      getViewModel,
      getFormulaBarText,
      selectCell,
      beginEdit,
      replaceSelectionWithText,
      updateDraft,
      cancelEdit,
      commitEdit,
      moveSelection,
    };
  }

  function mountSpreadsheetEditing(options) {
    if (!SpreadsheetStore || !SpreadsheetStore.createSpreadsheetStore) {
      return null;
    }

    const rootNode = options && options.root ? options.root : document;
    const formulaInput = rootNode.querySelector('[data-formula-input]');
    const cellGrid = rootNode.querySelector('[data-cell-grid]');
    const nameBox = rootNode.querySelector('.name-box');
    if (!formulaInput || !cellGrid || !nameBox) {
      return null;
    }

    const namespace =
      options && options.namespace
        ? options.namespace
        : root.__APPLE_BENCH_STORAGE_NS__ || 'spreadsheet';
    const sharedShell = rootNode.__sheetGridUi || root.sheetGridUi;
    const store =
      options && options.store
        ? options.store
        : sharedShell && sharedShell.store
          ? sharedShell.store
          : SpreadsheetStore.createSpreadsheetStore({ namespace: namespace });
    const controller = createEditingController({ store: store });
    const cells = Array.from(cellGrid.querySelectorAll('.cell'));
    let activeEditor = null;
    let suppressBlurCommit = false;

    function render() {
      const viewModel = controller.getViewModel();
      nameBox.textContent = viewModel.activeCellId;
      if (document.activeElement !== formulaInput || !viewModel.editing.active || viewModel.editing.source !== 'formula') {
        formulaInput.value = controller.getFormulaBarText();
      }

      for (const cell of cells) {
        const cellId = cell.dataset.cell;
        const raw = store.getRawCell(cellId);
        const isActive = cellId === viewModel.activeCellId;
        const isEditing = viewModel.editing.active && viewModel.editing.source === 'cell' && viewModel.editing.cellId === cellId;

        cell.classList.toggle('is-active', isActive);
        cell.classList.toggle('is-editing', isEditing);

        if (isEditing) {
          renderEditor(cell, viewModel.editing.draft);
        } else {
          if (activeEditor && activeEditor.parentNode === cell) {
            activeEditor = null;
          }
          cell.textContent = raw;
        }
      }
    }

    function renderEditor(cell, value) {
      if (!activeEditor || activeEditor.parentNode !== cell) {
        cell.textContent = '';
        activeEditor = document.createElement('input');
        activeEditor.type = 'text';
        activeEditor.className = 'cell-editor';
        activeEditor.spellcheck = false;
        activeEditor.addEventListener('input', onCellEditorInput);
        activeEditor.addEventListener('keydown', onCellEditorKeyDown);
        activeEditor.addEventListener('blur', onCellEditorBlur);
        cell.appendChild(activeEditor);
      }

      activeEditor.value = value;
      if (document.activeElement !== activeEditor) {
        activeEditor.focus();
        activeEditor.setSelectionRange(activeEditor.value.length, activeEditor.value.length);
      }
    }

    function onCellEditorInput(event) {
      controller.updateDraft(event.currentTarget.value);
      formulaInput.value = controller.getFormulaBarText();
    }

    function onCellEditorKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        controller.cancelEdit();
        render();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        controller.commitEdit({ move: 'down' });
        render();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        controller.commitEdit({ move: 'right' });
        render();
      }
    }

    function onCellEditorBlur() {
      if (suppressBlurCommit) {
        suppressBlurCommit = false;
        return;
      }

      if (controller.getViewModel().editing.active) {
        controller.commitEdit({ move: 'none' });
        render();
      }
    }

    for (const cell of cells) {
      cell.addEventListener('click', function () {
        const point = {
          row: Number(cell.dataset.row) - 1,
          col: columnLabelToIndex(cell.dataset.column),
        };

        if (controller.getViewModel().editing.active) {
          controller.commitEdit({ move: 'none' });
        }
        controller.selectCell(point);
        render();
      });

      cell.addEventListener('dblclick', function () {
        controller.selectCell({
          row: Number(cell.dataset.row) - 1,
          col: columnLabelToIndex(cell.dataset.column),
        });
        controller.beginEdit({ source: 'cell' });
        render();
      });
    }

    formulaInput.addEventListener('focus', function () {
      suppressBlurCommit = true;
      if (!controller.getViewModel().editing.active) {
        controller.beginEdit({ source: 'formula' });
      }
      render();
    });

    formulaInput.addEventListener('input', function (event) {
      controller.updateDraft(event.currentTarget.value);
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        controller.cancelEdit();
        render();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        controller.commitEdit({ move: 'down' });
        render();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        controller.commitEdit({ move: 'right' });
        render();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.target === formulaInput || event.target === activeEditor) {
        return;
      }

      if (handleClearShortcut(event, { store: store, controller: controller, render: render })) {
        return;
      }

      if (event.key === 'F2' || event.key === 'Enter') {
        event.preventDefault();
        controller.beginEdit({ source: 'cell' });
        render();
        return;
      }

      if (isPlainTypingKey(event)) {
        event.preventDefault();
        controller.replaceSelectionWithText(event.key);
        render();
        return;
      }

      const move = keyToDirection(event.key);
      if (!move) {
        return;
      }

      event.preventDefault();
      controller.moveSelection(move);
      render();
    });

    document.addEventListener('copy', function (event) {
      handleClipboardEvent(event, { store: store, controller: controller, render: render, clipboardApi: SpreadsheetClipboard });
    });

    document.addEventListener('cut', function (event) {
      handleClipboardEvent(event, { store: store, controller: controller, render: render, clipboardApi: SpreadsheetClipboard });
    });

    document.addEventListener('paste', function (event) {
      handleClipboardEvent(event, { store: store, controller: controller, render: render, clipboardApi: SpreadsheetClipboard });
    });

    render();
    return {
      store: store,
      controller: controller,
      render: render,
    };
  }

  function keyToDirection(key) {
    if (key === 'ArrowUp') {
      return 'up';
    }
    if (key === 'ArrowDown') {
      return 'down';
    }
    if (key === 'ArrowLeft') {
      return 'left';
    }
    if (key === 'ArrowRight') {
      return 'right';
    }
    return null;
  }

  function isPlainTypingKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  function handleClipboardEvent(event, options) {
    const clipboardApi = resolveClipboardApi(options && options.clipboardApi);
    const controller = options && options.controller;
    const store = options && options.store;
    const render = options && options.render;

    if (!clipboardApi || !controller || !store || controller.getViewModel().editing.active) {
      return false;
    }

    if (event.type === 'copy' || event.type === 'cut') {
      const payload = clipboardApi.buildClipboardPayload(
        store.getSnapshot(),
        store.getSnapshot().selection,
        event.type
      );
      if (!clipboardApi.writeClipboardData(event.clipboardData, payload)) {
        return false;
      }
      event.preventDefault();
      if (typeof render === 'function') {
        render();
      }
      return true;
    }

    if (event.type === 'paste') {
      const payload = clipboardApi.readClipboardData(event.clipboardData);
      if (!payload) {
        return false;
      }
      event.preventDefault();
      const changed = clipboardApi.applyClipboardPaste(store, payload, store.getSnapshot().selection);
      if (changed && typeof render === 'function') {
        render();
      }
      return changed;
    }

    return false;
  }

  function handleClearShortcut(event, options) {
    const clipboardApi = resolveClipboardApi(options && options.clipboardApi);
    const controller = options && options.controller;
    const store = options && options.store;
    const render = options && options.render;

    if (!clipboardApi || !controller || !store || controller.getViewModel().editing.active) {
      return false;
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return false;
    }

    event.preventDefault();
    const changed = clipboardApi.clearSelectedRange(store, store.getSnapshot().selection);
    if (changed && typeof render === 'function') {
      render();
    }
    return changed;
  }

  function resolveClipboardApi(override) {
    if (override) {
      return override;
    }
    return SpreadsheetClipboard;
  }

  function movePoint(point, direction, maxRows, maxColumns) {
    const next = clampPoint(point, maxRows, maxColumns);
    if (direction === 'up') {
      return { row: clamp(next.row - 1, 0, maxRows - 1), col: next.col };
    }
    if (direction === 'down') {
      return { row: clamp(next.row + 1, 0, maxRows - 1), col: next.col };
    }
    if (direction === 'left') {
      return { row: next.row, col: clamp(next.col - 1, 0, maxColumns - 1) };
    }
    if (direction === 'right') {
      return { row: next.row, col: clamp(next.col + 1, 0, maxColumns - 1) };
    }
    return next;
  }

  function clampPoint(point, maxRows, maxColumns) {
    return {
      row: clamp(point.row, 0, maxRows - 1),
      col: clamp(point.col, 0, maxColumns - 1),
    };
  }

  function pointToCellId(point) {
    return indexToColumnLabel(point.col) + String(point.row + 1);
  }

  function cellIdToPoint(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    if (!match) {
      throw new Error('Invalid cell id: ' + cellId);
    }

    return {
      row: Number(match[2]) - 1,
      col: columnLabelToIndex(match[1]),
    };
  }

  function columnLabelToIndex(label) {
    let value = 0;
    for (let index = 0; index < label.length; index += 1) {
      value = value * 26 + (label.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function indexToColumnLabel(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  const api = {
    createEditingController,
    mountSpreadsheetEditing,
    handleClipboardEvent,
    handleClearShortcut,
    pointToCellId,
    cellIdToPoint,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        mountSpreadsheetEditing();
      });
    } else {
      mountSpreadsheetEditing();
    }
  }

  return api;
});
