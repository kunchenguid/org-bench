(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetHistoryPersistence = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createHistory(options) {
    const config = options || {};
    const limit = Math.max(1, config.limit || 50);
    const onApply = typeof config.onApply === 'function' ? config.onApply : function () {};
    const undoStack = [];
    const redoStack = [];

    function record(action) {
      if (!action || !action.before || !action.after) {
        throw new Error('History actions require before and after snapshots');
      }

      undoStack.push({
        before: clone(action.before),
        after: clone(action.after),
        label: action.label || '',
      });

      while (undoStack.length > limit) {
        undoStack.shift();
      }

      redoStack.length = 0;
    }

    function undo() {
      const action = undoStack.pop();
      if (!action) {
        return false;
      }

      redoStack.push(action);
      onApply(clone(action.before));
      return true;
    }

    function redo() {
      const action = redoStack.pop();
      if (!action) {
        return false;
      }

      undoStack.push(action);
      onApply(clone(action.after));
      return true;
    }

    function clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    }

    return {
      record,
      undo,
      redo,
      clear,
      undoDepth: function () {
        return undoStack.length;
      },
      redoDepth: function () {
        return redoStack.length;
      },
    };
  }

  function resolveNamespace(explicitNamespace) {
    if (explicitNamespace) {
      return explicitNamespace;
    }

    const root = typeof window !== 'undefined' ? window : globalThis;
    return (
      root.SPREADSHEET_STORAGE_NAMESPACE ||
      root.__SPREADSHEET_STORAGE_NAMESPACE__ ||
      root.RUN_STORAGE_NAMESPACE ||
      root.__RUN_STORAGE_NAMESPACE__ ||
      'spreadsheet:'
    );
  }

  function createPersistence(options) {
    const config = options || {};
    const namespace = resolveNamespace(config.namespace);
    const storage = config.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const cellsKey = namespace + 'cells';
    const selectionKey = namespace + 'selection';

    function save(state) {
      if (!storage) {
        return false;
      }

      const safeState = state || {};
      storage.setItem(cellsKey, JSON.stringify(safeState.cells || {}));
      storage.setItem(selectionKey, JSON.stringify(safeState.selection || { active: 'A1' }));
      return true;
    }

    function restore() {
      if (!storage) {
        return { cells: {}, selection: { active: 'A1' } };
      }

      let cells = {};
      let selection = { active: 'A1' };

      try {
        cells = JSON.parse(storage.getItem(cellsKey) || '{}') || {};
      } catch (error) {
        cells = {};
      }

      try {
        selection = JSON.parse(storage.getItem(selectionKey) || '{"active":"A1"}') || { active: 'A1' };
      } catch (error) {
        selection = { active: 'A1' };
      }

      return { cells, selection };
    }

    function clear() {
      if (!storage) {
        return false;
      }

      storage.removeItem(cellsKey);
      storage.removeItem(selectionKey);
      return true;
    }

    return {
      namespace,
      keys: { cells: cellsKey, selection: selectionKey },
      save,
      restore,
      clear,
    };
  }

  function installUndoRedoShortcuts(target, history) {
    const eventTarget = target || (typeof document !== 'undefined' ? document : null);
    if (!eventTarget || !history) {
      return function () {};
    }

    function onKeyDown(event) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) {
        return;
      }

      const key = String(event.key || '').toLowerCase();
      const shouldRedo = (key === 'z' && event.shiftKey) || key === 'y';
      const applied = shouldRedo ? history.redo() : key === 'z' && history.undo();

      if (applied && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }

    eventTarget.addEventListener('keydown', onKeyDown);
    return function removeUndoRedoShortcuts() {
      eventTarget.removeEventListener('keydown', onKeyDown);
    };
  }

  return {
    createHistory,
    createPersistence,
    installUndoRedoShortcuts,
  };
});
