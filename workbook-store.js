'use strict';

const formulaEngineApi = resolveFormulaEngineApi();
const updateFormulaForStructuralChange = formulaEngineApi.updateFormulaForStructuralChange || function passthrough(formula) {
  return formula;
};

const DEFAULT_ROWS = 100;
const DEFAULT_COLUMNS = 26;
const DEFAULT_HISTORY_LIMIT = 50;
const STORAGE_SUFFIX = 'workbook-state';

function createWorkbookStore(options) {
  const settings = options || {};
  const rows = settings.rows || DEFAULT_ROWS;
  const columns = settings.columns || DEFAULT_COLUMNS;
  const maxHistory = settings.maxHistory || DEFAULT_HISTORY_LIMIT;
  const storage = settings.storage || null;
  const storageKey = createStorageKey(settings.namespace);

  let state = loadState(storage, storageKey, rows, columns);
  let undoStack = [];
  let redoStack = [];
  let evaluatedCache = Object.create(null);

  function getSnapshot() {
    return cloneState(state);
  }

  function getCell(cellId) {
    return state.cells[cellId] ? { raw: state.cells[cellId].raw } : null;
  }

  function getSelection() {
    return cloneSelection(state.selection);
  }

  function selectCell(row, col) {
    state.selection = createSelection(row, col, row, col, row, col, rows, columns);
    persist();
    return getSelection();
  }

  function selectRange(start, end, active) {
    const activePoint = active || end;
    state.selection = createSelection(
      activePoint.row,
      activePoint.col,
      start.row,
      start.col,
      end.row,
      end.col,
      rows,
      columns
    );
    persist();
    return getSelection();
  }

  function commitCell(row, col, raw) {
    const cellId = coordsToCellId(row, col);
    const nextState = cloneState(state);
    applyRawValue(nextState.cells, cellId, raw);
    nextState.selection = createSelection(row, col, row, col, row, col, rows, columns);
    recordAction('commit', { cellId }, nextState);
    return getCell(cellId);
  }

  function pasteBlock(startRow, startCol, matrix) {
    const nextState = cloneState(state);
    const rowCount = Array.isArray(matrix) ? matrix.length : 0;
    let maxCol = startCol;

    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      const rowValues = Array.isArray(matrix[rowOffset]) ? matrix[rowOffset] : [];
      maxCol = Math.max(maxCol, startCol + rowValues.length - 1);
      for (let colOffset = 0; colOffset < rowValues.length; colOffset += 1) {
        const cellId = coordsToCellId(startRow + rowOffset, startCol + colOffset);
        applyRawValue(nextState.cells, cellId, rowValues[colOffset]);
      }
    }

    const endRow = Math.max(startRow, startRow + rowCount - 1);
    nextState.selection = createSelection(startRow, startCol, startRow, startCol, endRow, maxCol, rows, columns);
    recordAction('paste', { startRow, startCol }, nextState);
  }

  function clearSelection() {
    const range = selectionToBounds(state.selection);
    const nextState = cloneState(state);
    forEachCellInBounds(range, function clearCell(row, col) {
      delete nextState.cells[coordsToCellId(row, col)];
    });
    recordAction('clear', { range }, nextState);
  }

  function cutSelection(range, destination) {
    const bounds = normalizeBounds(range.start, range.end, rows, columns);
    const nextState = cloneState(state);
    const snapshot = [];

    forEachCellInBounds(bounds, function capture(row, col) {
      const sourceCellId = coordsToCellId(row, col);
      const targetRow = destination.row + (row - bounds.start.row);
      const targetCol = destination.col + (col - bounds.start.col);
      const targetCellId = coordsToCellId(targetRow, targetCol);
      snapshot.push({ targetCellId, raw: nextState.cells[sourceCellId] ? nextState.cells[sourceCellId].raw : '' });
      delete nextState.cells[sourceCellId];
    });

    for (let index = 0; index < snapshot.length; index += 1) {
      applyRawValue(nextState.cells, snapshot[index].targetCellId, snapshot[index].raw);
    }

    const endRow = destination.row + (bounds.end.row - bounds.start.row);
    const endCol = destination.col + (bounds.end.col - bounds.start.col);
    nextState.selection = createSelection(destination.row, destination.col, destination.row, destination.col, endRow, endCol, rows, columns);
    recordAction('cut', { range: bounds, destination }, nextState);
  }

  function insertRows(atRow, count) {
    const nextState = cloneState(state);
    nextState.cells = applyStructuralChange(nextState.cells, { type: 'insert-row', index: atRow, count });
    nextState.selection = shiftSelectionRows(nextState.selection, atRow, count, rows + count, columns);
    recordAction('insert-rows', { atRow, count }, nextState);
  }

  function deleteRows(atRow, count) {
    const nextState = cloneState(state);
    nextState.cells = applyStructuralChange(nextState.cells, { type: 'delete-row', index: atRow, count });
    nextState.selection = shiftSelectionRows(nextState.selection, atRow + count, -count, rows, columns);
    recordAction('delete-rows', { atRow, count }, nextState);
  }

  function insertColumns(atCol, count) {
    const nextState = cloneState(state);
    nextState.cells = applyStructuralChange(nextState.cells, { type: 'insert-column', index: atCol, count });
    nextState.selection = shiftSelectionColumns(nextState.selection, atCol, count, rows, columns + count);
    recordAction('insert-columns', { atCol, count }, nextState);
  }

  function deleteColumns(atCol, count) {
    const nextState = cloneState(state);
    nextState.cells = applyStructuralChange(nextState.cells, { type: 'delete-column', index: atCol, count });
    nextState.selection = shiftSelectionColumns(nextState.selection, atCol + count, -count, rows, columns);
    recordAction('delete-columns', { atCol, count }, nextState);
  }

  function undo() {
    if (!undoStack.length) {
      return false;
    }

    const entry = undoStack.pop();
    redoStack.push(entry);
    state = cloneState(entry.beforeState);
    clearEvaluatedCache();
    persist();
    return true;
  }

  function redo() {
    if (!redoStack.length) {
      return false;
    }

    const entry = redoStack.pop();
    undoStack.push(entry);
    state = cloneState(entry.afterState);
    clearEvaluatedCache();
    persist();
    return true;
  }

  function undoStackSize() {
    return undoStack.length;
  }

  function redoStackSize() {
    return redoStack.length;
  }

  function setEvaluatedCell(cellId, payload) {
    evaluatedCache[cellId] = cloneValue(payload);
  }

  function getEvaluatedCell(cellId) {
    return evaluatedCache[cellId] ? cloneValue(evaluatedCache[cellId]) : null;
  }

  function clearEvaluatedCache() {
    evaluatedCache = Object.create(null);
  }

  function getActionHistory() {
    return undoStack.map(function mapEntry(entry) {
      return {
        type: entry.type,
        meta: cloneValue(entry.meta),
      };
    });
  }

  function persist() {
    if (!storage || typeof storage.setItem !== 'function') {
      return;
    }

    storage.setItem(storageKey, JSON.stringify({
      cells: state.cells,
      selection: state.selection,
    }));
  }

  function recordAction(type, meta, nextState) {
    undoStack.push({
      type,
      meta: meta || {},
      beforeState: cloneState(state),
      afterState: cloneState(nextState),
    });

    if (undoStack.length > maxHistory) {
      undoStack = undoStack.slice(undoStack.length - maxHistory);
    }

    redoStack = [];
    state = nextState;
    clearEvaluatedCache();
    persist();
  }

  return {
    clearSelection,
    clearEvaluatedCache,
    commitCell,
    cutSelection,
    deleteColumns,
    deleteRows,
    getActionHistory,
    getCell,
    getEvaluatedCell,
    getSelection,
    getSnapshot,
    insertColumns,
    insertRows,
    pasteBlock,
    redo,
    redoStackSize,
    selectCell,
    selectRange,
    setEvaluatedCell,
    undo,
    undoStackSize,
  };
}

