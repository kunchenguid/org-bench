'use strict';

function createSpreadsheetStore(options) {
  const rows = options.rows;
  const cols = options.cols;
  const maxHistory = options.maxHistory || 50;
  let cells = createCellMap(options.initialCells || {});
  let active = { row: 0, col: 0 };
  let range = { start: copyCell(active), end: copyCell(active) };
  let anchor = copyCell(active);
  let mode = 'selected';
  let draft = '';
  let history = [];
  let future = [];

  function getCellRaw(row, col) {
    return cells[cellKey(row, col)] || '';
  }

  function getCells() {
    const refs = {};

    Object.keys(cells).forEach((key) => {
      const parts = key.split(':');
      refs[toCellRef(Number(parts[0]), Number(parts[1]))] = cells[key];
    });

    return refs;
  }

  function getState() {
    return {
      rows,
      cols,
      active: copyCell(active),
      range: { start: copyCell(range.start), end: copyCell(range.end) },
      mode,
      draft,
      formulaBarValue: mode === 'editing' ? draft : getCellRaw(active.row, active.col),
    };
  }

  function setSelection(row, col, extend) {
    active = clampCell({ row, col });

    if (extend) {
      range = { start: copyCell(anchor), end: copyCell(active) };
      return;
    }

    anchor = copyCell(active);
    range = { start: copyCell(active), end: copyCell(active) };
  }

  function selectCell(row, col, options) {
    mode = 'selected';
    draft = '';
    setSelection(row, col, Boolean(options && options.extend));
  }

  function setRange(nextRange) {
    mode = 'selected';
    draft = '';
    anchor = clampCell(nextRange.start);
    active = clampCell(nextRange.end);
    range = { start: copyCell(anchor), end: copyCell(active) };
  }

  function startEdit() {
    mode = 'editing';
    draft = getCellRaw(active.row, active.col);
  }

  function startFormulaBarEdit() {
    startEdit();
  }

  function beginTyping(text) {
    mode = 'editing';
    draft = text;
  }

  function updateDraft(text) {
    if (mode !== 'editing') {
      startEdit();
    }
    draft = text;
  }

  function cancelEdit() {
    mode = 'selected';
    draft = '';
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > maxHistory) {
      history = history.slice(history.length - maxHistory);
    }
    future = [];
  }

  function commitEdit(options) {
    const previous = getCellRaw(active.row, active.col);
    const next = draft;

    if (previous !== next) {
      pushHistory();
      writeCell(active.row, active.col, next);
    }

    mode = 'selected';
    draft = '';
    moveAfterCommit(options && options.move);
  }

  function moveActive(direction, options) {
    const delta = movement(direction);
    setSelection(active.row + delta.row, active.col + delta.col, Boolean(options && options.extend));
  }

  function clearSelection() {
    const covered = coveredCells(range);
    const changed = covered.some((cell) => getCellRaw(cell.row, cell.col) !== '');

    if (!changed) {
      return;
    }

    pushHistory();
    covered.forEach((cell) => writeCell(cell.row, cell.col, ''));
    mode = 'selected';
    draft = '';
  }

  function getSelectionMatrix() {
    const bounds = rangeBounds(range);
    const matrix = [];

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      const line = [];
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        line.push(getCellRaw(row, col));
      }
      matrix.push(line);
    }

    return matrix;
  }

  function replaceRange(start, matrix) {
    if (!matrix.length || !matrix[0].length) {
      return;
    }

    pushHistory();

    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
      for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset += 1) {
        const row = start.row + rowOffset;
        const col = start.col + colOffset;
        if (row < rows && col < cols) {
          writeCell(row, col, matrix[rowOffset][colOffset]);
        }
      }
    }

    setRange({
      start: clampCell(start),
      end: clampCell({
        row: start.row + matrix.length - 1,
        col: start.col + matrix[0].length - 1,
      }),
    });
  }

  function undo() {
    if (history.length === 0) {
      return;
    }

    future.push(snapshot());
    restore(history.pop());
  }

  function redo() {
    if (future.length === 0) {
      return;
    }

    history.push(snapshot());
    restore(future.pop());
  }

  function snapshot() {
    return {
      cells: { ...cells },
      active: copyCell(active),
      range: { start: copyCell(range.start), end: copyCell(range.end) },
      anchor: copyCell(anchor),
    };
  }

  function restore(next) {
    cells = { ...next.cells };
    active = copyCell(next.active);
    range = { start: copyCell(next.range.start), end: copyCell(next.range.end) };
    anchor = copyCell(next.anchor);
    mode = 'selected';
    draft = '';
  }

  function moveAfterCommit(move) {
    if (!move) {
      setSelection(active.row, active.col, false);
      return;
    }

    moveActive(move);
  }

  function writeCell(row, col, value) {
    const key = cellKey(row, col);
    if (value === '') {
      delete cells[key];
      return;
    }
    cells[key] = value;
  }

  function clampCell(cell) {
    return {
      row: Math.max(0, Math.min(rows - 1, cell.row)),
      col: Math.max(0, Math.min(cols - 1, cell.col)),
    };
  }

  return {
    getState,
    getCellRaw,
    getCells,
    selectCell,
    setRange,
    startEdit,
    startFormulaBarEdit,
    beginTyping,
    updateDraft,
    cancelEdit,
    commitEdit,
    moveActive,
    clearSelection,
    getSelectionMatrix,
    replaceRange,
    undo,
    redo,
  };
}

function createCellMap(initialCells) {
  const cells = {};

  Object.keys(initialCells).forEach((ref) => {
    const location = parseCellRef(ref);
    cells[cellKey(location.row, location.col)] = String(initialCells[ref]);
  });

  return cells;
}

function parseCellRef(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error('Invalid cell ref: ' + ref);
  }

  let col = 0;
  for (let i = 0; i < match[1].length; i += 1) {
    col = col * 26 + (match[1].charCodeAt(i) - 64);
  }

  return { row: Number(match[2]) - 1, col: col - 1 };
}

function movement(direction) {
  switch (direction) {
    case 'up':
      return { row: -1, col: 0 };
    case 'down':
      return { row: 1, col: 0 };
    case 'left':
      return { row: 0, col: -1 };
    case 'right':
      return { row: 0, col: 1 };
    default:
      return { row: 0, col: 0 };
  }
}

function coveredCells(range) {
  const bounds = rangeBounds(range);
  const cells = [];

  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let col = bounds.left; col <= bounds.right; col += 1) {
      cells.push({ row, col });
    }
  }

  return cells;
}

function rangeBounds(range) {
  const top = Math.min(range.start.row, range.end.row);
  const bottom = Math.max(range.start.row, range.end.row);
  const left = Math.min(range.start.col, range.end.col);
  const right = Math.max(range.start.col, range.end.col);

  return { top, bottom, left, right };
}

function cellKey(row, col) {
  return row + ':' + col;
}

function toCellRef(row, col) {
  return columnLabel(col) + String(row + 1);
}

function columnLabel(col) {
  return String.fromCharCode(65 + col);
}

function copyCell(cell) {
  return { row: cell.row, col: cell.col };
}

if (typeof module !== 'undefined') {
  module.exports = { createSpreadsheetStore };
}

if (typeof window !== 'undefined') {
  window.createSpreadsheetStore = createSpreadsheetStore;
}
