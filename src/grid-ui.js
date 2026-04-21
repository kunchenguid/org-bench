'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.SpreadsheetStore, root.GridSelection);
    return;
  }

  root.GridUI = factory(root.SpreadsheetStore, root.GridSelection);
})(typeof globalThis !== 'undefined' ? globalThis : window, function (SpreadsheetStore, GridSelection) {
  const ROW_COUNT = 100;
  const COL_COUNT = 26;
  const KEY_DELTAS = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function cellIdFromPoint(point) {
    return columnLabel(point.col) + String(point.row + 1);
  }

  function pointFromCellId(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    if (!match) {
      return { row: 0, col: 0 };
    }

    return {
      row: Number(match[2]) - 1,
      col: match[1].charCodeAt(0) - 65,
    };
  }

  function getStorageNamespace() {
    return (
      root.__SPREADSHEET_STORAGE_NAMESPACE__ ||
      root.__RUN_STORAGE_NAMESPACE__ ||
      root.__BENCHMARK_STORAGE_NAMESPACE__ ||
      'spreadsheet'
    );
  }

  function resolveDisplayValue(store, cellId) {
    const computed = store.getComputedCell(cellId);
    if (computed && Object.prototype.hasOwnProperty.call(computed, 'display')) {
      return computed.display;
    }
    if (computed && Object.prototype.hasOwnProperty.call(computed, 'value')) {
      return String(computed.value);
    }
    return store.getRawCell(cellId);
  }

  function buildGrid(rootElement, store) {
    const columnHeaders = rootElement.querySelector('[data-column-headers]');
    const rowHeaders = rootElement.querySelector('[data-row-headers]');
    const cellGrid = rootElement.querySelector('[data-cell-grid]');
    const nameBox = rootElement.querySelector('.name-box');
    const formulaInput = rootElement.querySelector('[data-formula-input]');

    if (!columnHeaders || !rowHeaders || !cellGrid || !nameBox || !formulaInput) {
      return null;
    }

    columnHeaders.textContent = '';
    rowHeaders.textContent = '';
    cellGrid.textContent = '';

    const cellElements = [];

    for (let col = 0; col < COL_COUNT; col += 1) {
      const header = document.createElement('div');
      header.className = 'column-header';
      header.dataset.column = columnLabel(col);
      header.textContent = columnLabel(col);
      columnHeaders.appendChild(header);
    }

    for (let row = 0; row < ROW_COUNT; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.dataset.row = String(row + 1);
      rowHeader.textContent = String(row + 1);
      rowHeaders.appendChild(rowHeader);

      const rowCells = [];
      cellElements.push(rowCells);

      for (let col = 0; col < COL_COUNT; col += 1) {
        const point = { row, col };
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.cell = cellIdFromPoint(point);
        cell.dataset.column = columnLabel(col);
        cell.dataset.row = String(row + 1);
        cell.role = 'gridcell';
        cell.tabIndex = -1;
        cell.setAttribute('aria-label', cellIdFromPoint(point));
        cell.addEventListener('mousedown', function (event) {
          event.preventDefault();
        });
        cell.addEventListener('click', function (event) {
          rootElement.__selectionController.selectCell(point, { extend: event.shiftKey });
          cellGrid.focus();
        });
        cellGrid.appendChild(cell);
        rowCells.push(cell);
      }
    }

    return {
      columnHeaders,
      rowHeaders,
      cellGrid,
      cellElements,
      nameBox,
      formulaInput,
    };
  }

  function renderGrid(view, store) {
    const snapshot = store.getSnapshot();
    const range = GridSelection.normalizeSelectionRange(snapshot.selection);
    const activeId = cellIdFromPoint(snapshot.activeCell);

    view.nameBox.textContent = activeId;
    view.formulaInput.value = store.getRawCell(activeId);
    view.cellGrid.setAttribute('aria-activedescendant', activeId);

    for (let row = 0; row < ROW_COUNT; row += 1) {
      for (let col = 0; col < COL_COUNT; col += 1) {
        const cell = view.cellElements[row][col];
        const cellId = cell.dataset.cell;
        const inRange = row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
        const isActive = row === snapshot.activeCell.row && col === snapshot.activeCell.col;

        cell.textContent = resolveDisplayValue(store, cellId);
        cell.id = cellId;
        cell.classList.toggle('is-in-range', inRange);
        cell.classList.toggle('is-active', isActive);
        cell.setAttribute('aria-selected', inRange ? 'true' : 'false');
      }
    }

    const activePoint = pointFromCellId(activeId);
    view.cellElements[activePoint.row][activePoint.col].scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }

  function installKeyboardNavigation(cellGrid, controller) {
    cellGrid.addEventListener('keydown', function (event) {
      if (!Object.prototype.hasOwnProperty.call(KEY_DELTAS, event.key)) {
        return;
      }

      event.preventDefault();
      const delta = KEY_DELTAS[event.key];
      controller.moveActiveCell(delta[0], delta[1], { extend: event.shiftKey });
    });
  }

  function mount(rootElement, options) {
    if (!SpreadsheetStore || !GridSelection || !rootElement) {
      return null;
    }

    const store =
      options && options.store
        ? options.store
        : SpreadsheetStore.createSpreadsheetStore({ namespace: getStorageNamespace() });
    const controller = GridSelection.createSelectionController(store, {
      rowCount: ROW_COUNT,
      colCount: COL_COUNT,
    });
    const view = buildGrid(rootElement, store);

    if (!view) {
      return null;
    }

    rootElement.__selectionController = controller;
    installKeyboardNavigation(view.cellGrid, controller);
    store.subscribe(function () {
      renderGrid(view, store);
    });
    renderGrid(view, store);
    view.cellGrid.focus();

    return { store, controller, view };
  }

  function boot() {
    mount(document);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', boot);
  }

  return {
    mount,
    cellIdFromPoint,
    pointFromCellId,
  };
});
