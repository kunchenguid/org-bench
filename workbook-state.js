(function (globalScope) {
  'use strict';

  var STORAGE_SUFFIX = 'workbook-state:v1';
  var CELL_REF_PATTERN = /^[A-Z](?:[1-9][0-9]*)$/;

  function createWorkbookState(options) {
    var resolvedOptions = options || {};
    var storage = resolvedOptions.storage || getDefaultStorage();
    var namespace = resolveNamespace(resolvedOptions.namespace);
    var storageKey = namespace + ':' + STORAGE_SUFFIX;
    var snapshot = loadSnapshot(storage, storageKey);
    var state = {
      cells: snapshot.cells,
      selectedCell: snapshot.selectedCell,
    };

    function persist() {
      storage.setItem(storageKey, JSON.stringify({
        cells: cloneCells(state.cells),
        selectedCell: state.selectedCell,
      }));
    }

    function getCellRaw(cellRef) {
      assertValidCellRef(cellRef);
      return Object.prototype.hasOwnProperty.call(state.cells, cellRef)
        ? state.cells[cellRef]
        : '';
    }

    function setCellRaw(cellRef, rawValue) {
      assertValidCellRef(cellRef);

      if (typeof rawValue !== 'string') {
        rawValue = String(rawValue);
      }

      if (rawValue === '') {
        delete state.cells[cellRef];
      } else {
        state.cells[cellRef] = rawValue;
      }

      persist();
      return getCellRaw(cellRef);
    }

    function clearCell(cellRef) {
      return setCellRaw(cellRef, '');
    }

    function getAllCellEntries() {
      return cloneCells(state.cells);
    }

    function getSelectedCell() {
      return state.selectedCell;
    }

    function setSelectedCell(cellRef) {
      assertValidCellRef(cellRef);
      state.selectedCell = cellRef;
      persist();
      return state.selectedCell;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error('Listener must be a function');
      }

      listener({
        cells: getAllCellEntries(),
        selectedCell: getSelectedCell(),
      });

      return function unsubscribe() {};
    }

    persist();

    return {
      getCellRaw: getCellRaw,
      setCellRaw: setCellRaw,
      clearCell: clearCell,
      getAllCellEntries: getAllCellEntries,
      getSelectedCell: getSelectedCell,
      setSelectedCell: setSelectedCell,
      getStorageKey: function () {
        return storageKey;
      },
      subscribe: subscribe,
    };
  }

  function getDefaultStorage() {
    if (!globalScope.localStorage) {
      throw new Error('A storage implementation is required');
    }

    return globalScope.localStorage;
  }

  function resolveNamespace(explicitNamespace) {
    var namespace = explicitNamespace
      || globalScope.__APPLE_RUN_STORAGE_NAMESPACE__
      || globalScope.__RUN_STORAGE_NAMESPACE__
      || globalScope.__RUN_NAMESPACE__
      || globalScope.__BENCHMARK_RUN_NAMESPACE__
      || globalScope.__APP_RUN_NAMESPACE__;

    if (!namespace) {
      throw new Error('A run namespace is required for workbook persistence');
    }

    return String(namespace);
  }

  function loadSnapshot(storage, storageKey) {
    var savedValue = storage.getItem(storageKey);
    if (!savedValue) {
      return {
        cells: {},
        selectedCell: 'A1',
      };
    }

    try {
      var parsed = JSON.parse(savedValue);
      return sanitizeSnapshot(parsed);
    } catch (error) {
      return {
        cells: {},
        selectedCell: 'A1',
      };
    }
  }

  function sanitizeSnapshot(snapshot) {
    var sourceCells = snapshot && typeof snapshot === 'object' ? snapshot.cells : null;
    var cells = {};

    if (sourceCells && typeof sourceCells === 'object') {
      Object.keys(sourceCells).forEach(function (cellRef) {
        if (CELL_REF_PATTERN.test(cellRef) && typeof sourceCells[cellRef] === 'string' && sourceCells[cellRef] !== '') {
          cells[cellRef] = sourceCells[cellRef];
        }
      });
    }

    var selectedCell = snapshot && typeof snapshot.selectedCell === 'string' && CELL_REF_PATTERN.test(snapshot.selectedCell)
      ? snapshot.selectedCell
      : 'A1';

    return {
      cells: cells,
      selectedCell: selectedCell,
    };
  }

  function cloneCells(cells) {
    return Object.assign({}, cells);
  }

  function assertValidCellRef(cellRef) {
    if (typeof cellRef !== 'string' || !CELL_REF_PATTERN.test(cellRef)) {
      throw new Error('Invalid cell reference: ' + cellRef);
    }
  }

  var api = {
    createWorkbookState: createWorkbookState,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.WorkbookState = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
