(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetHistory = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createHistory(limit) {
    return {
      undoStack: [],
      redoStack: [],
      limit: limit || 50,
    };
  }

  function recordAction(history, action) {
    history.undoStack.push(action);
    if (history.undoStack.length > history.limit) {
      history.undoStack.shift();
    }
    history.redoStack = [];
  }

  function undo(history) {
    if (!history.undoStack.length) {
      return null;
    }
    const action = history.undoStack.pop();
    history.redoStack.push(action);
    return action;
  }

  function redo(history) {
    if (!history.redoStack.length) {
      return null;
    }
    const action = history.redoStack.pop();
    history.undoStack.push(action);
    return action;
  }

  return {
    createHistory: createHistory,
    recordAction: recordAction,
    undo: undo,
    redo: redo,
  };
});
