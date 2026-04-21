(function (globalScope) {
  const DEFAULT_NAMESPACE = 'spreadsheet';
  const STORAGE_SUFFIX = 'spreadsheet-state';

  function normalizeState(state) {
    const cells = state && typeof state.cells === 'object' && state.cells ? { ...state.cells } : {};
    const selection = isValidSelection(state && state.selection)
      ? { col: state.selection.col, row: state.selection.row }
      : null;

    return { cells, selection };
  }

  function isValidSelection(selection) {
    return Boolean(
      selection &&
        Number.isInteger(selection.col) &&
        selection.col > 0 &&
        Number.isInteger(selection.row) &&
        selection.row > 0
    );
  }

  function resolveStorage(options) {
    if (options && options.storage) {
      return options.storage;
    }

    if (globalScope && globalScope.localStorage) {
      return globalScope.localStorage;
    }

    return null;
  }

  function resolveKey(namespace) {
    const safeNamespace = typeof namespace === 'string' && namespace.trim()
      ? namespace.trim()
      : DEFAULT_NAMESPACE;

    return safeNamespace + ':' + STORAGE_SUFFIX;
  }

  function createSpreadsheetPersistence(options) {
    const storage = resolveStorage(options || {});
    const key = resolveKey(options && options.namespace);
    let lastSerialized = null;

    function load() {
      if (!storage) {
        return normalizeState(null);
      }

      const raw = storage.getItem(key);
      if (!raw) {
        lastSerialized = null;
        return normalizeState(null);
      }

      try {
        const parsed = JSON.parse(raw);
        const normalized = normalizeState(parsed);
        lastSerialized = JSON.stringify(normalized);
        return normalized;
      } catch (_error) {
        lastSerialized = null;
        return normalizeState(null);
      }
    }

    function save(state) {
      const normalized = normalizeState(state);
      const serialized = JSON.stringify(normalized);

      if (!storage || serialized === lastSerialized) {
        return normalized;
      }

      storage.setItem(key, serialized);
      lastSerialized = serialized;
      return normalized;
    }

    function clear() {
      if (storage) {
        storage.removeItem(key);
      }
      lastSerialized = null;
    }

    return {
      key,
      load,
      save,
      clear,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSpreadsheetPersistence };
  }

  globalScope.createSpreadsheetPersistence = createSpreadsheetPersistence;
})(typeof window !== 'undefined' ? window : globalThis);