function createStorageKey(namespace) {
  return String(namespace || 'spreadsheet') + ':' + STORAGE_SUFFIX;
}

function loadState(storage, storageKey, rows, columns) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      cells: Object.create(null),
      selection: createSelection(1, 1, 1, 1, 1, 1, rows, columns),
    };
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      throw new Error('empty');
    }

    const parsed = JSON.parse(raw);
    const cells = sanitizeCells(parsed.cells);
    const selection = parsed.selection || {};
    const active = selection.active || { row: 1, col: 1 };
    const start = selection.range && selection.range.start ? selection.range.start : active;
    const end = selection.range && selection.range.end ? selection.range.end : active;

    return {
      cells,
      selection: createSelection(active.row, active.col, start.row, start.col, end.row, end.col, rows, columns),
    };
  } catch (error) {
    return {
      cells: Object.create(null),
      selection: createSelection(1, 1, 1, 1, 1, 1, rows, columns),
    };
  }
}

function sanitizeCells(input) {
  const result = Object.create(null);
  if (!input || typeof input !== 'object') {
    return result;
  }

  const keys = Object.keys(input);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (input[key] && typeof input[key].raw === 'string' && input[key].raw !== '') {
      result[key] = { raw: input[key].raw };
    }
  }
  return result;
}

function cloneState(source) {
  return {
    cells: cloneCells(source.cells),
    selection: cloneSelection(source.selection),
  };
}

function cloneCells(source) {
  const result = Object.create(null);
  const keys = Object.keys(source || {});
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    result[key] = { raw: source[key].raw };
  }
  return result;
}

