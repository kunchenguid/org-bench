(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SpreadsheetHistoryPersistenceController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function installHistoryPersistenceController(options) {
    const config = options || {};
    const store = config.store;
    const historyPersistence = config.historyPersistence || config.history || (typeof SpreadsheetHistoryPersistence !== 'undefined' ? SpreadsheetHistoryPersistence : null);
    const target = config.target || (typeof document !== 'undefined' ? document : null);
    if (!store || !historyPersistence) return emptyController();

    const persistence = historyPersistence.createPersistence({
      namespace: config.namespace,
      storage: config.storage,
    });
    let applyingHistory = false;
    let recordingAction = false;
    const history = historyPersistence.createHistory({
      limit: config.limit || 50,
      onApply: function (state) {
        applyingHistory = true;
        store.hydrate(state, 'history');
        persistence.save(store.snapshot());
        applyingHistory = false;
      },
    });

    const restored = persistence.restore();
    if (restored && (Object.keys(restored.cells || {}).length || restored.selection)) {
      store.hydrate(mergeSnapshot(store.snapshot(), restored), 'persistence');
    }

    const unsubscribe = typeof store.on === 'function'
      ? store.on('statechange', function () {
        if (!applyingHistory) persistence.save(store.snapshot());
      })
      : function () {};
    const removeShortcuts = historyPersistence.installUndoRedoShortcuts(target, history);

    function recordAction(label, mutate) {
      if (recordingAction || applyingHistory || typeof mutate !== 'function') {
        if (typeof mutate === 'function') mutate();
        return false;
      }

      const before = store.snapshot();
      recordingAction = true;
      mutate();
      recordingAction = false;
      const after = store.snapshot();
      if (!sameState(before, after)) {
        history.record({ before: before, after: after, label: label || 'action' });
        persistence.save(after);
        return true;
      }
      return false;
    }

    function recordSnapshots(label, before, after) {
      if (!before || !after || sameState(before, after)) return false;
      history.record({ before: before, after: after, label: label || 'action' });
      persistence.save(after);
      return true;
    }

    return {
      history: history,
      persistence: persistence,
      recordAction: recordAction,
      recordSnapshots: recordSnapshots,
      remove: function () {
        unsubscribe();
        removeShortcuts();
      },
    };
  }

  function mergeSnapshot(current, restored) {
    return {
      dimensions: current.dimensions,
      cells: restored.cells || {},
      selection: restored.selection || current.selection,
    };
  }

  function sameState(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function emptyController() {
    return {
      recordAction: function (label, mutate) {
        if (typeof mutate === 'function') mutate();
        return false;
      },
      remove: function () {},
    };
  }

  return {
    installHistoryPersistenceController,
  };
});
