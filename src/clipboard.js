'use strict';

let cachedFormulaEngine = null;
const CUSTOM_CLIPBOARD_MIME = 'application/x-spreadsheet-cell-range';
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
    : createDefaultTransform();
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

function writeClipboardData(clipboardData, payload) {
  if (!clipboardData || !payload) {
    return false;
  }

  const serialized = JSON.stringify(payload);
  clipboardData.setData(CUSTOM_CLIPBOARD_MIME, serialized);
  clipboardData.setData('text/plain', payloadToPlainText(payload));
  return true;
}

function readClipboardData(clipboardData) {
  if (!clipboardData) {
    return null;
  }

  const custom = clipboardData.getData(CUSTOM_CLIPBOARD_MIME);
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (_error) {
      return null;
    }
  }

  const plainText = clipboardData.getData('text/plain');
  return plainText ? payloadFromPlainText(plainText) : null;
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

function payloadToPlainText(payload) {
  return payload.rows.map(function (row) {
    return row.join('\t');
  }).join('\n');
}

function payloadFromPlainText(text) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n');
  const rows = normalized.split('\n').map(function (row) {
    return row.split('\t');
  });
  const width = rows.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);
  const height = rows.length;

  return {
    kind: 'cell-range',
    mode: 'copy',
    width: width,
    height: height,
    source: {
      anchor: { row: 0, col: 0 },
      focus: { row: Math.max(height - 1, 0), col: Math.max(width - 1, 0) },
    },
    rows,
  };
}

function createDefaultTransform() {
  const formulaEngine = getFormulaEngine();

  if (!formulaEngine || typeof formulaEngine.rebaseFormula !== 'function') {
    return identityTransform;
  }

  return function defaultTransform(raw, context) {
    if (typeof raw !== 'string' || raw.charAt(0) !== '=') {
      return raw;
    }

    return formulaEngine.rebaseFormula(
      raw,
      formatCellId(context.sourceCell),
      formatCellId(context.targetCell)
    );
  };
}

function getFormulaEngine() {
  if (cachedFormulaEngine !== null) {
    return cachedFormulaEngine;
  }

  if (typeof globalThis !== 'undefined' && globalThis.FormulaEngine) {
    cachedFormulaEngine = globalThis.FormulaEngine;
    return cachedFormulaEngine;
  }

  if (typeof require === 'function') {
    try {
      cachedFormulaEngine = require('../formula-engine.js');
      return cachedFormulaEngine;
    } catch (_error) {
      cachedFormulaEngine = null;
      return cachedFormulaEngine;
    }
  }

  cachedFormulaEngine = null;
  return cachedFormulaEngine;
}

const api = {
  CUSTOM_CLIPBOARD_MIME,
  buildClipboardPayload,
  clearSelectedRange,
  applyClipboardPaste,
  writeClipboardData,
  readClipboardData,
  payloadToPlainText,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetClipboard = api;
}
