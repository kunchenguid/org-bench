(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function statesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function createHistory(options) {
    const limit = Math.max(1, options && options.limit ? options.limit : 50);
    let currentState = cloneState((options && options.initialState) || {
      cells: {},
      selection: { row: 1, col: 1 },
    });
    const undoStack = [];
    const redoStack = [];

    function getState() {
      return cloneState(currentState);
    }

    function commit(nextState) {
      const snapshot = cloneState(nextState);
      if (statesEqual(currentState, snapshot)) {
        return getState();
      }

      undoStack.push(cloneState(currentState));
      if (undoStack.length > limit) {
        undoStack.splice(0, undoStack.length - limit);
      }

      currentState = snapshot;
      redoStack.length = 0;
      return getState();
    }

    function undo() {
      if (!undoStack.length) {
        return null;
      }

      redoStack.push(cloneState(currentState));
      currentState = undoStack.pop();
      return getState();
    }

    function redo() {
      if (!redoStack.length) {
        return null;
      }

      undoStack.push(cloneState(currentState));
      currentState = redoStack.pop();
      return getState();
    }

    return {
      getState,
      commit,
      undo,
      redo,
      canUndo() {
        return undoStack.length > 0;
      },
      canRedo() {
        return redoStack.length > 0;
      },
    };
  }

  return { createHistory };
});
