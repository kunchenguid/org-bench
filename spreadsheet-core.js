'use strict';

(function () {
  const ROWS = 100;
  const COLS = 26;

  function cellKey(row, col) {
    return `${String.fromCharCode(65 + col)}${row + 1}`;
  }

  function parseCell(raw) {
    if (raw === '') {
      return null;
    }

    const trimmed = raw.trim();
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
      const value = Number(trimmed);
      return {
        raw,
        value,
        display: String(value),
        kind: 'number',
      };
    }

    return {
      raw,
      value: raw,
      display: raw,
      kind: 'text',
    };
  }

  function createSpreadsheetState() {
    return {
      rows: ROWS,
      cols: COLS,
      selection: { row: 0, col: 0 },
      cells: new Map(),
      history: {
        past: [],
        future: [],
        limit: 50,
      },
    };
  }

  function commitCell(state, row, col, raw) {
    const key = cellKey(row, col);
    const parsed = parseCell(raw);

    if (parsed) {
      state.cells.set(key, parsed);
    } else {
      state.cells.delete(key);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function moveSelection(state, rowDelta, colDelta) {
    state.selection = {
      row: clamp(state.selection.row + rowDelta, 0, state.rows - 1),
      col: clamp(state.selection.col + colDelta, 0, state.cols - 1),
    };

    return state.selection;
  }

  function snapshotState(state) {
    const snapshot = {
      selection: { ...state.selection },
      cells: {},
    };

    for (const [key, cell] of state.cells.entries()) {
      snapshot.cells[key] = cell.raw;
    }

    return snapshot;
  }

  function restoreSnapshot(state, snapshot) {
    state.selection = { ...snapshot.selection };
    state.cells.clear();

    for (const [key, raw] of Object.entries(snapshot.cells)) {
      const position = decodeCellKey(key);
      if (!position) {
        continue;
      }

      commitCell(state, position.row, position.col, raw);
    }
  }

  function pushHistory(history, snapshot) {
    history.past.push(snapshot);
    if (history.past.length > history.limit) {
      history.past.shift();
    }
    history.future.length = 0;
  }

  function applyCellEdit(state, row, col, raw) {
    pushHistory(state.history, snapshotState(state));
    state.selection = { row, col };
    commitCell(state, row, col, raw);
  }

  function undo(state) {
    const previous = state.history.past.pop();
    if (!previous) {
      return false;
    }

    state.history.future.push(snapshotState(state));
    restoreSnapshot(state, previous);
    return true;
  }

  function redo(state) {
    const next = state.history.future.pop();
    if (!next) {
      return false;
    }

    state.history.past.push(snapshotState(state));
    restoreSnapshot(state, next);
    return true;
  }

  function serializeState(state, namespace) {
    const payload = {
      selection: state.selection,
      cells: {},
    };

    for (const [key, cell] of state.cells.entries()) {
      payload.cells[key] = cell.raw;
    }

    return {
      [`${namespace}spreadsheet`]: JSON.stringify(payload),
    };
  }

  function decodeCellKey(key) {
    const match = /^([A-Z])(\d+)$/.exec(key);
    if (!match) {
      return null;
    }

    return {
      row: Number(match[2]) - 1,
      col: match[1].charCodeAt(0) - 65,
    };
  }

  function deserializeState(entries, namespace) {
    const state = createSpreadsheetState();
    const rawPayload = entries[`${namespace}spreadsheet`];

    if (!rawPayload) {
      return state;
    }

    const payload = JSON.parse(rawPayload);
    state.selection = {
      row: clamp(payload.selection?.row ?? 0, 0, ROWS - 1),
      col: clamp(payload.selection?.col ?? 0, 0, COLS - 1),
    };

    for (const [key, raw] of Object.entries(payload.cells || {})) {
      const position = decodeCellKey(key);
      if (!position) {
        continue;
      }

      commitCell(state, position.row, position.col, raw);
    }

    return state;
  }

  const api = {
    ROWS,
    COLS,
    cellKey,
    createSpreadsheetState,
    commitCell,
    moveSelection,
    applyCellEdit,
    undo,
    redo,
    serializeState,
    deserializeState,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.SpreadsheetCore = api;
  }
})();
