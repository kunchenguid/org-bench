(function (root, factory) {
  const core = typeof require === 'function' ? require('./spreadsheet-core.js') : root.SpreadsheetCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpreadsheetCore = Object.assign(root.SpreadsheetCore || {}, api);
})(typeof self !== 'undefined' ? self : this, function (core) {
  const { SpreadsheetModel: CoreModel, adjustFormulaReferences: adjustByDelta, colName, colIndex } = core;

  function parseAddress(address) {
    const match = /^([A-Z]+)(\d+)$/i.exec(address);
    if (!match) throw new Error(`Invalid cell address: ${address}`);
    return { row: Number(match[2]) - 1, col: colIndex(match[1].toUpperCase()) };
  }

  function formatAddress(row, col) {
    return `${colName(col)}${row + 1}`;
  }

  function normalizeRange(range) {
    const start = typeof range.start === 'string' ? parseAddress(range.start) : range.start;
    const end = typeof range.end === 'string' ? parseAddress(range.end) : range.end;
    return {
      row1: Math.min(start.row, end.row),
      row2: Math.max(start.row, end.row),
      col1: Math.min(start.col, end.col),
      col2: Math.max(start.col, end.col),
    };
  }

  class SpreadsheetModel extends CoreModel {
    constructor(options) {
      if (typeof options === 'number') super(options, arguments[1]);
      else super(options && options.rows || core.DEFAULT_ROWS, options && options.cols || core.DEFAULT_COLS);
      this.undoStack = [];
      this.redoStack = [];
    }

    static fromJSON(data) {
      const model = new SpreadsheetModel({ rows: data && data.rows || core.DEFAULT_ROWS, cols: data && data.cols || core.DEFAULT_COLS });
      if (data && Array.isArray(data.cells)) model.cells = new Map(data.cells);
      return model;
    }

    snapshot() {
      return { rows: this.rows, cols: this.cols, cells: this.cloneCells() };
    }

    restore(snapshot) {
      this.restoreCells(snapshot.cells, snapshot.rows, snapshot.cols);
    }

    record() {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }

    setCell(addressOrRow, colOrRaw, rawMaybe, options) {
      if (typeof addressOrRow === 'string') {
        const address = parseAddress(addressOrRow);
        if (!options || !options.silent) this.record();
        return super.setCell(address.row, address.col, colOrRaw);
      }
      if (!options || !options.silent) this.record();
      return super.setCell(addressOrRow, colOrRaw, rawMaybe);
    }

    getRaw(addressOrRow, col) {
      if (typeof addressOrRow === 'string') {
        const address = parseAddress(addressOrRow);
        return super.getRaw(address.row, address.col);
      }
      return super.getRaw(addressOrRow, col);
    }

    getDisplay(addressOrRow, col) {
      if (typeof addressOrRow === 'string') {
        const address = parseAddress(addressOrRow);
        return super.getDisplay(address.row, address.col);
      }
      return super.getDisplay(addressOrRow, col);
    }

    copyCells(range) {
      const r = normalizeRange(range);
      const rows = [];
      for (let row = r.row1; row <= r.row2; row++) {
        const line = [];
        for (let col = r.col1; col <= r.col2; col++) line.push({ raw: super.getRaw(row, col), row, col });
        rows.push(line);
      }
      return { rows, source: { row: r.row1, col: r.col1 } };
    }

    pasteCells(targetAddress, copied) {
      const target = typeof targetAddress === 'string' ? parseAddress(targetAddress) : targetAddress;
      this.record();
      for (let r = 0; r < copied.rows.length; r++) {
        for (let c = 0; c < copied.rows[r].length; c++) {
          const item = copied.rows[r][c];
          const raw = item.raw && item.raw[0] === '=' ? adjustByDelta(item.raw, target.row + r - item.row, target.col + c - item.col) : item.raw;
          super.setCell(target.row + r, target.col + c, raw);
        }
      }
    }

    clearRange(range) {
      const r = normalizeRange(range);
      this.record();
      for (let row = r.row1; row <= r.row2; row++) {
        for (let col = r.col1; col <= r.col2; col++) super.setCell(row, col, '');
      }
    }

    undo() {
      const previous = this.undoStack.pop();
      if (!previous) return false;
      this.redoStack.push(this.snapshot());
      this.restore(previous);
      return true;
    }

    redo() {
      const next = this.redoStack.pop();
      if (!next) return false;
      this.undoStack.push(this.snapshot());
      this.restore(next);
      return true;
    }

    insertRow(rowNumberOrIndex) {
      const index = Math.max(0, Number(rowNumberOrIndex) - 1);
      this.record();
      return super.insertRow(index);
    }

    deleteRow(rowNumberOrIndex) {
      const index = Math.max(0, Number(rowNumberOrIndex) - 1);
      this.record();
      return super.deleteRow(index);
    }

    insertCol(colNameOrIndex) {
      const index = typeof colNameOrIndex === 'string' ? colIndex(colNameOrIndex.toUpperCase()) : Number(colNameOrIndex) - 1;
      this.record();
      return super.insertCol(Math.max(0, index));
    }

    deleteCol(colNameOrIndex) {
      const index = typeof colNameOrIndex === 'string' ? colIndex(colNameOrIndex.toUpperCase()) : Number(colNameOrIndex) - 1;
      this.record();
      return super.deleteCol(Math.max(0, index));
    }
  }

  function createSheet(rows, cols) { return new SpreadsheetModel({ rows, cols }); }
  function setCell(sheet, row, col, raw) { sheet.setCell(formatAddress(row, col), raw); }
  function rawValue(sheet, row, col) { return sheet.getRaw(formatAddress(row, col)); }
  function displayValue(sheet, row, col) { return sheet.getDisplay(formatAddress(row, col)); }
  function recalculate() {}
  function insertRow(sheet, index) { sheet.insertRow(index + 1); }
  function storageKey(namespace) { return `${namespace || 'gridline-default'}:state`; }
  function loadState(storage, namespace) {
    try {
      const raw = storage && storage.getItem(storageKey(namespace));
      if (raw) {
        const data = JSON.parse(raw);
        const sheet = SpreadsheetModel.fromJSON(data.sheet);
        sheet.undoStack = [];
        sheet.redoStack = [];
        return { sheet, selection: data.selection || { row: 0, col: 0 } };
      }
    } catch (error) {}
    return { sheet: new SpreadsheetModel({ rows: 100, cols: 26 }), selection: { row: 0, col: 0 } };
  }
  function saveState(storage, namespace, sheet, selection) {
    if (!storage) return;
    storage.setItem(storageKey(namespace), JSON.stringify({ sheet: sheet.toJSON(), selection }));
  }
  function adjustFormulaReferences(raw, sourceRow, sourceCol, targetRow, targetCol) {
    return adjustByDelta(raw, targetRow - sourceRow, targetCol - sourceCol);
  }

  return {
    SpreadsheetModel,
    createSheet,
    setCell,
    rawValue,
    displayValue,
    recalculate,
    insertRow,
    storageKey,
    loadState,
    saveState,
    adjustFormulaReferences,
    parseAddress,
    formatAddress,
    colName,
  };
});
