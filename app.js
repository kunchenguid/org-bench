(function (global) {
  const SHEET_COLUMNS = 26;
  const SHEET_ROWS = 100;
  const DEFAULT_RANGE = {
    startColumn: 0,
    startRow: 0,
    endColumn: 2,
    endRow: 3,
  };

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

    const model = buildSurfaceModel();
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
      const header = createNode(document, 'div', 'column-header', column.label);
      header.dataset.column = column.label;
      grid.appendChild(header);
    });

    model.rows.forEach((row) => {
      const rowHeader = createNode(document, 'div', 'row-header', row.label);
      rowHeader.dataset.row = row.label;
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
