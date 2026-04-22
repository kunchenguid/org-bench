(function () {
  const DEFAULT_COLUMNS = 26;
  const DEFAULT_ROWS = 100;

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function createGridModel(options) {
    const settings = options || {};
    const columnCount = settings.columnCount || DEFAULT_COLUMNS;
    const rowCount = settings.rowCount || DEFAULT_ROWS;
    const activeCell = settings.activeCell || 'A1';
    const range = settings.range || { start: 'A1', end: 'C3' };
    const values = settings.values || {
      A1: '1200',
      B1: 'North',
      C1: '=SUM(A2:A5)',
      A2: '250',
      A3: '325',
      A4: '410',
      A5: '215',
      B2: 'Forecast',
      C2: 'Ready'
    };

    return {
      columns: Array.from({ length: columnCount }, function (_, index) {
        return {
          key: columnLabel(index),
          label: columnLabel(index)
        };
      }),
      rows: Array.from({ length: rowCount }, function (_, index) {
        return {
          key: String(index + 1),
          label: String(index + 1)
        };
      }),
      activeCell: activeCell,
      range: range,
      values: values,
      formulaText: settings.formulaText || ''
    };
  }

  function cellKey(columnIndex, rowIndex) {
    return columnLabel(columnIndex) + String(rowIndex + 1);
  }

  function parseCellKey(key) {
    const match = /^([A-Z]+)(\d+)$/.exec(key || '');
    if (!match) {
      return null;
    }

    return {
      column: match[1].charCodeAt(0) - 65,
      row: Number(match[2]) - 1
    };
  }

  function isInsideRange(targetKey, range) {
    const target = parseCellKey(targetKey);
    const start = parseCellKey(range && range.start);
    const end = parseCellKey(range && range.end);

    if (!target || !start || !end) {
      return false;
    }

    const minColumn = Math.min(start.column, end.column);
    const maxColumn = Math.max(start.column, end.column);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);

    return target.column >= minColumn && target.column <= maxColumn && target.row >= minRow && target.row <= maxRow;
  }

  function createHeaderMenuLabel(axis, label) {
    return axis + ' ' + label + ' actions';
  }

  function renderSpreadsheet(root, state) {
    if (!root) {
      return;
    }

    const model = state || createGridModel();
    const nameBox = document.querySelector('[data-name-box] input');
    const formulaInput = document.querySelector('[data-formula-input]');

    if (nameBox) {
      nameBox.value = model.activeCell;
    }

    if (formulaInput) {
      formulaInput.value = model.formulaText || model.values[model.activeCell] || '';
    }

    const fragment = document.createDocumentFragment();
    const grid = document.createElement('div');
    grid.className = 'spreadsheet';

    const corner = document.createElement('div');
    corner.className = 'corner-cell';
    corner.innerHTML = '<span class="corner-glyph" aria-hidden="true"></span>';
    fragment.appendChild(corner);

    model.columns.forEach(function (column) {
      const header = document.createElement('div');
      header.className = 'column-header';
      header.innerHTML =
        '<span class="header-label">' + column.label + '</span>' +
        '<button class="header-action" type="button" aria-label="' + createHeaderMenuLabel('Column', column.label) + '">+</button>';
      fragment.appendChild(header);
    });

    model.rows.forEach(function (row, rowIndex) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.innerHTML =
        '<span class="header-label">' + row.label + '</span>' +
        '<button class="header-action" type="button" aria-label="' + createHeaderMenuLabel('Row', row.label) + '">+</button>';
      fragment.appendChild(rowHeader);

      model.columns.forEach(function (_, columnIndex) {
        const key = cellKey(columnIndex, rowIndex);
        const cell = document.createElement('div');
        const rawValue = model.values[key] || '';
        const classes = ['grid-cell'];

        if (isInsideRange(key, model.range)) {
          classes.push('is-in-range');
        }

        if (key === model.activeCell) {
          classes.push('is-active');
        }

        cell.className = classes.join(' ');
        cell.dataset.cell = key;
        cell.dataset.align = /^=?\d/.test(rawValue) ? 'right' : 'left';
        cell.textContent = rawValue;
        fragment.appendChild(cell);
      });
    });

    grid.appendChild(fragment);
    root.replaceChildren(grid);
  }

  window.SpreadsheetView = {
    createGridModel: createGridModel,
    renderSpreadsheet: renderSpreadsheet
  };

  document.addEventListener('DOMContentLoaded', function () {
    renderSpreadsheet(document.querySelector('[data-grid-root]'), createGridModel());
  });
}());
