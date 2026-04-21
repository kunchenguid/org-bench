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

  function adjustSelectionForStructure(selection, operation) {
    return {
      anchor: adjustPosition(selection.anchor, operation),
      focus: adjustPosition(selection.focus, operation),
    };
  }

  function adjustPosition(position, operation) {
    const next = { row: position.row, col: position.col };
    const axisKey = operation.axis === 'row' ? 'row' : 'col';
    const otherKey = axisKey === 'row' ? 'col' : 'row';

    if (operation.kind === 'insert') {
      if (next[axisKey] >= operation.index) {
        next[axisKey] += 1;
      }
      if (position[axisKey] === operation.index) {
        next[otherKey] = position[otherKey];
      }
      return next;
    }

    if (next[axisKey] > operation.index) {
      next[axisKey] -= 1;
    } else if (next[axisKey] === operation.index) {
      next[axisKey] = Math.max(0, operation.index - 1);
    }

    return next;
  }

  return {
    advanceClipboardState,
    adjustSelectionForStructure,
    beginEditSession,
    commitEditSession,
    createClipboardState,
    matchClipboardState,
    resolveStorageNamespace,
    updateEditSession,
  };
});
