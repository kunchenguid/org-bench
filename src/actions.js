(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetActions = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_HISTORY_LIMIT = 50;
  const STORAGE_KEY = 'spreadsheet-state';

  function normalizeRange(range) {
    const startRow = Math.min(range.startRow, range.endRow);
    const endRow = Math.max(range.startRow, range.endRow);
    const startCol = Math.min(range.startCol, range.endCol);
    const endCol = Math.max(range.startCol, range.endCol);
    return { startRow, startCol, endRow, endCol };
  }

  function keyOf(row, col) {
    return `${row},${col}`;
  }

  function parseKey(key) {
    const parts = key.split(',').map(Number);
    return { row: parts[0], col: parts[1] };
  }

  function isFormula(value) {
    return typeof value === 'string' && value.charAt(0) === '=';
  }

  function getNamespace(explicitNamespace) {
    if (explicitNamespace) return explicitNamespace;
    if (typeof window !== 'undefined') {
      return window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || window.__RUN_STORAGE_NAMESPACE__ || 'default';
    }
    return 'default';
  }

  function getStorage(explicitStorage) {
    if (explicitStorage) return explicitStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  }

  function createSpreadsheetActions(options) {
    if (!options || !options.sheet) throw new Error('sheet is required');

    const sheet = options.sheet;
    const historyLimit = Math.max(DEFAULT_HISTORY_LIMIT, options.historyLimit || DEFAULT_HISTORY_LIMIT);
    const storage = getStorage(options.storage);
    const storageKey = `${getNamespace(options.namespace)}:${STORAGE_KEY}`;
    const shiftFormulaReferences = options.shiftFormulaReferences || function (formula) { return formula; };
    const transformFormulaForStructureChange = options.transformFormulaForStructureChange || function (formula) { return formula; };
    let clipboard = null;
    const undoStack = [];
    const redoStack = [];

    function getCell(row, col) {
      return sheet.getCell(row, col) || '';
    }

    function writeCell(row, col, value) {
      if (value) sheet.setCell(row, col, value);
      else if (sheet.clearCell) sheet.clearCell(row, col);
      else sheet.setCell(row, col, '');
    }

    function getCellsSnapshot() {
      if (sheet.snapshot) return Object.assign({}, sheet.snapshot());
      const snapshot = {};
      for (let row = 0; row < sheet.rows; row += 1) {
        for (let col = 0; col < sheet.cols; col += 1) {
          const value = getCell(row, col);
          if (value) snapshot[keyOf(row, col)] = value;
        }
      }
      return snapshot;
    }

    function applyCellsSnapshot(cells) {
      const current = getCellsSnapshot();
      Object.keys(current).forEach(function (key) {
        const point = parseKey(key);
        writeCell(point.row, point.col, '');
      });
      Object.keys(cells).forEach(function (key) {
        const point = parseKey(key);
        writeCell(point.row, point.col, cells[key]);
      });
    }

    function getFullSnapshot() {
      return {
        cells: getCellsSnapshot(),
        rows: sheet.rows,
        cols: sheet.cols,
        active: sheet.active || { row: 0, col: 0 },
      };
    }

    function applyFullSnapshot(snapshot) {
      if (sheet.load) {
        sheet.load(snapshot);
        return;
      }
      applyCellsSnapshot(snapshot.cells || {});
      if (sheet.resize) sheet.resize(snapshot.rows, snapshot.cols);
      else {
        sheet.rows = snapshot.rows;
        sheet.cols = snapshot.cols;
      }
      if (sheet.setActive && snapshot.active) sheet.setActive(snapshot.active.row, snapshot.active.col);
      else sheet.active = snapshot.active;
    }

    function record(before, after) {
      undoStack.push({ before, after });
      while (undoStack.length > historyLimit) undoStack.shift();
      redoStack.length = 0;
    }

    function perform(mutator) {
      const before = getFullSnapshot();
      mutator();
      const after = getFullSnapshot();
      record(before, after);
    }

    function rangeValues(range) {
      const normalized = normalizeRange(range);
      const rows = [];
      for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
        const values = [];
        for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
          values.push({ row, col, value: getCell(row, col) });
        }
        rows.push(values);
      }
      return { range: normalized, rows };
    }

    function serializeBlock(block) {
      return block.rows.map(function (row) {
        return row.map(function (cell) { return cell.value; }).join('\t');
      }).join('\n');
    }

    function parseTextBlock(text) {
      return String(text || '').split(/\r?\n/).map(function (line) {
        return line.split('\t');
      });
    }

    function copy(range, event) {
      clipboard = { type: 'copy', block: rangeValues(range) };
      const text = serializeBlock(clipboard.block);
      if (event && event.clipboardData) {
        event.clipboardData.setData('text/plain', text);
        if (event.preventDefault) event.preventDefault();
      }
      return text;
    }

    function cut(range, event) {
      clipboard = { type: 'cut', block: rangeValues(range) };
      const text = serializeBlock(clipboard.block);
      if (event && event.clipboardData) {
        event.clipboardData.setData('text/plain', text);
        if (event.preventDefault) event.preventDefault();
      }
      return text;
    }

    function pasteFromInternal(targetRange) {
      const target = normalizeRange(targetRange);
      const block = clipboard.block;
      const height = block.rows.length;
      const width = block.rows[0] ? block.rows[0].length : 0;

      perform(function () {
        if (clipboard.type === 'cut') {
          block.rows.forEach(function (row) {
            row.forEach(function (cell) { writeCell(cell.row, cell.col, ''); });
          });
        }

        for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
          for (let colOffset = 0; colOffset < width; colOffset += 1) {
            const source = block.rows[rowOffset][colOffset];
            const destination = { row: target.startRow + rowOffset, col: target.startCol + colOffset };
            const value = isFormula(source.value)
              ? shiftFormulaReferences(source.value, { row: source.row, col: source.col }, destination)
              : source.value;
            writeCell(destination.row, destination.col, value);
          }
        }

        if (clipboard.type === 'cut') clipboard = null;
      });
    }

    function pasteText(targetRange, text) {
      const target = normalizeRange(targetRange);
      const values = parseTextBlock(text);
      perform(function () {
        values.forEach(function (row, rowOffset) {
          row.forEach(function (value, colOffset) {
            writeCell(target.startRow + rowOffset, target.startCol + colOffset, value);
          });
        });
      });
    }

    function paste(targetRange, textOrEvent) {
      if (typeof textOrEvent === 'string') {
        pasteText(targetRange, textOrEvent);
        return true;
      }
      if (textOrEvent && textOrEvent.clipboardData) {
        pasteText(targetRange, textOrEvent.clipboardData.getData('text/plain'));
        if (textOrEvent.preventDefault) textOrEvent.preventDefault();
        return true;
      }
      if (!clipboard) return false;
      pasteFromInternal(targetRange);
      return true;
    }

    function clearRange(range) {
      const normalized = normalizeRange(range);
      perform(function () {
        for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
          for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
            writeCell(row, col, '');
          }
        }
      });
    }

    function setCell(row, col, value) {
      perform(function () {
        writeCell(row, col, value);
      });
    }

    function changeStructure(axis, type, index, count) {
      const before = getCellsSnapshot();
      const next = {};
      const isRow = axis === 'row';
      const maxRows = sheet.rows + (isRow ? (type === 'insert' ? count : -count) : 0);
      const maxCols = sheet.cols + (!isRow ? (type === 'insert' ? count : -count) : 0);
      const change = { type: `${type}-${axis}`, axis, index, count };

      Object.keys(before).forEach(function (key) {
        const point = parseKey(key);
        let row = point.row;
        let col = point.col;
        const coordinate = isRow ? row : col;
        if (type === 'insert') {
          if (coordinate >= index) {
            if (isRow) row += count;
            else col += count;
          }
        } else if (coordinate >= index && coordinate < index + count) {
          return;
        } else if (coordinate >= index + count) {
          if (isRow) row -= count;
          else col -= count;
        }

        let value = before[key];
        if (isFormula(value)) value = transformFormulaForStructureChange(value, change);
        if (row >= 0 && col >= 0 && row < maxRows && col < maxCols) next[keyOf(row, col)] = value;
      });

      applyCellsSnapshot(next);
      if (sheet.resize) sheet.resize(maxRows, maxCols);
      else {
        sheet.rows = maxRows;
        sheet.cols = maxCols;
      }
    }

    function insertRows(index, count) {
      perform(function () { changeStructure('row', 'insert', index, count || 1); });
    }

    function deleteRows(index, count) {
      perform(function () { changeStructure('row', 'delete', index, count || 1); });
    }

    function insertColumns(index, count) {
      perform(function () { changeStructure('col', 'insert', index, count || 1); });
    }

    function deleteColumns(index, count) {
      perform(function () { changeStructure('col', 'delete', index, count || 1); });
    }

    function undo() {
      const entry = undoStack.pop();
      if (!entry) return false;
      applyFullSnapshot(entry.before);
      redoStack.push(entry);
      return true;
    }

    function redo() {
      const entry = redoStack.pop();
      if (!entry) return false;
      applyFullSnapshot(entry.after);
      undoStack.push(entry);
      return true;
    }

    function save() {
      if (!storage) return false;
      storage.setItem(storageKey, JSON.stringify(getFullSnapshot()));
      return true;
    }

    function load() {
      if (!storage) return false;
      const raw = storage.getItem(storageKey);
      if (!raw) return false;
      applyFullSnapshot(JSON.parse(raw));
      return true;
    }

    return {
      copy,
      cut,
      paste,
      clearRange,
      setCell,
      insertRows,
      deleteRows,
      insertColumns,
      deleteColumns,
      undo,
      redo,
      save,
      load,
      storageKey,
      serializeRange: function (range) { return serializeBlock(rangeValues(range)); },
    };
  }

  return { createSpreadsheetActions };
});
