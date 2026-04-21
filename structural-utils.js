(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./formula-engine.js'));
    return;
  }

  root.SpreadsheetStructuralUtils = factory(root.SpreadsheetFormulaEngine);
})(typeof globalThis !== 'undefined' ? globalThis : window, function (engine) {
  const CELL_REF_RE = /(\$?)([A-Z]+)(\$?)(\d+)/g;

  function transformFormula(raw, axis, kind, index) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }

    return raw.replace(CELL_REF_RE, function (match, colDollar, colLabel, rowDollar, rowNumber) {
      const ref = engine.parseCellReference(match);
      if (axis === 'row') {
        if (kind === 'insert' && ref.row >= index) {
          ref.row += 1;
        }
        if (kind === 'delete') {
          if (ref.row === index) {
            return '#REF!';
          }
          if (ref.row > index) {
            ref.row -= 1;
          }
        }
      }

      if (axis === 'col') {
        if (kind === 'insert' && ref.col >= index) {
          ref.col += 1;
        }
        if (kind === 'delete') {
          if (ref.col === index) {
            return '#REF!';
          }
          if (ref.col > index) {
            ref.col -= 1;
          }
        }
      }

      return `${ref.colAbsolute ? '$' : ''}${engine.indexToColumn(ref.col)}${ref.rowAbsolute ? '$' : ''}${ref.row + 1}`;
    });
  }

  function transformCells(cells, axis, kind, index) {
    const next = {};

    Object.keys(cells).forEach(function (cellId) {
      const ref = engine.parseCellReference(cellId);
      let row = ref.row;
      let col = ref.col;

      if (axis === 'row') {
        if (kind === 'insert' && row >= index) {
          row += 1;
        }
        if (kind === 'delete') {
          if (row === index) {
            return;
          }
          if (row > index) {
            row -= 1;
          }
        }
      }

      if (axis === 'col') {
        if (kind === 'insert' && col >= index) {
          col += 1;
        }
        if (kind === 'delete') {
          if (col === index) {
            return;
          }
          if (col > index) {
            col -= 1;
          }
        }
      }

      next[engine.createCellId(col, row)] = transformFormula(cells[cellId], axis, kind, index);
    });

    return next;
  }

  return {
    insertRow(cells, index) {
      return transformCells(cells, 'row', 'insert', index);
    },
    deleteRow(cells, index) {
      return transformCells(cells, 'row', 'delete', index);
    },
    insertColumn(cells, index) {
      return transformCells(cells, 'col', 'insert', index);
    },
    deleteColumn(cells, index) {
      return transformCells(cells, 'col', 'delete', index);
    },
  };
});
