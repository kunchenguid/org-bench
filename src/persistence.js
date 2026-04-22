const STORAGE_SUFFIX = 'spreadsheet:session';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseCellAddress(address) {
  const match = /^([A-Z]+)(\d+)$/.exec(address || '');
  if (!match) {
    throw new Error('Invalid cell address: ' + address);
  }

  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + (character.charCodeAt(0) - 64);
  }

  return {
    column,
    row: Number(match[2]),
  };
}

function columnNumberToName(columnNumber) {
  let current = columnNumber;
  let label = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

function toCellAddress(columnNumber, rowNumber) {
  return columnNumberToName(columnNumber) + String(rowNumber);
}

function normalizeRange(range) {
  const start = parseCellAddress(range.start);
  const end = parseCellAddress(range.end);

  return {
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column),
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
  };
}

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

function createHistory(initialState, options) {
  const safeOptions = options || {};
  const limit = Math.max(1, safeOptions.limit || 50);
  const entries = [cloneValue(initialState)];
  let index = 0;

  return {
    current() {
      return cloneValue(entries[index]);
    },
    push(nextState) {
      entries.splice(index + 1);
      entries.push(cloneValue(nextState));
      if (entries.length > limit + 1) {
        entries.shift();
      }
      index = entries.length - 1;
      return this.current();
    },
    undo() {
      if (index === 0) {
        return this.current();
      }
      index -= 1;
      return this.current();
    },
    redo() {
      if (index >= entries.length - 1) {
        return this.current();
      }
      index += 1;
      return this.current();
    },
    canUndo() {
      return index > 0;
    },
    canRedo() {
      return index < entries.length - 1;
    },
  };
}

function buildClipboardMatrix(options) {
  const safeOptions = options || {};
  const cells = safeOptions.cells || {};
  const bounds = normalizeRange(safeOptions.range);
  const matrix = [];

  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    const matrixRow = [];
    for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
      const address = toCellAddress(column, row);
      matrixRow.push(Object.prototype.hasOwnProperty.call(cells, address) ? cells[address] : '');
    }
    matrix.push(matrixRow);
  }

  return matrix;
}

function serializeClipboardMatrix(matrix) {
  return matrix.map((row) => row.join('\t')).join('\n');
}

function parseClipboardText(text) {
  if (!text) {
    return [['']];
  }

  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((row) => row.split('\t'));
}

module.exports = {
  buildClipboardMatrix,
  createHistory,
  createWorkbookPersistence,
  defaultWorkbookState,
  normalizeWorkbookState,
  parseClipboardText,
  resolveRunNamespace,
  serializeClipboardMatrix,
};
