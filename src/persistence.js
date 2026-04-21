(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetPersistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function normalizeState(state, fallback) {
    if (!state || typeof state !== 'object') {
      return cloneState(fallback);
    }

    const cells = state.cells && typeof state.cells === 'object' ? state.cells : fallback.cells;
    const selection = state.selection && typeof state.selection === 'object'
      ? state.selection
      : fallback.selection;

    return {
      cells: cloneState(cells),
      selection: {
        row: Number.isInteger(selection.row) ? selection.row : fallback.selection.row,
        col: Number.isInteger(selection.col) ? selection.col : fallback.selection.col,
      },
    };
  }

  function createPersistence(options) {
    if (!options || !options.storage) {
      throw new Error('storage is required');
    }
    if (!options.namespace) {
      throw new Error('namespace is required');
    }

    const defaultState = normalizeState(options.defaultState || {
      cells: {},
      selection: { row: 1, col: 1 },
    }, {
      cells: {},
      selection: { row: 1, col: 1 },
    });

    const key = options.namespace + ':spreadsheet-state';

    return {
      key,
      save(state) {
        const normalized = normalizeState(state, defaultState);
        options.storage.setItem(key, JSON.stringify(normalized));
        return normalized;
      },
      load() {
        const raw = options.storage.getItem(key);
        if (!raw) {
          return cloneState(defaultState);
        }

        try {
          return normalizeState(JSON.parse(raw), defaultState);
        } catch (error) {
          return cloneState(defaultState);
        }
      },
      clear() {
        options.storage.removeItem(key);
      },
    };
  }

  return { createPersistence };
});
