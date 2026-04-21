(function (globalScope) {
  'use strict';

  const VALID_TYPES = new Set([
    'commit',
    'paste',
    'cut',
    'clear',
    'insert-row',
    'delete-row',
    'insert-column',
    'delete-column',
  ]);

  class HistoryManager {
    constructor(options) {
      const config = options || {};
      this.limit = normalizeLimit(config.limit);
      this.applyAction = typeof config.applyAction === 'function' ? config.applyAction : function () {};
      this.undoStack = [];
      this.redoStack = [];
    }

    record(action) {
      const normalized = normalizeAction(action);
      this.undoStack.push(normalized);
      if (this.undoStack.length > this.limit) {
        this.undoStack.splice(0, this.undoStack.length - this.limit);
      }
      this.redoStack.length = 0;
      return normalized;
    }

    undo() {
      if (!this.canUndo()) {
        return false;
      }
      const action = this.undoStack.pop();
      this.applyAction(action, 'undo');
      this.redoStack.push(action);
      return true;
    }

    redo() {
      if (!this.canRedo()) {
        return false;
      }
      const action = this.redoStack.pop();
      this.applyAction(action, 'redo');
      this.undoStack.push(action);
      return true;
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    clear() {
      this.undoStack.length = 0;
      this.redoStack.length = 0;
    }

    snapshot() {
      return {
        undoStack: this.undoStack.slice(),
        redoStack: this.redoStack.slice(),
      };
    }

    handleKeydown(event) {
      if (!event || !(event.ctrlKey || event.metaKey)) {
        return false;
      }

      const key = String(event.key || '').toLowerCase();
      const wantsUndo = key === 'z' && !event.shiftKey;
      const wantsRedo = (key === 'z' && event.shiftKey) || key === 'y';
      let handled = false;

      if (wantsUndo) {
        handled = this.undo();
      } else if (wantsRedo) {
        handled = this.redo();
      }

      if (handled && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      return handled;
    }
  }

  function createCommitAction(payload) {
    return normalizeAction({
      type: 'commit',
      changes: payload.before && payload.after ? createChangeSet(payload.before, payload.after) : payload.changes,
      selectionBefore: readValue(payload.selectionBefore, null),
      selectionAfter: readValue(payload.selectionAfter, null),
    });
  }

  function createPasteAction(payload) {
    return normalizeAction({
      type: 'paste',
      changes: payload.before && payload.after ? createChangeSet(payload.before, payload.after) : payload.changes,
      source: readValue(payload.source, null),
      destination: readValue(payload.destination, null),
    });
  }

  function createCutAction(payload) {
    return normalizeAction({
      type: 'cut',
      changes: payload.before && payload.after ? createChangeSet(payload.before, payload.after) : payload.changes,
      source: readValue(payload.source, null),
      destination: readValue(payload.destination, null),
    });
  }

  function createClearAction(payload) {
    return normalizeAction({
      type: 'clear',
      changes: payload.before && payload.after ? createChangeSet(payload.before, payload.after) : payload.changes,
      selection: readValue(payload.selection, null),
    });
  }

  function createInsertRowAction(payload) {
    return normalizeAction({
      type: 'insert-row',
      index: payload.index,
      count: normalizeCount(payload.count),
      before: arrayCopy(payload.before),
      after: arrayCopy(payload.after),
    });
  }

  function createDeleteRowAction(payload) {
    return normalizeAction({
      type: 'delete-row',
      index: payload.index,
      count: normalizeCount(payload.count),
      before: arrayCopy(payload.before),
      after: arrayCopy(payload.after),
    });
  }

  function createInsertColumnAction(payload) {
    return normalizeAction({
      type: 'insert-column',
      index: payload.index,
      count: normalizeCount(payload.count),
      before: arrayCopy(payload.before),
      after: arrayCopy(payload.after),
    });
  }

  function createDeleteColumnAction(payload) {
    return normalizeAction({
      type: 'delete-column',
      index: payload.index,
      count: normalizeCount(payload.count),
      before: arrayCopy(payload.before),
      after: arrayCopy(payload.after),
    });
  }

  function createChangeSet(before, after) {
    const previous = Array.isArray(before) ? before : [];
    const next = Array.isArray(after) ? after : [];
    const length = Math.max(previous.length, next.length);
    const changes = [];

    for (let index = 0; index < length; index += 1) {
      changes.push({
        before: previous[index] === undefined ? null : previous[index],
        after: next[index] === undefined ? null : next[index],
      });
    }

    return changes;
  }

  function normalizeAction(action) {
    if (!action || !VALID_TYPES.has(action.type)) {
      throw new Error('History action must use a supported type.');
    }

    const normalized = { type: action.type };
    const keys = Object.keys(action);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === 'type' || action[key] === undefined) {
        continue;
      }
      normalized[key] = copyValue(action[key]);
    }

    if (requiresChanges(normalized.type)) {
      normalized.changes = Array.isArray(normalized.changes) ? normalized.changes : [];
    }

    return normalized;
  }

  function requiresChanges(type) {
    return type === 'commit' || type === 'paste' || type === 'cut' || type === 'clear';
  }

  function copyValue(value) {
    if (Array.isArray(value)) {
      return value.map(copyValue);
    }
    if (value && typeof value === 'object') {
      const result = {};
      const keys = Object.keys(value);
      for (let index = 0; index < keys.length; index += 1) {
        result[keys[index]] = copyValue(value[keys[index]]);
      }
      return result;
    }
    return value;
  }

  function arrayCopy(value) {
    return Array.isArray(value) ? copyValue(value) : [];
  }

  function readValue(value, fallback) {
    return value === undefined ? fallback : copyValue(value);
  }

  function normalizeLimit(limit) {
    return Number.isInteger(limit) && limit > 0 ? limit : 50;
  }

  function normalizeCount(count) {
    return Number.isInteger(count) && count > 0 ? count : 1;
  }

  const api = {
    HistoryManager,
    createCommitAction,
    createPasteAction,
    createCutAction,
    createClearAction,
    createInsertRowAction,
    createDeleteRowAction,
    createInsertColumnAction,
    createDeleteColumnAction,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.SpreadsheetHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
