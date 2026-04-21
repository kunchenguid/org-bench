;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetHistory = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LIMIT = 50;

  function createHistory() {
    return {
      past: [],
      future: [],
    };
  }

  function recordHistory(history, snapshot) {
    history.past.push(cloneSnapshot(snapshot));
    if (history.past.length > LIMIT) {
      history.past.shift();
    }
    history.future = [];
    return currentSnapshot(history);
  }

  function undoHistory(history) {
    if (history.past.length < 2) {
      return null;
    }

    history.future.push(history.past.pop());
    return currentSnapshot(history);
  }

  function redoHistory(history) {
    if (!history.future.length) {
      return null;
    }

    history.past.push(history.future.pop());
    return currentSnapshot(history);
  }

  function currentSnapshot(history) {
    if (!history.past.length) {
      return null;
    }

    return cloneSnapshot(history.past[history.past.length - 1]);
  }

  function cloneSnapshot(snapshot) {
    return {
      cells: Object.assign({}, snapshot.cells),
      selection: {
        row: snapshot.selection.row,
        col: snapshot.selection.col,
      },
    };
  }

  return {
    createHistory: createHistory,
    recordHistory: recordHistory,
    undoHistory: undoHistory,
    redoHistory: redoHistory,
  };
});
