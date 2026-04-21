(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COLS = 26;
  const ROWS = 100;

  function cellKey(col, row) {
    return col + ',' + row;
  }

  function colToName(col) {
    return String.fromCharCode(65 + col);
  }

  function nameToCol(name) {
    return name.charCodeAt(0) - 65;
  }

  function parseCellRef(ref) {
    const match = /^\$?([A-Z])\$?(\d+)$/.exec(ref);
    if (!match) {
      throw new Error('Bad ref');
    }
    return { col: nameToCol(match[1]), row: Number(match[2]) - 1 };
  }

  function parseRefToken(ref) {
    const match = /^(\$?)([A-Z])(\$?)(\d+)$/.exec(ref);
    if (!match) {
      throw new Error('Bad ref');
    }
    return {
      absCol: Boolean(match[1]),
      col: nameToCol(match[2]),
      absRow: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function stringifyRefToken(token) {
    return (token.absCol ? '$' : '') + colToName(token.col) + (token.absRow ? '$' : '') + String(token.row + 1);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shiftFormula(formula, dCol, dRow) {
    if (!formula || formula[0] !== '=') {
      return formula;
    }
    return formula.replace(/\$?[A-Z]\$?\d+/g, function (match) {
      const token = parseRefToken(match);
      if (!token.absCol) {
        token.col = clamp(token.col + dCol, 0, COLS - 1);
      }
      if (!token.absRow) {
        token.row = clamp(token.row + dRow, 0, ROWS - 1);
      }
      return stringifyRefToken(token);
    });
  }

  function createStore(seed) {
    const raw = new Map();
    if (seed) {
      Object.keys(seed).forEach(function (key) {
        raw.set(key, seed[key]);
      });
    }
    return {
      raw,
      getCell: function (col, row) {
        return raw.get(cellKey(col, row)) || '';
      },
      setCell: function (col, row, value) {
        const key = cellKey(col, row);
        if (!value) {
          raw.delete(key);
          return;
        }
        raw.set(key, value);
      },
      toJSON: function () {
        return Object.fromEntries(raw.entries());
      },
    };
  }

  function createHistorySnapshot(store, selection, rangeAnchor) {
    return JSON.stringify({
      cells: store.toJSON(),
      selection: selection,
      rangeAnchor: rangeAnchor,
    });
  }

  function restoreHistorySnapshot(snapshot) {
    const parsed = JSON.parse(snapshot);
    return {
      store: createStore(parsed.cells),
      selection: parsed.selection,
      rangeAnchor: parsed.rangeAnchor,
    };
  }

  function createEditBuffer(value) {
    return {
      original: value || '',
      draft: value || '',
    };
  }

  function resolveEditBuffer(buffer, shouldCommit) {
    return shouldCommit ? buffer.draft : buffer.original;
  }

  function editorActionForKey(key) {
    if (key === 'Enter') {
      return { kind: 'commit', dCol: 0, dRow: 1 };
    }
    if (key === 'Tab') {
      return { kind: 'commit', dCol: 1, dRow: 0 };
    }
    if (key === 'Escape') {
      return { kind: 'cancel' };
    }
    return null;
  }

  function rewriteFormulaReferences(formula, axis, index, delta, isDelete) {
    if (!formula || formula[0] !== '=') {
      return formula;
    }
    return formula.replace(/\$?[A-Z]\$?\d+/g, function (match) {
      const token = parseRefToken(match);
      const value = axis === 'row' ? token.row : token.col;
      if (isDelete && value === index) {
        return '#REF!';
      }
      if (value >= index) {
        if (axis === 'row') {
          token.row = clamp(token.row + delta, 0, ROWS - 1);
        } else {
          token.col = clamp(token.col + delta, 0, COLS - 1);
        }
      }
      return stringifyRefToken(token);
    });
  }

  function remapStore(store, mapper, rewriter) {
    const next = new Map();
    store.raw.forEach(function (raw, key) {
      const parts = key.split(',');
      const mapped = mapper(Number(parts[0]), Number(parts[1]));
      if (!mapped) {
        return;
      }
      next.set(cellKey(mapped.col, mapped.row), rewriter(raw));
    });
    store.raw.clear();
    next.forEach(function (value, key) {
      store.raw.set(key, value);
    });
  }

  function insertRow(store, rowIndex) {
    remapStore(store, function (col, row) {
      return { col: col, row: row >= rowIndex ? row + 1 : row };
    }, function (raw) {
      return rewriteFormulaReferences(raw, 'row', rowIndex, 1, false);
    });
  }

  function deleteRow(store, rowIndex) {
    remapStore(store, function (col, row) {
      if (row === rowIndex) {
        return null;
      }
      return { col: col, row: row > rowIndex ? row - 1 : row };
    }, function (raw) {
      return rewriteFormulaReferences(raw, 'row', rowIndex, -1, true);
    });
  }

  function insertColumn(store, colIndex) {
    remapStore(store, function (col, row) {
      return { col: col >= colIndex ? col + 1 : col, row: row };
    }, function (raw) {
      return rewriteFormulaReferences(raw, 'col', colIndex, 1, false);
    });
  }

  function deleteColumn(store, colIndex) {
    remapStore(store, function (col, row) {
      if (col === colIndex) {
        return null;
      }
      return { col: col > colIndex ? col - 1 : col, row: row };
    }, function (raw) {
      return rewriteFormulaReferences(raw, 'col', colIndex, -1, true);
    });
  }

  function normalizeRange(range) {
    return {
      startCol: Math.min(range.startCol, range.endCol),
      startRow: Math.min(range.startRow, range.endRow),
      endCol: Math.max(range.startCol, range.endCol),
      endRow: Math.max(range.startRow, range.endRow),
    };
  }

  function copyRange(store, range) {
    const rect = normalizeRange(range);
    const cells = [];
    for (let row = rect.startRow; row <= rect.endRow; row += 1) {
      const rowCells = [];
      for (let col = rect.startCol; col <= rect.endCol; col += 1) {
        rowCells.push(store.getCell(col, row));
      }
      cells.push(rowCells);
    }
    return {
      startCol: rect.startCol,
      startRow: rect.startRow,
      width: rect.endCol - rect.startCol + 1,
      height: rect.endRow - rect.startRow + 1,
      cells: cells,
    };
  }

  function clipboardToText(clipboard) {
    return clipboard.cells.map(function (row) {
      return row.join('\t');
    }).join('\n');
  }

  function clipboardFromText(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
    const rows = normalized.split('\n').map(function (row) {
      return row.split('\t');
    });
    return {
      startCol: 0,
      startRow: 0,
      width: rows[0] ? rows[0].length : 0,
      height: rows.length,
      cells: rows,
    };
  }

  function pasteRange(store, clipboard, targetRange) {
    const target = normalizeRange(targetRange);
    const targetWidth = target.endCol - target.startCol + 1;
    const targetHeight = target.endRow - target.startRow + 1;
    const fillWidth = targetWidth === clipboard.width ? clipboard.width : clipboard.width;
    const fillHeight = targetHeight === clipboard.height ? clipboard.height : clipboard.height;

    for (let rowOffset = 0; rowOffset < fillHeight; rowOffset += 1) {
      for (let colOffset = 0; colOffset < fillWidth; colOffset += 1) {
        const sourceValue = clipboard.cells[rowOffset % clipboard.height][colOffset % clipboard.width] || '';
        const targetCol = target.startCol + colOffset;
        const targetRow = target.startRow + rowOffset;
        const dCol = targetCol - (clipboard.startCol + colOffset % clipboard.width);
        const dRow = targetRow - (clipboard.startRow + rowOffset % clipboard.height);
        store.setCell(targetCol, targetRow, shiftFormula(sourceValue, dCol, dRow));
      }
    }
  }

  function isNumeric(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function flatten(values) {
    return values.flatMap(function (value) {
      return Array.isArray(value) ? flatten(value) : [value];
    });
  }

  function toNumber(value) {
    if (value && value.error) {
      throw value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      return 0;
    }
    return num;
  }

  function toText(value) {
    if (value && value.error) {
      throw value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function displayValue(value) {
    if (value && value.error) {
      return value.error;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  function splitArgs(text) {
    const parts = [];
    let current = '';
    let depth = 0;
    let inString = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        inString = !inString;
        current += ch;
        continue;
      }
      if (!inString) {
        if (ch === '(') {
          depth += 1;
        } else if (ch === ')') {
          depth -= 1;
        } else if (ch === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
      }
      current += ch;
    }
    if (current.trim() || text.includes(',')) {
      parts.push(current.trim());
    }
    return parts;
  }

  function splitTopLevel(text, operator) {
    const parts = [];
    let current = '';
    let depth = 0;
    let inString = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        inString = !inString;
        current += ch;
        continue;
      }
      if (!inString) {
        if (ch === '(') {
          depth += 1;
        } else if (ch === ')') {
          depth -= 1;
        } else if (ch === operator && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
      }
      current += ch;
    }
    if (parts.length) {
      parts.push(current.trim());
    }
    return parts;
  }

  function replaceComparisons(expr) {
    return expr
      .replace(/<>/g, '!=')
      .replace(/(^|[^<>:=])=([^=])/g, '$1==$2');
  }

  function evaluateExpression(store, expr, cache, trail) {
    const trimmed = expr.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.includes('#REF!')) {
      throw { error: '#REF!' };
    }
    const concatParts = splitTopLevel(trimmed, '&');
    if (concatParts.length) {
      return concatParts.map(function (part) {
        return toText(evaluateExpression(store, part, cache, trail));
      }).join('');
    }
    if (/^".*"$/.test(trimmed)) {
      return trimmed.slice(1, -1);
    }
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (/^(TRUE|FALSE)$/i.test(trimmed)) {
      return trimmed.toUpperCase() === 'TRUE';
    }

    const fnMatch = /^([A-Z]+)\((.*)\)$/i.exec(trimmed);
    if (fnMatch) {
      return evaluateFunction(store, fnMatch[1].toUpperCase(), splitArgs(fnMatch[2]), cache, trail);
    }

    const rangeMatch = /^(\$?[A-Z]\$?\d+):(\$?[A-Z]\$?\d+)$/.exec(trimmed);
    if (rangeMatch) {
      return getRangeValues(store, rangeMatch[1], rangeMatch[2], cache, trail);
    }

    if (/^\$?[A-Z]\$?\d+$/.test(trimmed)) {
      return evaluateCell(store, parseRefToken(trimmed).col, parseRefToken(trimmed).row, cache, trail).value;
    }

    const jsExpr = replaceComparisons(trimmed)
      .replace(/&/g, '+')
      .replace(/\$?[A-Z]\$?\d+/g, function (match) {
        return '__ref__("' + match + '")';
      });

    try {
      return Function('__ref__', 'return (' + jsExpr + ');')(function (ref) {
        const parsed = parseRefToken(ref);
        return evaluateCell(store, parsed.col, parsed.row, cache, trail).value;
      });
    } catch (error) {
      if (String(error && error.message || '').includes('/0')) {
        throw { error: '#DIV/0!' };
      }
      if (error && error.error) {
        throw error;
      }
      throw { error: '#ERR!' };
    }
  }

  function evaluateFunction(store, name, args, cache, trail) {
    const values = args.map(function (arg) {
      return evaluateExpression(store, arg, cache, trail);
    });
    const flat = flatten(values);
    switch (name) {
      case 'SUM':
        return flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0);
      case 'AVERAGE':
        return flat.length ? flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / flat.length : 0;
      case 'MIN':
        return flat.length ? Math.min.apply(Math, flat.map(toNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max.apply(Math, flat.map(toNumber)) : 0;
      case 'COUNT':
        return flat.filter(function (value) { return value !== ''; }).length;
      case 'IF':
        return values[0] ? values[1] : values[2];
      case 'AND':
        return flat.every(Boolean);
      case 'OR':
        return flat.some(Boolean);
      case 'NOT':
        return !values[0];
      case 'ABS':
        return Math.abs(toNumber(values[0]));
      case 'ROUND':
        return Number(toNumber(values[0]).toFixed(values[1] == null ? 0 : toNumber(values[1])));
      case 'CONCAT':
        return flat.map(toText).join('');
      default:
        throw { error: '#ERR!' };
    }
  }

  function getRangeValues(store, startRef, endRef, cache, trail) {
    const start = parseRefToken(startRef);
    const end = parseRefToken(endRef);
    const colStart = Math.min(start.col, end.col);
    const colEnd = Math.max(start.col, end.col);
    const rowStart = Math.min(start.row, end.row);
    const rowEnd = Math.max(start.row, end.row);
    const values = [];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        values.push(evaluateCell(store, col, row, cache, trail).value);
      }
    }
    return values;
  }

  function evaluateCell(store, col, row, cache, trail) {
    const key = cellKey(col, row);
    if (cache.has(key)) {
      return cache.get(key);
    }
    if (trail.has(key)) {
      const circ = { raw: store.getCell(col, row), value: { error: '#CIRC!' }, display: '#CIRC!' };
      cache.set(key, circ);
      return circ;
    }

    const raw = store.getCell(col, row);
    if (!raw) {
      const empty = { raw: '', value: '', display: '' };
      cache.set(key, empty);
      return empty;
    }

    trail.add(key);
    let value;
    try {
      if (raw[0] === '=') {
        value = evaluateExpression(store, raw.slice(1), cache, trail);
        if (value === Infinity || value === -Infinity) {
          throw { error: '#DIV/0!' };
        }
      } else if (/^-?\d+(?:\.\d+)?$/.test(raw.trim())) {
        value = Number(raw);
      } else {
        value = raw;
      }
    } catch (error) {
      value = error && error.error ? error : { error: '#ERR!' };
    }
    trail.delete(key);

    const result = { raw: raw, value: value && value.error ? value : value, display: displayValue(value) };
    cache.set(key, result);
    return result;
  }

  function evaluateSheet(store) {
    const cache = new Map();
    return {
      getDisplay: function (col, row) {
        return evaluateCell(store, col, row, cache, new Set()).display;
      },
      getCell: function (col, row) {
        return evaluateCell(store, col, row, cache, new Set());
      },
    };
  }

  return {
    COLS,
    ROWS,
    clipboardFromText,
    clipboardToText,
    colToName,
    copyRange,
    createEditBuffer,
    createHistorySnapshot,
    createStore,
    deleteColumn,
    deleteRow,
    editorActionForKey,
    evaluateCell,
    evaluateSheet,
    insertColumn,
    insertRow,
    pasteRange,
    parseCellRef,
    normalizeRange,
    resolveEditBuffer,
    restoreHistorySnapshot,
    shiftFormula,
  };
});
