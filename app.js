(function (global) {
  const SHEET_COLUMNS = 26;
  const SHEET_ROWS = 100;
  const DEFAULT_RANGE = {
    startColumn: 0,
    startRow: 0,
    endColumn: 2,
    endRow: 3,
  };
  let runtimeState = null;

  function getColumnLabel(index) {
    let value = index + 1;
    let label = '';

    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }

    return label;
  }

  function buildSurfaceModel(options) {
    const settings = options || {};
    const columnCount = settings.columnCount || SHEET_COLUMNS;
    const rowCount = settings.rowCount || SHEET_ROWS;
    const columns = Array.from({ length: columnCount }, (_, columnIndex) => ({
      index: columnIndex,
      label: getColumnLabel(columnIndex),
      actions: createHeaderActions('column', columnIndex),
    }));

    const rows = Array.from({ length: rowCount }, (_, rowIndex) => ({
      index: rowIndex,
      label: String(rowIndex + 1),
      actions: createHeaderActions('row', rowIndex),
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
      activeCell: settings.activeCell || { column: 0, row: 0 },
      range: settings.range || { ...DEFAULT_RANGE },
    };
  }

  function createHeaderActions(axis, index) {
    if (axis === 'column') {
      return [
        { id: `column-${index + 1}-insert-before`, label: 'Insert Left', type: 'insert-column', index: index + 1 },
        { id: `column-${index + 1}-insert-after`, label: 'Insert Right', type: 'insert-column', index: index + 2 },
        { id: `column-${index + 1}-delete`, label: 'Delete Column', type: 'delete-column', index: index + 1 },
      ];
    }

    return [
      { id: `row-${index + 1}-insert-before`, label: 'Insert Above', type: 'insert-row', index: index + 1 },
      { id: `row-${index + 1}-insert-after`, label: 'Insert Below', type: 'insert-row', index: index + 2 },
      { id: `row-${index + 1}-delete`, label: 'Delete Row', type: 'delete-row', index: index + 1 },
    ];
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

  function isCellInRange(cell, range) {
    return cell.column >= range.startColumn && cell.column <= range.endColumn && cell.row >= range.startRow && cell.row <= range.endRow;
  }

  function isRangeEdge(cell, range, side) {
    if (!isCellInRange(cell, range)) {
      return false;
    }

    if (side === 'top') {
      return cell.row === range.startRow;
    }
    if (side === 'right') {
      return cell.column === range.endColumn;
    }
    if (side === 'bottom') {
      return cell.row === range.endRow;
    }
    return cell.column === range.startColumn;
  }

  function renderSpreadsheet(document) {
    const mountPoint = document.getElementById('app');
    if (!mountPoint) {
      return;
    }

    const state = getRuntimeState(global);
    const model = buildSurfaceModel({
      activeCell: state.activeCell,
      columnCount: state.columnCount,
      range: state.range,
      rowCount: state.rowCount,
    });
    const shell = createNode(document, 'main', 'app-shell');
    const topbar = createNode(document, 'section', 'formula-bar');
    const nameBox = createNode(document, 'div', 'name-box', 'A1');
    const formulaLabel = createNode(document, 'div', 'formula-label', model.formulaBar.label);
    const formulaInput = createNode(document, 'div', 'formula-input');
    const formulaText = createNode(document, 'span', 'formula-placeholder', model.formulaBar.placeholder);
    const sheetViewport = createNode(document, 'section', 'sheet-viewport');
    const grid = createNode(document, 'div', 'sheet-grid');

    nameBox.setAttribute('aria-label', 'Selected cell');
    formulaInput.setAttribute('aria-label', model.formulaBar.name);
    formulaInput.setAttribute('role', 'textbox');
    formulaInput.setAttribute('aria-readonly', 'true');

    formulaInput.appendChild(formulaText);
    topbar.appendChild(nameBox);
    topbar.appendChild(formulaLabel);
    topbar.appendChild(formulaInput);

    grid.style.setProperty('--column-count', String(model.columns.length));

    const corner = createNode(document, 'div', 'corner-cell');
    grid.appendChild(corner);

    model.columns.forEach((column) => {
      const header = createNode(document, 'div', 'column-header');
      const label = createNode(document, 'span', 'header-label', column.label);
      const actions = createHeaderActionButtons(document, column.actions, function handleAction(action) {
        applyHeaderAction(action, document);
      });
      header.dataset.column = column.label;
      header.appendChild(label);
      header.appendChild(actions);
      grid.appendChild(header);
    });

    model.rows.forEach((row) => {
      const rowHeader = createNode(document, 'div', 'row-header');
      const label = createNode(document, 'span', 'header-label', row.label);
      const actions = createHeaderActionButtons(document, row.actions, function handleAction(action) {
        applyHeaderAction(action, document);
      });
      rowHeader.dataset.row = row.label;
      rowHeader.appendChild(label);
      rowHeader.appendChild(actions);
      grid.appendChild(rowHeader);

      row.cells.forEach((cell) => {
        const cellNode = createNode(document, 'div', 'grid-cell');
        const isActive = cell.column === model.activeCell.column && cell.row === model.activeCell.row;
        const inRange = isCellInRange(cell, model.range);

        cellNode.dataset.address = cell.address;
        cellNode.setAttribute('role', 'gridcell');
        cellNode.setAttribute('aria-label', cell.address);

        if (inRange) {
          cellNode.classList.add('in-range');
        }
        if (isActive) {
          cellNode.classList.add('active-cell');
        }
        if (isRangeEdge(cell, model.range, 'top')) {
          cellNode.classList.add('range-top');
        }
        if (isRangeEdge(cell, model.range, 'right')) {
          cellNode.classList.add('range-right');
        }
        if (isRangeEdge(cell, model.range, 'bottom')) {
          cellNode.classList.add('range-bottom');
        }
        if (isRangeEdge(cell, model.range, 'left')) {
          cellNode.classList.add('range-left');
        }

        grid.appendChild(cellNode);
      });
    });

    sheetViewport.appendChild(grid);
    shell.appendChild(topbar);
    shell.appendChild(sheetViewport);
    mountPoint.replaceChildren(shell);
  }

  function createHeaderActionButtons(document, actions, onAction) {
    const container = createNode(document, 'div', 'header-actions');

    actions.forEach(function appendAction(action) {
      const button = createNode(document, 'button', 'header-action-button', action.label[0]);
      button.type = 'button';
      button.dataset.actionType = action.type;
      button.dataset.actionIndex = String(action.index);
      button.setAttribute('aria-label', action.label);
      button.title = action.label;
      button.addEventListener('click', function onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        onAction(action);
      });
      container.appendChild(button);
    });

    return container;
  }

  function getRuntimeState(globalObject) {
    if (!runtimeState) {
      runtimeState = createRuntimeState(globalObject);
    }

    return runtimeState;
  }

  function createRuntimeState(globalObject) {
    const storeApi = globalObject.WorkbookStore;
    const store = storeApi && typeof storeApi.createWorkbookStore === 'function'
      ? storeApi.createWorkbookStore({
        namespace: resolveStorageNamespace(globalObject),
        storage: resolveStorage(globalObject),
      })
      : null;

    return {
      activeCell: { column: 0, row: 0 },
      columnCount: SHEET_COLUMNS,
      range: { ...DEFAULT_RANGE },
      rowCount: SHEET_ROWS,
      store,
    };
  }

  function resolveStorageNamespace(globalObject) {
    return globalObject.__BENCHMARK_STORAGE_NAMESPACE__ || globalObject.BENCHMARK_STORAGE_NAMESPACE || 'spreadsheet';
  }

  function resolveStorage(globalObject) {
    try {
      return globalObject.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function applyHeaderAction(action, document) {
    const state = getRuntimeState(global);

    if (action.type === 'insert-row') {
      state.rowCount += 1;
      if (state.store) {
        state.store.insertRows(action.index, 1);
      }
    } else if (action.type === 'delete-row') {
      if (state.rowCount > 1) {
        state.rowCount -= 1;
        if (state.store) {
          state.store.deleteRows(action.index, 1);
        }
      }
    } else if (action.type === 'insert-column') {
      state.columnCount += 1;
      if (state.store) {
        state.store.insertColumns(action.index, 1);
      }
    } else if (action.type === 'delete-column' && state.columnCount > 1) {
      state.columnCount -= 1;
      if (state.store) {
        state.store.deleteColumns(action.index, 1);
      }
    }

    renderSpreadsheet(document);
  }

  const api = {
    SHEET_COLUMNS,
    SHEET_ROWS,
    buildSurfaceModel,
    getColumnLabel,
    renderSpreadsheet,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.SpreadsheetSurface = api;

  if (typeof document !== 'undefined') {
    renderSpreadsheet(document);
  }
})(typeof window !== 'undefined' ? window : globalThis);
