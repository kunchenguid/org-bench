'use strict';

function buildClipboardPayload(snapshot, selection, mode) {
  const bounds = getSelectionBounds(selection);
  const cells = snapshot && snapshot.cells instanceof Map ? snapshot.cells : new Map();
  const rows = [];

  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    const values = [];
    for (let col = bounds.left; col <= bounds.right; col += 1) {
      values.push(cells.get(formatCellId({ row, col })) || '');
    }
    rows.push(values);
  }

  return {
    kind: 'cell-range',
    mode: mode === 'cut' ? 'cut' : 'copy',
    width: bounds.right - bounds.left + 1,
    height: bounds.bottom - bounds.top + 1,
    source: cloneSelection(selection),
    rows,
  };
}

function clearSelectedRange(store, selection, options) {
  return store.clearCells(getSelectionCellIds(selection), {
    label: options && options.label ? options.label : 'clear',
  });
}

function applyClipboardPaste(store, payload, selection, options) {
  if (!payload || payload.kind !== 'cell-range') {
    return false;
  }

  const sourceSelection = payload.source || selection;
  const sourceBounds = getSelectionBounds(sourceSelection);
  const targetBounds = resolvePasteBounds(selection, payload);
  const transformCell = options && typeof options.transformCell === 'function'
    ? options.transformCell
    : identityTransform;
  const patch = {};

  for (let rowOffset = 0; rowOffset < payload.height; rowOffset += 1) {
    for (let colOffset = 0; colOffset < payload.width; colOffset += 1) {
      const sourceCell = {
        row: sourceBounds.top + rowOffset,
        col: sourceBounds.left + colOffset,
      };
      const targetCell = {
        row: targetBounds.top + rowOffset,
        col: targetBounds.left + colOffset,
      };
      const raw = payload.rows[rowOffset][colOffset] || '';
      patch[formatCellId(targetCell)] = transformCell(raw, {
        sourceCell,
        targetCell,
        sourceSelection: cloneSelection(sourceSelection),
        targetSelection: cloneSelection(selection),
      });
    }
  }

  if (payload.mode === 'cut') {
    for (const cellId of getSelectionCellIds(sourceSelection)) {
      patch[cellId] = '';
    }
    return store.applyCells(patch, { label: 'cut-paste' });
  }

  return store.applyCells(patch, { label: 'paste' });
}

function resolvePasteBounds(selection, payload) {
  const bounds = getSelectionBounds(selection);
  const selectionWidth = bounds.right - bounds.left + 1;
  const selectionHeight = bounds.bottom - bounds.top + 1;

  if (selectionWidth === payload.width && selectionHeight === payload.height) {
    return bounds;
  }

  return {
    top: bounds.top,
    left: bounds.left,
    bottom: bounds.top + payload.height - 1,
    right: bounds.left + payload.width - 1,
  };
}

function getSelectionCellIds(selection) {
  const bounds = getSelectionBounds(selection);
  const cellIds = [];

  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let col = bounds.left; col <= bounds.right; col += 1) {
      cellIds.push(formatCellId({ row, col }));
    }
  }

  return cellIds;
}

function getSelectionBounds(selection) {
  const anchor = selection.anchor;
  const focus = selection.focus;
  return {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col),
    right: Math.max(anchor.col, focus.col),
  };
}

function formatCellId(point) {
  return `${columnNumberToLabel(point.col + 1)}${point.row + 1}`;
}

function columnNumberToLabel(value) {
  let column = value;
  let label = '';

  while (column > 0) {
    const remainder = (column - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    column = Math.floor((column - 1) / 26);
  }

  return label;
}

function cloneSelection(selection) {
  return {
    anchor: { row: selection.anchor.row, col: selection.anchor.col },
    focus: { row: selection.focus.row, col: selection.focus.col },
  };
}

function identityTransform(raw) {
  return raw;
}

module.exports = {
  buildClipboardPayload,
  clearSelectedRange,
  applyClipboardPaste,
};
