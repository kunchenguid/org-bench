(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeRange(range) {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endRow: Math.max(range.startRow, range.endRow),
      endCol: Math.max(range.startCol, range.endCol),
    };
  }

  function createSpreadsheetModel(options) {
    const rows = options && options.rows ? options.rows : 100;
    const cols = options && options.cols ? options.cols : 26;
    const snapshot = options && options.snapshot ? options.snapshot : null;
    const state = {
      cells: new Map(),
      selected: { row: 0, col: 0 },
    };

    if (snapshot) {
      state.selected = {
        row: clamp(snapshot.selected && Number.isFinite(snapshot.selected.row) ? snapshot.selected.row : 0, 0, rows - 1),
        col: clamp(snapshot.selected && Number.isFinite(snapshot.selected.col) ? snapshot.selected.col : 0, 0, cols - 1),
      };

      if (snapshot.cells) {
        Object.keys(snapshot.cells).forEach(function (key) {
          if (snapshot.cells[key] !== '') {
            state.cells.set(key, String(snapshot.cells[key]));
          }
        });
      }
    }

    function makeKey(row, col) {
      return row + ':' + col;
    }

    function getCellRaw(row, col) {
      return state.cells.get(makeKey(row, col)) || '';
    }

    function setCell(row, col, raw) {
      const key = makeKey(row, col);
      const nextRaw = String(raw == null ? '' : raw);

      if (nextRaw === '') {
        state.cells.delete(key);
        return;
      }

      state.cells.set(key, nextRaw);
    }

    function selectCell(row, col) {
      state.selected = {
        row: clamp(row, 0, rows - 1),
        col: clamp(col, 0, cols - 1),
      };
    }

    return {
      getDimensions: function () {
        return { rows: rows, cols: cols };
      },
      getSelectedCell: function () {
        return { row: state.selected.row, col: state.selected.col };
      },
      selectCell: selectCell,
      moveSelection: function (rowDelta, colDelta) {
        selectCell(state.selected.row + rowDelta, state.selected.col + colDelta);
      },
      getCellRaw: getCellRaw,
      setCell: setCell,
      clearRange: function (range) {
        const normalized = normalizeRange(range);

        for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
          for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
            state.cells.delete(makeKey(row, col));
          }
        }
      },
      serialize: function () {
        const cells = {};

        state.cells.forEach(function (value, key) {
          cells[key] = value;
        });

        return {
          selected: { row: state.selected.row, col: state.selected.col },
          cells: cells,
        };
      },
    };
  }

  return { createSpreadsheetModel: createSpreadsheetModel };
});
