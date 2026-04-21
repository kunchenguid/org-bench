(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COL_COUNT = 26;
  const ROW_COUNT = 100;

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createState(savedState) {
    if (savedState && typeof savedState === 'object') {
      return {
        cells: savedState.cells && typeof savedState.cells === 'object' ? { ...savedState.cells } : {},
        active: normalizeSelection(savedState.active),
      };
    }

    return {
      cells: {},
      active: { row: 0, col: 0 },
    };
  }

  function normalizeSelection(active) {
    return {
      row: clamp(active && Number.isInteger(active.row) ? active.row : 0, 0, ROW_COUNT - 1),
      col: clamp(active && Number.isInteger(active.col) ? active.col : 0, 0, COL_COUNT - 1),
    };
  }

  function cellKey(row, col) {
    return columnLabel(col) + String(row + 1);
  }

  function moveSelection(state, delta) {
    return {
      cells: state.cells,
      active: normalizeSelection({
        row: state.active.row + (delta.row || 0),
        col: state.active.col + (delta.col || 0),
      }),
    };
  }

  function setActiveCell(state, row, col) {
    return {
      cells: state.cells,
      active: normalizeSelection({ row, col }),
    };
  }

  function setCellRaw(state, row, col, raw) {
    const key = cellKey(row, col);
    const nextCells = { ...state.cells };

    if (raw === '') {
      delete nextCells[key];
    } else {
      nextCells[key] = String(raw);
    }

    return {
      cells: nextCells,
      active: state.active,
    };
  }

  function getCellRaw(state, row, col) {
    return state.cells[cellKey(row, col)] || '';
  }

  function getDisplayValue(raw) {
    return raw;
  }

  function serializeState(state) {
    return JSON.stringify({
      cells: state.cells,
      active: state.active,
    });
  }

  function deserializeState(serialized) {
    if (!serialized) {
      return createState();
    }

    try {
      return createState(JSON.parse(serialized));
    } catch (_error) {
      return createState();
    }
  }

  function getStorageNamespace(env) {
    if (env && typeof env.__BENCHMARK_STORAGE_NAMESPACE__ === 'string' && env.__BENCHMARK_STORAGE_NAMESPACE__) {
      return env.__BENCHMARK_STORAGE_NAMESPACE__;
    }

    if (env && typeof env.BENCHMARK_STORAGE_NAMESPACE === 'string' && env.BENCHMARK_STORAGE_NAMESPACE) {
      return env.BENCHMARK_STORAGE_NAMESPACE;
    }

    return 'spreadsheet';
  }

  function getStorageKey(namespace) {
    return namespace + ':spreadsheet-state';
  }

  return {
    COL_COUNT,
    ROW_COUNT,
    columnLabel,
    cellKey,
    createState,
    moveSelection,
    setActiveCell,
    setCellRaw,
    getCellRaw,
    getDisplayValue,
    serializeState,
    deserializeState,
    getStorageNamespace,
    getStorageKey,
  };
});
