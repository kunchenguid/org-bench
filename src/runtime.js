(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function normalizeState(state) {
    var cells = state && state.cells && typeof state.cells === 'object' ? state.cells : {};
    var selection = state && state.selection && typeof state.selection === 'object' ? state.selection : {};

    return {
      cells: cloneState(cells),
      selection: {
        row: Number.isInteger(selection.row) ? selection.row : 1,
        col: Number.isInteger(selection.col) ? selection.col : 1,
      },
    };
  }

  function createEventBus() {
    var listeners = {};

    return {
      on: function on(eventName, handler) {
        listeners[eventName] = listeners[eventName] || [];
        listeners[eventName].push(handler);
        return function off() {
          listeners[eventName] = (listeners[eventName] || []).filter(function (entry) {
            return entry !== handler;
          });
        };
      },
      emit: function emit(eventName, payload) {
        (listeners[eventName] || []).slice().forEach(function (handler) {
          handler(payload);
        });
      },
    };
  }

  function createStore(initialState) {
    var state = normalizeState(initialState);
    var listeners = [];

    return {
      getState: function getState() {
        return cloneState(state);
      },
      setState: function setState(nextState, metadata) {
        state = normalizeState(nextState);
        listeners.slice().forEach(function (listener) {
          listener(cloneState(state), metadata || {});
        });
        return cloneState(state);
      },
      subscribe: function subscribe(listener) {
        listeners.push(listener);
        return function unsubscribe() {
          listeners = listeners.filter(function (entry) {
            return entry !== listener;
          });
        };
      },
    };
  }

  function createRuntime(options) {
    var history = options && options.history ? options.history : null;
    var persistence = options && options.persistence ? options.persistence : null;
    var structure = options && options.structure ? options.structure : null;
    var bus = createEventBus();
    var initialState = history
      ? history.getState()
      : persistence
        ? persistence.load()
        : normalizeState(options && options.initialState);
    var store = createStore(initialState);
    var modules = [];

    function syncState(nextState, source) {
      var normalized = normalizeState(nextState);
      var synced = store.setState(normalized, { source: source || 'runtime' });
      if (persistence) {
        persistence.save(synced);
      }
      bus.emit('state:change', {
        source: source || 'runtime',
        state: synced,
      });
      return synced;
    }

    function commit(nextState, source) {
      var normalized = normalizeState(nextState);
      if (!history) {
        return syncState(normalized, source || 'runtime:commit');
      }
      return syncState(history.commit(normalized), source || 'runtime:commit');
    }

    function updateSelection(selection, source) {
      var current = store.getState();
      return syncState({
        cells: current.cells,
        selection: selection,
      }, source || 'runtime:selection');
    }

    function applyStructuralEdit(operation) {
      if (!structure || typeof structure.applyStructuralEdit !== 'function') {
        throw new Error('structure.applyStructuralEdit is required');
      }

      var current = store.getState();
      return commit({
        cells: structure.applyStructuralEdit(current.cells, operation),
        selection: current.selection,
      }, 'runtime:structure');
    }

    function createContext() {
      return {
        bus: bus,
        store: store,
        runtime: api,
      };
    }

    function registerModule(name, initializer) {
      modules.push({
        name: name,
        init: initializer,
      });
      return initializer;
    }

    function start() {
      var context = createContext();
      modules.forEach(function (module) {
        if (typeof module.init === 'function') {
          module.init(context);
        }
      });
      bus.emit('runtime:ready', {
        state: store.getState(),
      });
      return api;
    }

    function undo() {
      if (!history) {
        return null;
      }
      var nextState = history.undo();
      return nextState ? syncState(nextState, 'runtime:undo') : null;
    }

    function redo() {
      if (!history) {
        return null;
      }
      var nextState = history.redo();
      return nextState ? syncState(nextState, 'runtime:redo') : null;
    }

    var api = {
      bus: bus,
      store: store,
      getState: store.getState,
      commit: commit,
      updateSelection: updateSelection,
      applyStructuralEdit: applyStructuralEdit,
      registerModule: registerModule,
      start: start,
      undo: undo,
      redo: redo,
    };

    return api;
  }

  return {
    createEventBus: createEventBus,
    createStore: createStore,
    createRuntime: createRuntime,
  };
});
