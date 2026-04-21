'use strict';

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
  const formulaHelpers = settings.formulaHelpers || {};
  const shiftFormula = typeof formulaHelpers.shiftFormula === 'function'
    ? formulaHelpers.shiftFormula
    : function passthroughFormula(raw) {
      return raw;
    };

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
    state.selection = createSelection(row, col, row, col, row, col, rows, columns, { row, col });
    persist();
    return getSelection();
  }

  function selectRange(start, end, active, anchor) {
    const activePoint = active || end;
    const anchorPoint = anchor || state.selection.anchor || start;
    state.selection = createSelection(
      activePoint.row,
      activePoint.col,
      start.row,
      start.col,
      end.row,
      end.col,
      rows,
      columns,
      anchorPoint
    );
    persist();
    return getSelection();
  }

  function commitCell(row, col, raw) {
    const cellId = coordsToCellId(row, col);
    const nextState = cloneState(state);
    applyRawValue(nextState.cells, cellId, raw);
    nextState.selection = createSelection(row, col, row, col, row, col, rows, columns, { row, col });
    recordAction('commit', { cellId }, nextState);
    return getCell(cellId);
  }

  function pasteBlock(startRow, startCol, matrix) {
    const nextState = cloneState(state);
    const rowCount = Array.isArray(matrix) ? matrix.length : 0;
    let maxCol = startCol;
    let maxRow = startRow;
    let wroteCell = false;

    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      const rowValues = Array.isArray(matrix[rowOffset]) ? matrix[rowOffset] : [];
      for (let colOffset = 0; colOffset < rowValues.length; colOffset += 1) {
        const targetRow = startRow + rowOffset;
        const targetCol = startCol + colOffset;
        if (targetRow < 1 || targetRow > rows || targetCol < 1 || targetCol > columns) {
          continue;
        }

        const cellId = coordsToCellId(targetRow, targetCol);
        applyRawValue(nextState.cells, cellId, rowValues[colOffset]);
        maxRow = Math.max(maxRow, targetRow);
        maxCol = Math.max(maxCol, targetCol);
        wroteCell = true;
      }
    }

    nextState.selection = createSelection(
      startRow,
      startCol,
      startRow,
      startCol,
      wroteCell ? maxRow : startRow,
      wroteCell ? maxCol : startCol,
      rows,
      columns,
      { row: startRow, col: startCol }
    );
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
    const rowOffset = destination.row - bounds.start.row;
    const colOffset = destination.col - bounds.start.col;
    let maxRow = destination.row;
    let maxCol = destination.col;
    let wroteCell = false;

    forEachCellInBounds(bounds, function capture(row, col) {
      const sourceCellId = coordsToCellId(row, col);
      const targetRow = destination.row + (row - bounds.start.row);
      const targetCol = destination.col + (col - bounds.start.col);
      if (targetRow >= 1 && targetRow <= rows && targetCol >= 1 && targetCol <= columns) {
        const targetCellId = coordsToCellId(targetRow, targetCol);
        const sourceRaw = nextState.cells[sourceCellId] ? nextState.cells[sourceCellId].raw : '';
        snapshot.push({
          targetCellId,
          raw: sourceRaw && sourceRaw[0] === '=' ? shiftFormula(sourceRaw, rowOffset, colOffset) : sourceRaw,
        });
        maxRow = Math.max(maxRow, targetRow);
        maxCol = Math.max(maxCol, targetCol);
        wroteCell = true;
      }
      delete nextState.cells[sourceCellId];
    });

    for (let index = 0; index < snapshot.length; index += 1) {
      applyRawValue(nextState.cells, snapshot[index].targetCellId, snapshot[index].raw);
    }

    nextState.selection = createSelection(
      destination.row,
      destination.col,
      destination.row,
      destination.col,
      wroteCell ? maxRow : destination.row,
      wroteCell ? maxCol : destination.col,
      rows,
      columns,
      { row: destination.row, col: destination.col }
    );
    recordAction('cut', { range: bounds, destination }, nextState);
  }

  function insertRows(atRow, count) {
    const nextState = cloneState(state);
    nextState.cells = shiftRows(nextState.cells, atRow, count);
    nextState.selection = shiftSelectionRows(nextState.selection, atRow, count, rows + count, columns);
    recordAction('insert-rows', { atRow, count }, nextState);
  }

  function deleteRows(atRow, count) {
    const nextState = cloneState(state);
    nextState.cells = removeRows(nextState.cells, atRow, count);
    nextState.selection = shiftSelectionRows(nextState.selection, atRow + count, -count, rows, columns);
    recordAction('delete-rows', { atRow, count }, nextState);
  }

  function insertColumns(atCol, count) {
    const nextState = cloneState(state);
    nextState.cells = shiftColumns(nextState.cells, atCol, count);
    nextState.selection = shiftSelectionColumns(nextState.selection, atCol, count, rows, columns + count);
    recordAction('insert-columns', { atCol, count }, nextState);
  }

  function deleteColumns(atCol, count) {
    const nextState = cloneState(state);
    nextState.cells = removeColumns(nextState.cells, atCol, count);
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
      selection: createSelection(1, 1, 1, 1, 1, 1, rows, columns, { row: 1, col: 1 }),
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
    const anchor = selection.anchor || active;
    const start = selection.range && selection.range.start ? selection.range.start : active;
    const end = selection.range && selection.range.end ? selection.range.end : active;

    return {
      cells,
      selection: createSelection(active.row, active.col, start.row, start.col, end.row, end.col, rows, columns, anchor),
    };
  } catch (error) {
    return {
      cells: Object.create(null),
      selection: createSelection(1, 1, 1, 1, 1, 1, rows, columns, { row: 1, col: 1 }),
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

function createSelection(activeRow, activeCol, startRow, startCol, endRow, endCol, maxRows, maxCols, anchorPoint) {
  const bounds = normalizeBounds(
    { row: startRow, col: startCol },
    { row: endRow, col: endCol },
    maxRows,
    maxCols
  );
  const active = clampPoint({ row: activeRow, col: activeCol }, maxRows, maxCols);
  const anchor = clampPoint(anchorPoint || active, maxRows, maxCols);

  return {
    active,
    anchor: { row: anchor.row, col: anchor.col },
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

function shiftRows(cells, atRow, delta) {
  const result = Object.create(null);
  const keys = Object.keys(cells);
  for (let index = 0; index < keys.length; index += 1) {
    const cellId = keys[index];
    const coords = cellIdToCoords(cellId);
    const nextRow = coords.row >= atRow ? coords.row + delta : coords.row;
    result[coordsToCellId(nextRow, coords.col)] = { raw: cells[cellId].raw };
  }
  return result;
}

function removeRows(cells, atRow, count) {
  const result = Object.create(null);
  const endRow = atRow + count - 1;
  const keys = Object.keys(cells);
  for (let index = 0; index < keys.length; index += 1) {
    const cellId = keys[index];
    const coords = cellIdToCoords(cellId);
    if (coords.row >= atRow && coords.row <= endRow) {
      continue;
    }

    const nextRow = coords.row > endRow ? coords.row - count : coords.row;
    result[coordsToCellId(nextRow, coords.col)] = { raw: cells[cellId].raw };
  }
  return result;
}

function shiftColumns(cells, atCol, delta) {
  const result = Object.create(null);
  const keys = Object.keys(cells);
  for (let index = 0; index < keys.length; index += 1) {
    const cellId = keys[index];
    const coords = cellIdToCoords(cellId);
    const nextCol = coords.col >= atCol ? coords.col + delta : coords.col;
    result[coordsToCellId(coords.row, nextCol)] = { raw: cells[cellId].raw };
  }
  return result;
}

function removeColumns(cells, atCol, count) {
  const result = Object.create(null);
  const endCol = atCol + count - 1;
  const keys = Object.keys(cells);
  for (let index = 0; index < keys.length; index += 1) {
    const cellId = keys[index];
    const coords = cellIdToCoords(cellId);
    if (coords.col >= atCol && coords.col <= endCol) {
      continue;
    }

    const nextCol = coords.col > endCol ? coords.col - count : coords.col;
    result[coordsToCellId(coords.row, nextCol)] = { raw: cells[cellId].raw };
  }
  return result;
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
