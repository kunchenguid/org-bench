(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetAppState = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function resolveStorageNamespace(env) {
    if (env && typeof env.__BENCHMARK_STORAGE_NAMESPACE__ === 'string' && env.__BENCHMARK_STORAGE_NAMESPACE__) {
      return env.__BENCHMARK_STORAGE_NAMESPACE__;
    }
    return env && env.location && env.location.href ? env.location.href : 'spreadsheet';
  }

  function beginEditSession(cellId, previous, replace, seedText) {
    return {
      cellId,
      previous,
      draft: seedText !== undefined ? seedText : (replace ? '' : previous),
    };
  }

  function updateEditSession(session, draft) {
    return Object.assign({}, session, { draft });
  }

  function commitEditSession(session, cancel) {
    return cancel ? session.previous : session.draft;
  }

  function createClipboardState(text, bounds, cut) {
    return {
      text,
      bounds,
      cut: Boolean(cut),
    };
  }

  function matchClipboardState(state, text) {
    return state && state.text === text ? state : null;
  }

  function advanceClipboardState(state) {
    if (!state) {
      return null;
    }
    return state.cut ? null : state;
  }

  return {
    advanceClipboardState,
    beginEditSession,
    commitEditSession,
    createClipboardState,
    matchClipboardState,
    resolveStorageNamespace,
    updateEditSession,
  };
});
