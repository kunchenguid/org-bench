(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetShell = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GRID_COLUMNS = 26;
  const GRID_ROWS = 100;

  function columnIndexToLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function createSpreadsheetShellModel() {
    const columns = Array.from({ length: GRID_COLUMNS }, function (_, index) {
      return { index, label: columnIndexToLabel(index) };
    });

    const rows = Array.from({ length: GRID_ROWS }, function (_, rowIndex) {
      const displayIndex = rowIndex + 1;

      return {
        index: displayIndex,
        cells: columns.map(function (column) {
          return {
            id: `${column.label}${displayIndex}`,
            columnIndex: column.index,
            rowIndex,
            raw: '',
          };
        }),
      };
    });

    return { columns, rows };
  }

  function createInitialShellState() {
    return {
      selection: {
        activeCellId: 'A1',
        anchorCellId: 'A1',
        focusCellId: 'A1',
        range: {
          startCellId: 'A1',
          endCellId: 'A1',
        },
      },
      formulaBarValue: '',
      mode: 'navigate',
    };
  }

  function parseCellId(cellId) {
    const match = /^([A-Z]+)([0-9]+)$/.exec(cellId);
    if (!match) {
      return null;
    }

    return {
      columnIndex: match[1].charCodeAt(0) - 65,
      rowIndex: Number(match[2]) - 1,
    };
  }

  function getSelectionBounds(selection) {
    const anchor = parseCellId(selection.anchorCellId);
    const focus = parseCellId(selection.focusCellId);
    if (!anchor || !focus) {
      return null;
    }

    return {
      startColumnIndex: Math.min(anchor.columnIndex, focus.columnIndex),
      endColumnIndex: Math.max(anchor.columnIndex, focus.columnIndex),
      startRowIndex: Math.min(anchor.rowIndex, focus.rowIndex),
      endRowIndex: Math.max(anchor.rowIndex, focus.rowIndex),
    };
  }

  function renderSpreadsheetShell(doc, shellModel, shellState) {
    const gridRoot = doc.getElementById('grid-root');
    if (!gridRoot) {
      return null;
    }

    const fragment = doc.createDocumentFragment();
    fragment.appendChild(createCornerCell(doc));

    shellModel.columns.forEach(function (column) {
      fragment.appendChild(createColumnHeader(doc, column.label));
    });

    shellModel.rows.forEach(function (row) {
      fragment.appendChild(createRowHeader(doc, row.index));

      row.cells.forEach(function (cell) {
        fragment.appendChild(createGridCell(doc, cell, shellState));
      });
    });

    gridRoot.replaceChildren(fragment);
    syncSelectionUI(doc, shellState);
    return gridRoot;
  }

  function createCornerCell(doc) {
    const node = doc.createElement('div');
    node.className = 'corner-cell';
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function createColumnHeader(doc, label) {
    const node = doc.createElement('div');
    node.className = 'column-header';
    node.dataset.column = label;
    node.textContent = label;
    return node;
  }

  function createRowHeader(doc, index) {
    const node = doc.createElement('div');
    node.className = 'row-header';
    node.dataset.row = String(index);
    node.textContent = String(index);
    return node;
  }

  function createGridCell(doc, cell, shellState) {
    const node = doc.createElement('button');
    node.type = 'button';
    node.className = 'grid-cell';
    node.dataset.cellId = cell.id;
    node.setAttribute('role', 'gridcell');
    node.setAttribute('aria-label', cell.id);
    node.setAttribute('aria-selected', cell.id === shellState.selection.activeCellId ? 'true' : 'false');

    const content = doc.createElement('span');
    content.className = 'grid-cell-content';
    content.textContent = '';
    node.appendChild(content);

    return node;
  }

  function syncSelectionUI(doc, shellState) {
    const activeCellId = shellState.selection.activeCellId;
    const activeColumn = activeCellId.replace(/[0-9]/g, '');
    const activeRow = activeCellId.replace(/[^0-9]/g, '');
    const selectionBounds = getSelectionBounds(shellState.selection);

    doc.querySelectorAll('.grid-cell.active, .grid-cell.in-range, .column-header.active, .row-header.active').forEach(function (node) {
      node.classList.remove('active');
      node.classList.remove('in-range');
      if (node.classList.contains('grid-cell')) {
        node.setAttribute('aria-selected', 'false');
      }
    });

    if (selectionBounds) {
      doc.querySelectorAll('.grid-cell').forEach(function (node) {
        const cellPosition = parseCellId(node.dataset.cellId);
        if (!cellPosition) {
          return;
        }

        const isInRange =
          cellPosition.columnIndex >= selectionBounds.startColumnIndex &&
          cellPosition.columnIndex <= selectionBounds.endColumnIndex &&
          cellPosition.rowIndex >= selectionBounds.startRowIndex &&
          cellPosition.rowIndex <= selectionBounds.endRowIndex;

        if (isInRange) {
          node.classList.add('in-range');
        }
      });
    }

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

    const formulaInput = doc.getElementById('formula-input');
    if (formulaInput) {
      formulaInput.value = shellState.formulaBarValue;
    }
  }

  function attachShellInteractions(doc, shellState) {
    doc.addEventListener('click', function (event) {
      const cell = event.target.closest('.grid-cell');
      if (!cell) {
        return;
      }

      shellState.selection.activeCellId = cell.dataset.cellId;
      shellState.selection.anchorCellId = cell.dataset.cellId;
      shellState.selection.focusCellId = cell.dataset.cellId;
      shellState.selection.range.startCellId = cell.dataset.cellId;
      shellState.selection.range.endCellId = cell.dataset.cellId;
      syncSelectionUI(doc, shellState);
    });
  }

  function bootstrapBrowser() {
    if (typeof document === 'undefined') {
      return;
    }

    const shellModel = createSpreadsheetShellModel();
    const shellState = createInitialShellState();
    renderSpreadsheetShell(document, shellModel, shellState);
    attachShellInteractions(document, shellState);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrapBrowser, { once: true });
    } else {
      bootstrapBrowser();
    }
  }

  return {
    GRID_COLUMNS,
    GRID_ROWS,
    columnIndexToLabel,
    createSpreadsheetShellModel,
    createInitialShellState,
    getSelectionBounds,
    renderSpreadsheetShell,
  };
});
