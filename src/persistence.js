const STORAGE_SUFFIX = 'spreadsheet:session';

function defaultWorkbookState() {
  return {
    cells: {},
    selection: {
      active: 'A1',
      range: null,
    },
  };
}

function normalizeWorkbookState(state) {
  const base = defaultWorkbookState();
  const safeState = state && typeof state === 'object' ? state : {};
  const safeSelection =
    safeState.selection && typeof safeState.selection === 'object'
      ? safeState.selection
      : {};

  return {
    cells:
      safeState.cells && typeof safeState.cells === 'object' && !Array.isArray(safeState.cells)
        ? { ...safeState.cells }
        : {},
    selection: {
      active:
        typeof safeSelection.active === 'string' && safeSelection.active
          ? safeSelection.active
          : base.selection.active,
      range:
        safeSelection.range &&
        typeof safeSelection.range === 'object' &&
        typeof safeSelection.range.start === 'string' &&
        typeof safeSelection.range.end === 'string'
          ? {
              start: safeSelection.range.start,
              end: safeSelection.range.end,
            }
          : null,
    },
  };
}

function resolveRunNamespace(options) {
  const safeOptions = options || {};
  if (safeOptions.explicitNamespace) {
    return String(safeOptions.explicitNamespace);
  }

  const globalObject = safeOptions.globalObject || globalThis;
  const globalKeys = [
    '__BENCHMARK_RUN_NAMESPACE__',
    '__RUN_NAMESPACE__',
    'ORACLE_RUN_NAMESPACE',
  ];

  for (const key of globalKeys) {
    if (globalObject && globalObject[key]) {
      return String(globalObject[key]);
    }
  }

  const documentObject = safeOptions.documentObject;
  const datasetNamespace = documentObject && documentObject.documentElement && documentObject.documentElement.dataset
    ? documentObject.documentElement.dataset.runNamespace
    : undefined;

  return datasetNamespace ? String(datasetNamespace) : '';
}

function createWorkbookPersistence(options) {
  const safeOptions = options || {};
  const namespace = resolveRunNamespace({
    explicitNamespace: safeOptions.namespace,
    globalObject: safeOptions.globalObject,
    documentObject: safeOptions.documentObject,
  });

  if (!namespace) {
    throw new Error('A run namespace is required for workbook persistence.');
  }

  const storage = safeOptions.storage;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('A storage adapter with getItem/setItem is required.');
  }

  const storageKey = namespace + ':' + STORAGE_SUFFIX;

  return {
    storageKey,
    loadWorkbook() {
      const rawValue = storage.getItem(storageKey);
      if (!rawValue) {
        return defaultWorkbookState();
      }

      try {
        return normalizeWorkbookState(JSON.parse(rawValue));
      } catch (_error) {
        return defaultWorkbookState();
      }
    },
    saveWorkbook(state) {
      const normalized = normalizeWorkbookState(state);
      storage.setItem(storageKey, JSON.stringify(normalized));
      return normalized;
    },
    clearWorkbook() {
      if (typeof storage.removeItem === 'function') {
        storage.removeItem(storageKey);
      } else {
        storage.setItem(storageKey, '');
      }
    },
  };
}

module.exports = {
  createWorkbookPersistence,
  defaultWorkbookState,
  normalizeWorkbookState,
  resolveRunNamespace,
};
