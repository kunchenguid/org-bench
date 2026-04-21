(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function createHistory(limit) {
    return {
      limit: typeof limit === 'number' ? limit : 50,
      undo: [],
      redo: [],
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function recordAction(history, before, after, label) {
    const beforeSnapshot = cloneState(before);
    const afterSnapshot = cloneState(after);
    if (JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot)) {
      return false;
    }
    history.undo.push({ before: beforeSnapshot, after: afterSnapshot, label: label });
    if (history.undo.length > history.limit) {
      history.undo.shift();
    }
    history.redo = [];
    return true;
  }

  function undoAction(history) {
    const entry = history.undo.pop();
    if (!entry) {
      return null;
    }
    history.redo.push(entry);
    return { state: cloneState(entry.before), label: entry.label };
  }

  function redoAction(history) {
    const entry = history.redo.pop();
    if (!entry) {
      return null;
    }
    history.undo.push(entry);
    return { state: cloneState(entry.after), label: entry.label };
  }

  return {
    createHistory: createHistory,
    recordAction: recordAction,
    undoAction: undoAction,
    redoAction: redoAction,
  };
});
