function normalizeChanges(changes) {
  return Array.isArray(changes) ? changes.filter(Boolean).map(cloneChange) : [];
}

function cloneChange(change) {
  return {
    id: change.id,
    type: change.type || 'cell',
    previous: change.previous,
    next: change.next,
    meta: change.meta ? { ...change.meta } : undefined,
  };
}

function createHistoryEntry(action) {
  return {
    label: action.label || 'change',
    changes: normalizeChanges(action.changes),
  };
}

function createHistoryManager(options) {
  const config = options || {};
  const limit = Number.isInteger(config.limit) && config.limit > 0 ? config.limit : 50;
  const applyChange = typeof config.applyChange === 'function' ? config.applyChange : function noop() {};
  const undoStack = [];
  const redoStack = [];

  function record(action) {
    const entry = createHistoryEntry(action || {});

    if (entry.changes.length === 0) {
      return false;
    }

    undoStack.push(entry);
    if (undoStack.length > limit) {
      undoStack.splice(0, undoStack.length - limit);
    }
    redoStack.length = 0;
    return true;
  }

  function applyEntry(entry, direction) {
    const source = direction === 'undo' ? entry.changes.slice().reverse() : entry.changes;

    for (const change of source) {
      applyChange({
        id: change.id,
        type: change.type,
        value: direction === 'undo' ? change.previous : change.next,
        previous: change.previous,
        next: change.next,
        meta: change.meta,
      });
    }
  }

  function undo() {
    if (undoStack.length === 0) {
      return null;
    }

    const entry = undoStack.pop();
    applyEntry(entry, 'undo');
    redoStack.push(entry);
    return entry;
  }

  function redo() {
    if (redoStack.length === 0) {
      return null;
    }

    const entry = redoStack.pop();
    applyEntry(entry, 'redo');
    undoStack.push(entry);
    return entry;
  }

  return {
    record,
    undo,
    redo,
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    size() {
      return undoStack.length;
    },
    peekUndo() {
      return undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}

function getHistoryShortcut(event) {
  if (!event || event.altKey) {
    return null;
  }

  const key = String(event.key || '').toLowerCase();
  const primary = Boolean(event.metaKey || event.ctrlKey);

  if (!primary) {
    return null;
  }

  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (key === 'y') {
    return 'redo';
  }

  return null;
}

const api = {
  createHistoryManager,
  getHistoryShortcut,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetHistory = api;
}