function cloneSelection(selection) {
  return {
    active: { row: selection.active.row, col: selection.active.col },
    anchor: { row: selection.anchor.row, col: selection.anchor.col },
    range: {
      start: { row: selection.range.start.row, col: selection.range.start.col },
      end: { row: selection.range.end.row, col: selection.range.end.col },
    },
    activeCellId: selection.activeCellId,
  };
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function applyRawValue(cells, cellId, raw) {
  if (raw == null || raw === '') {
    delete cells[cellId];
    return;
  }

  cells[cellId] = { raw: String(raw) };
}

function createSelection(activeRow, activeCol, startRow, startCol, endRow, endCol, maxRows, maxCols) {
  const bounds = normalizeBounds(
    { row: startRow, col: startCol },
    { row: endRow, col: endCol },
    maxRows,
    maxCols
  );
  const active = clampPoint({ row: activeRow, col: activeCol }, maxRows, maxCols);

  return {
    active,
    anchor: { row: bounds.start.row, col: bounds.start.col },
    range: bounds,
    activeCellId: coordsToCellId(active.row, active.col),
  };
}

function selectionToBounds(selection) {
  return normalizeBounds(selection.range.start, selection.range.end, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
}

function normalizeBounds(start, end, maxRows, maxCols) {
  const safeStart = clampPoint(start, maxRows, maxCols);
  const safeEnd = clampPoint(end, maxRows, maxCols);
  return {
    start: {
      row: Math.min(safeStart.row, safeEnd.row),
      col: Math.min(safeStart.col, safeEnd.col),
    },
    end: {
      row: Math.max(safeStart.row, safeEnd.row),
      col: Math.max(safeStart.col, safeEnd.col),
    },
  };
}

function clampPoint(point, maxRows, maxCols) {
  return {
    row: clamp(point.row, 1, maxRows),
    col: clamp(point.col, 1, maxCols),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}

function forEachCellInBounds(bounds, callback) {
  for (let row = bounds.start.row; row <= bounds.end.row; row += 1) {
    for (let col = bounds.start.col; col <= bounds.end.col; col += 1) {
      callback(row, col);
    }
  }
}

function applyStructuralChange(cells, change) {
  const result = Object.create(null);
  const keys = Object.keys(cells);

  for (let index = 0; index < keys.length; index += 1) {
    const cellId = keys[index];
    const coords = cellIdToCoords(cellId);
    const nextCoords = shiftCoordsForStructureChange(coords, change);

    if (!nextCoords) {
      continue;
    }

    result[coordsToCellId(nextCoords.row, nextCoords.col)] = {
      raw: rewriteRawForStructuralChange(cells[cellId].raw, change),
    };
  }

  return result;
}

function shiftCoordsForStructureChange(coords, change) {
  if (change.type === 'insert-row') {
    return {
      row: coords.row >= change.index ? coords.row + change.count : coords.row,
      col: coords.col,
    };
  }

  if (change.type === 'delete-row') {
    if (coords.row >= change.index && coords.row < change.index + change.count) {
      return null;
    }

    return {
      row: coords.row >= change.index + change.count ? coords.row - change.count : coords.row,
      col: coords.col,
    };
  }

  if (change.type === 'insert-column') {
    return {
      row: coords.row,
      col: coords.col >= change.index ? coords.col + change.count : coords.col,
    };
  }

  if (change.type === 'delete-column') {
    if (coords.col >= change.index && coords.col < change.index + change.count) {
      return null;
    }

    return {
      row: coords.row,
      col: coords.col >= change.index + change.count ? coords.col - change.count : coords.col,
    };
  }

  return coords;
}

function rewriteRawForStructuralChange(raw, change) {
  if (typeof raw !== 'string' || raw[0] !== '=') {
    return raw;
  }

  return updateFormulaForStructuralChange(raw, change);
}

function shiftSelectionRows(selection, atRow, delta, maxRows, maxCols) {
  return shiftSelection(selection, function shift(point) {
    return {
      row: point.row >= atRow ? point.row + delta : point.row,
      col: point.col,
    };
  }, maxRows, maxCols);
}

function shiftSelectionColumns(selection, atCol, delta, maxRows, maxCols) {
  return shiftSelection(selection, function shift(point) {
    return {
      row: point.row,
      col: point.col >= atCol ? point.col + delta : point.col,
    };
  }, maxRows, maxCols);
}

function shiftSelection(selection, transformer, maxRows, maxCols) {
  const nextActive = transformer(selection.active);
  const nextStart = transformer(selection.range.start);
  const nextEnd = transformer(selection.range.end);
  return createSelection(nextActive.row, nextActive.col, nextStart.row, nextStart.col, nextEnd.row, nextEnd.col, maxRows, maxCols);
}

function coordsToCellId(row, col) {
  return columnNumberToName(col) + String(row);
}

function cellIdToCoords(cellId) {
  const match = /^([A-Z]+)(\d+)$/.exec(String(cellId).toUpperCase());
  if (!match) {
    throw new Error('Invalid cell id: ' + cellId);
  }

  return {
    row: Number(match[2]),
    col: columnNameToNumber(match[1]),
  };
}

function columnNumberToName(column) {
  let value = Number(column);
  let result = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result || 'A';
}

function columnNameToNumber(name) {
  let result = 0;
  const value = String(name).toUpperCase();

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 26) + (value.charCodeAt(index) - 64);
  }

  return result;
}

function resolveFormulaEngineApi() {
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    return require('./src/formula-engine.js');
  }

  if (typeof window !== 'undefined' && window.SpreadsheetFormulaEngine) {
    return window.SpreadsheetFormulaEngine;
  }

  return {};
}

const api = {
  cellIdToCoords,
  coordsToCellId,
  createWorkbookStore,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.WorkbookStore = api;
}
