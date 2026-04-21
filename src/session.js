(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.SpreadsheetSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const VERSION = 1;
  const DEFAULT_ADDRESS = 'A1';
  const STORAGE_SUFFIX = 'spreadsheet:session';

  function createSessionStore(options) {
    const storage = options && options.storage ? options.storage : (typeof localStorage !== 'undefined' ? localStorage : null);
    const namespace = options && typeof options.namespace === 'string' ? options.namespace : '';
    const onError = options && typeof options.onError === 'function' ? options.onError : function () {};
    const storageKey = namespace ? `${namespace}:${STORAGE_SUFFIX}` : STORAGE_SUFFIX;

    function loadState() {
      if (!storage || typeof storage.getItem !== 'function') {
        return createDefaultState();
      }

      try {
        const raw = storage.getItem(storageKey);
        if (!raw) {
          return createDefaultState();
        }

        const payload = JSON.parse(raw);
        if (!payload || payload.version !== VERSION) {
          return createDefaultState();
        }

        return normalizeSnapshot(payload);
      } catch (error) {
        onError(error, 'load');
        return createDefaultState();
      }
    }

    function saveState(snapshot) {
      const normalized = normalizeSnapshot(snapshot || createDefaultState());
      if (!storage || typeof storage.setItem !== 'function') {
        return normalized;
      }

      try {
        storage.setItem(storageKey, JSON.stringify({
          version: VERSION,
          cells: normalized.cells,
          selection: normalized.selection,
        }));
      } catch (error) {
        onError(error, 'save');
      }

      return normalized;
    }

    function clearState() {
      if (!storage || typeof storage.removeItem !== 'function') {
        return;
      }

      try {
        storage.removeItem(storageKey);
      } catch (error) {
        onError(error, 'clear');
      }
    }

    return {
      storageKey,
      loadState,
      saveState,
      clearState,
    };
  }

  function normalizeSnapshot(snapshot) {
    const cells = normalizeCells(snapshot && snapshot.cells);
    const selection = normalizeSelection(snapshot && snapshot.selection, cells);

    return { cells, selection };
  }

  function normalizeCells(cells) {
    const normalized = {};
    if (!cells || typeof cells !== 'object') {
      return normalized;
    }

    for (const [address, raw] of Object.entries(cells)) {
      if (!isCellAddress(address) || typeof raw !== 'string') {
        continue;
      }

      normalized[address] = raw;
    }

    return normalized;
  }

  function normalizeSelection(selection, cells) {
    const fallback = firstCellAddress(cells);
    const active = isCellAddress(selection && selection.active) ? selection.active : fallback;
    const anchor = isCellAddress(selection && selection.anchor) ? selection.anchor : active;
    const focus = isCellAddress(selection && selection.focus) ? selection.focus : active;

    return { active, anchor, focus };
  }

  function createDefaultState() {
    return {
      cells: {},
      selection: {
        active: DEFAULT_ADDRESS,
        anchor: DEFAULT_ADDRESS,
        focus: DEFAULT_ADDRESS,
      },
    };
  }

  function firstCellAddress(cells) {
    const addresses = Object.keys(cells || {});
    return addresses.length > 0 ? addresses[0] : DEFAULT_ADDRESS;
  }

  function isCellAddress(value) {
    return typeof value === 'string' && /^[A-Z]+[1-9][0-9]*$/.test(value);
  }

  return {
    VERSION,
    STORAGE_SUFFIX,
    createSessionStore,
    normalizeSnapshot,
  };
});
