(function (global) {
  function createStore(initialState) {
    var state = Object.assign({
      selection: { row: 1, column: 1 },
      mode: 'idle',
      modules: {},
      metadata: {}
    }, initialState || {});
    var listeners = [];

    function getState() {
      return state;
    }

    function setState(nextState, source) {
      state = Object.assign({}, state, nextState || {});
      listeners.slice().forEach(function (listener) {
        listener(state, source || 'unknown');
      });
      return state;
    }

    function subscribe(listener) {
      listeners.push(listener);
      return function unsubscribe() {
        listeners = listeners.filter(function (entry) {
          return entry !== listener;
        });
      };
    }

    return {
      getState: getState,
      setState: setState,
      subscribe: subscribe
    };
  }

  global.SpreadsheetStore = {
    createStore: createStore
  };
}(window));
