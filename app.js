(function (global) {
  const ROW_COUNT = 100;
  const COL_COUNT = 26;

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function cellAddress(row, col) {
    return columnLabel(col) + String(row + 1);
  }

  function createGridApp(root, store) {
    const SelectionModel = global.SelectionModel;
    const dimensionState = store.getDimensions ? store.getDimensions() : { rowCount: ROW_COUNT, colCount: COL_COUNT };
    const rowCount = dimensionState.rowCount;
    const colCount = dimensionState.colCount;

    const shell = document.createElement('div');
    shell.className = 'app-shell';

    const chrome = document.createElement('div');
    chrome.className = 'formula-shell';

    const nameBox = document.createElement('div');
    nameBox.className = 'name-box';

    const formulaBar = document.createElement('div');
    formulaBar.className = 'formula-bar-placeholder';
    formulaBar.textContent = 'Grid interaction slice only';

    chrome.appendChild(nameBox);
    chrome.appendChild(formulaBar);
    shell.appendChild(chrome);

    const gridViewport = document.createElement('div');
    gridViewport.className = 'grid-viewport';
    gridViewport.tabIndex = 0;
    gridViewport.setAttribute('role', 'grid');
    shell.appendChild(gridViewport);

    const table = document.createElement('div');
    table.className = 'grid-table';
    table.style.setProperty('--column-count', String(colCount));
    gridViewport.appendChild(table);

    const cellElements = [];

    const corner = document.createElement('div');
    corner.className = 'corner-cell sticky-row sticky-col';
    table.appendChild(corner);

    for (let col = 0; col < colCount; col += 1) {
      const header = document.createElement('div');
      header.className = 'column-header sticky-row';
      header.textContent = columnLabel(col);
      table.appendChild(header);
    }

    for (let row = 0; row < rowCount; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header sticky-col';
      rowHeader.textContent = String(row + 1);
      table.appendChild(rowHeader);

      const rowCells = [];
      cellElements.push(rowCells);

      for (let col = 0; col < colCount; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'grid-cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', cellAddress(row, col));
        cell.addEventListener('click', function (event) {
          store.setActiveCell(row, col, { extend: event.shiftKey });
          gridViewport.focus();
        });
        table.appendChild(cell);
        rowCells.push(cell);
      }
    }

    function scrollActiveCellIntoView(selection) {
      const active = cellElements[selection.active.row][selection.active.col];
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function renderSelection(selection) {
      const range = SelectionModel.normalizeRange(selection);
      nameBox.textContent = cellAddress(selection.active.row, selection.active.col);

      for (let row = 0; row < rowCount; row += 1) {
        for (let col = 0; col < colCount; col += 1) {
          const cell = cellElements[row][col];
          const inRange = row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
          const isActive = row === selection.active.row && col === selection.active.col;
          cell.classList.toggle('is-selected', inRange);
          cell.classList.toggle('is-active', isActive);
          cell.setAttribute('aria-selected', inRange ? 'true' : 'false');
        }
      }

      scrollActiveCellIntoView(selection);
    }

    gridViewport.addEventListener('keydown', function (event) {
      const keymap = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };

      if (!Object.prototype.hasOwnProperty.call(keymap, event.key)) {
        return;
      }

      const deltas = keymap[event.key];
      event.preventDefault();
      store.moveActiveCell(deltas[0], deltas[1], { extend: event.shiftKey });
    });

    store.subscribe(renderSelection);
    renderSelection(store.getSelection());

    root.innerHTML = '';
    root.appendChild(shell);
    gridViewport.focus();
  }

  function boot() {
    const root = document.getElementById('app');
    if (!root) {
      return;
    }

    const externalStore = global.sharedSpreadsheetStore;
    const store = externalStore || global.SelectionModel.createSelectionStore({ rowCount: ROW_COUNT, colCount: COL_COUNT });
    createGridApp(root, store);
  }

  global.GridApp = {
    createGridApp: createGridApp,
    boot: boot,
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', boot);
  }
})(window);
