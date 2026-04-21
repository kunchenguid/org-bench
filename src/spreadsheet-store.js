'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetStore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const STORAGE_SUFFIX = 'spreadsheet-state';

  function createMemoryStorage() {
    const store = new Map();

    return {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
      dump() {
        return Object.fromEntries(store.entries());
      },
    };
  }

  function createSpreadsheetStore(options) {
    const namespace = options && options.namespace ? String(options.namespace) : 'spreadsheet';
    const storage =
      options && options.storage
        ? options.storage
        : typeof localStorage !== 'undefined'
          ? localStorage
          : createMemoryStorage();
    const maxHistory =
      options && Number.isInteger(options.maxHistory) && options.maxHistory > 0
        ? options.maxHistory
        : 50;
    const formulaEngine = resolveDependency(options, 'formulaEngine', 'FormulaEngine');
    const mutationEngine = resolveDependency(options, 'mutationEngine', 'Mutations');
    const storageKey = namespace + ':' + STORAGE_SUFFIX;
    const listeners = new Set();

    const persistedState = loadPersistedState(storage, storageKey);
    const state = {
      cells: new Map(Object.entries(persistedState.cells)),
      computed: new Map(),
      activeCell: clonePoint(persistedState.activeCell),
      selection: cloneSelection(persistedState.selection),
      history: {
        undo: [],
        redo: [],
      },
    };

    recomputeComputed();

    function getSnapshot() {
      return {
        cells: new Map(state.cells),
        computed: new Map(state.computed),
        activeCell: clonePoint(state.activeCell),
        selection: cloneSelection(state.selection),
        history: {
          undo: state.history.undo.map(cloneHistoryEntry),
          redo: state.history.redo.map(cloneHistoryEntry),
        },
      };
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    function getRawCell(cellId) {
      return state.cells.get(cellId) || '';
    }

    function getComputedCell(cellId) {
      return state.computed.has(cellId) ? state.computed.get(cellId) : null;
    }

    function setCell(cellId, rawValue, options) {
      return applyCells({ [cellId]: rawValue }, options);
    }

    function applyCells(nextCells, options) {
      const normalizedChanges = normalizeCellPatch(nextCells, state.cells);
      if (Object.keys(normalizedChanges.after).length === 0) {
        return false;
      }

      applyCellObject(state.cells, normalizedChanges.after);
      recomputeComputed();
      pushHistory({
        type: 'cells',
        label: options && options.label ? options.label : 'edit',
        before: normalizedChanges.before,
        after: normalizedChanges.after,
      });
      persistState(storage, storageKey, state);
      notify('cells');
      return true;
    }

    function clearCells(cellIds, options) {
      const patch = {};
      for (const cellId of cellIds) {
        patch[cellId] = '';
      }
      return applyCells(patch, options || { label: 'clear' });
    }

    function applyStructuralChange(operation, options) {
      if (!mutationEngine || typeof mutationEngine.applyStructuralChange !== 'function') {
        return false;
      }

      const currentCells = mapCellsToObjects(state.cells);
      const result = mutationEngine.applyStructuralChange(
        { cells: currentCells },
        operation
      );
      const nextCells = mapObjectsToCells(result && result.state ? result.state.cells : {});
      const normalizedChanges = normalizeCellPatch(nextCells, state.cells, true);

      if (Object.keys(normalizedChanges.before).length === 0 && Object.keys(normalizedChanges.after).length === 0) {
        return false;
      }

      applyHistoryEntry(normalizedChanges.after);
      pushHistory({
        type: 'cells',
        label: options && options.label ? options.label : 'structure',
        before: normalizedChanges.before,
        after: normalizedChanges.after,
      });
      persistState(storage, storageKey, state);
      notify('structure');
      return true;
    }

    function setActiveCell(point) {
      state.activeCell = clonePoint(point);
      persistState(storage, storageKey, state);
      notify('activeCell');
    }

    function setSelection(selection) {
      state.selection = cloneSelection(selection);
      persistState(storage, storageKey, state);
      notify('selection');
    }

    function replaceComputed(computedCells) {
      state.computed = new Map(Object.entries(computedCells || {}));
      notify('computed');
    }

    function setComputedCell(cellId, payload) {
      if (payload === null || payload === undefined) {
        state.computed.delete(cellId);
      } else {
        state.computed.set(cellId, payload);
      }
      notify('computed');
    }

    function canUndo() {
      return state.history.undo.length > 0;
    }

    function canRedo() {
      return state.history.redo.length > 0;
    }

    function undo() {
      if (!canUndo()) {
        return false;
      }

      const entry = state.history.undo.pop();
      applyHistoryEntry(entry.before);
      state.history.redo.push(entry);
      persistState(storage, storageKey, state);
      notify('undo');
      return true;
    }

    function redo() {
      if (!canRedo()) {
        return false;
      }

      const entry = state.history.redo.pop();
      applyHistoryEntry(entry.after);
      state.history.undo.push(entry);
      persistState(storage, storageKey, state);
      notify('redo');
      return true;
    }

    function pushHistory(entry) {
      state.history.undo.push(entry);
      if (state.history.undo.length > maxHistory) {
        state.history.undo.splice(0, state.history.undo.length - maxHistory);
      }
      state.history.redo = [];
    }

    function applyHistoryEntry(patch) {
      applyCellObject(state.cells, patch);
      recomputeComputed();
    }

    function recomputeComputed() {
      if (!formulaEngine || typeof formulaEngine.createSpreadsheetEngine !== 'function') {
        state.computed = new Map();
        return;
      }

      const engine = formulaEngine.createSpreadsheetEngine();
      for (const [cellId, rawValue] of state.cells.entries()) {
        if (isDeletedReferenceFormula(rawValue)) {
          continue;
        }
        engine.setCell(cellId, rawValue);
      }

      const computed = {};
      for (const [cellId, rawValue] of state.cells.entries()) {
        if (isDeletedReferenceFormula(rawValue)) {
          computed[cellId] = {
            raw: rawValue,
            type: 'error',
            value: '#REF!',
            display: '#REF!',
            dependencies: [],
          };
          continue;
        }
        computed[cellId] = engine.getCell(cellId);
      }
      state.computed = new Map(Object.entries(computed));
    }

    function notify(reason) {
      const snapshot = getSnapshot();
      for (const listener of listeners) {
        listener(snapshot, reason);
      }
    }

    return {
      subscribe,
      getSnapshot,
      getRawCell,
      getComputedCell,
      setCell,
      applyCells,
      applyStructuralChange,
      clearCells,
      setActiveCell,
      setSelection,
      replaceComputed,
      setComputedCell,
      canUndo,
      canRedo,
      undo,
      redo,
      storageKey,
    };
  }

  function normalizeCellPatch(nextCells, currentCells, includeDeletions) {
    const before = {};
    const after = {};

    return collectNormalizedCellPatch(nextCells, currentCells, before, after, Boolean(includeDeletions));
  }

  function collectNormalizedCellPatch(nextCells, currentCells, before, after, includeDeletions) {
    const seen = new Set();

    for (const [cellId, value] of Object.entries(nextCells || {})) {
      seen.add(cellId);
      const previousValue = currentCells.get(cellId) || '';
      const normalizedValue = value === null || value === undefined ? '' : String(value);
      if (previousValue === normalizedValue) {
        continue;
      }

      before[cellId] = previousValue;
      after[cellId] = normalizedValue;
    }

    if (includeDeletions) {
      for (const [cellId, previousValue] of currentCells.entries()) {
        if (seen.has(cellId)) {
          continue;
        }
        before[cellId] = previousValue;
        after[cellId] = '';
      }
    }

    return { before, after };
  }

  function mapCellsToObjects(cells) {
    const mapped = {};
    for (const [cellId, rawValue] of cells.entries()) {
      mapped[cellId] = { raw: rawValue };
    }
    return mapped;
  }

  function mapObjectsToCells(cells) {
    const mapped = {};
    for (const [cellId, payload] of Object.entries(cells || {})) {
      mapped[cellId] = payload && typeof payload === 'object' ? payload.raw || '' : String(payload || '');
    }
    return mapped;
  }

  function isDeletedReferenceFormula(rawValue) {
    return typeof rawValue === 'string' && rawValue.startsWith('=') && rawValue.includes('#REF!');
  }

  function resolveDependency(options, optionKey, globalKey) {
    if (options && options[optionKey]) {
      return options[optionKey];
    }

    if (typeof globalThis !== 'undefined' && globalThis[globalKey]) {
      return globalThis[globalKey];
    }

    return null;
  }

  function applyCellObject(cells, patch) {
    for (const [cellId, value] of Object.entries(patch || {})) {
      if (value === '') {
        cells.delete(cellId);
      } else {
        cells.set(cellId, value);
      }
    }
  }

  function loadPersistedState(storage, storageKey) {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        return getDefaultPersistedState();
      }

      const parsed = JSON.parse(raw);
      return {
        cells: parsed && parsed.cells && typeof parsed.cells === 'object' ? parsed.cells : {},
        activeCell: isPoint(parsed && parsed.activeCell)
          ? parsed.activeCell
          : getDefaultPersistedState().activeCell,
        selection: isSelection(parsed && parsed.selection)
          ? parsed.selection
          : getDefaultPersistedState().selection,
      };
    } catch (_error) {
      return getDefaultPersistedState();
    }
  }

  function persistState(storage, storageKey, state) {
    const payload = {
      cells: Object.fromEntries(state.cells.entries()),
      activeCell: state.activeCell,
      selection: state.selection,
    };
    storage.setItem(storageKey, JSON.stringify(payload));
  }

  function getDefaultPersistedState() {
    return {
      cells: {},
      activeCell: { row: 0, col: 0 },
      selection: {
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 0 },
      },
    };
  }

  function isPoint(value) {
    return !!value && Number.isInteger(value.row) && Number.isInteger(value.col);
  }

  function isSelection(value) {
    return !!value && isPoint(value.anchor) && isPoint(value.focus);
  }

  function clonePoint(point) {
    return { row: point.row, col: point.col };
  }

  function cloneSelection(selection) {
    return {
      anchor: clonePoint(selection.anchor),
      focus: clonePoint(selection.focus),
    };
  }

  function cloneHistoryEntry(entry) {
    return {
      type: entry.type,
      label: entry.label,
      before: { ...entry.before },
      after: { ...entry.after },
    };
  }

  return {
    createMemoryStorage,
    createSpreadsheetStore,
  };
});
