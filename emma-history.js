(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  root.EmmaHistory = exported;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const LIMIT = 50;

  function createHistory(snapshot) {
    return {
      past: [],
      present: cloneSnapshot(snapshot),
      future: [],
    };
  }

  function recordSnapshot(history, snapshot) {
    const past = history.past.concat([cloneSnapshot(history.present)]);
    return {
      past: past.slice(Math.max(0, past.length - LIMIT)),
      present: cloneSnapshot(snapshot),
      future: [],
    };
  }

  function undoSnapshot(history) {
    if (!history.past.length) {
      return { history: history, snapshot: cloneSnapshot(history.present) };
    }
    const snapshot = cloneSnapshot(history.past[history.past.length - 1]);
    return {
      history: {
        past: history.past.slice(0, -1),
        present: snapshot,
        future: [cloneSnapshot(history.present)].concat(history.future),
      },
      snapshot: snapshot,
    };
  }

  function redoSnapshot(history) {
    if (!history.future.length) {
      return { history: history, snapshot: cloneSnapshot(history.present) };
    }
    const snapshot = cloneSnapshot(history.future[0]);
    return {
      history: {
        past: history.past.concat([cloneSnapshot(history.present)]),
        present: snapshot,
        future: history.future.slice(1),
      },
      snapshot: snapshot,
    };
  }

  function cloneSnapshot(snapshot) {
    return {
      cells: Object.assign({}, snapshot.cells),
      active: snapshot.active,
      rangeAnchor: snapshot.rangeAnchor ? { col: snapshot.rangeAnchor.col, row: snapshot.rangeAnchor.row } : null,
    };
  }

  return {
    createHistory: createHistory,
    recordSnapshot: recordSnapshot,
    undoSnapshot: undoSnapshot,
    redoSnapshot: redoSnapshot,
  };
});
