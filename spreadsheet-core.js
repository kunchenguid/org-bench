(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const ERR = { generic: '#ERR!', divide: '#DIV/0!', ref: '#REF!', circ: '#CIRC!' };
  function cellKey(row, col) { return row + ',' + col; }
  function cloneSheetState(sheet) {
    return { cells: Object.assign({}, sheet.cells), rowCount: sheet.rowCount, colCount: sheet.colCount, selected: Object.assign({}, sheet.selected), range: sheet.range ? Object.assign({}, sheet.range) : null };
  }
  function createSheet(data) {
    data = data || {};
    return { cells: Object.assign({}, data.cells), rowCount: data.rowCount || DEFAULT_ROWS, colCount: data.colCount || DEFAULT_COLS, selected: data.selected || { row: 0, col: 0 }, range: data.range || null, undoStack: [], redoStack: [] };
  }
  function colToLabel(col) {
    let value = col + 1; let out = '';
    while (value > 0) { const rem = (value - 1) % 26; out = String.fromCharCode(65 + rem) + out; value = Math.floor((value - 1) / 26); }
    return out;
  }
  function labelToCol(label) {
    let value = 0;
    for (let i = 0; i < label.length; i += 1) value = value * 26 + (label.charCodeAt(i) - 64);
    return value - 1;
  }
  function parseCellRef(ref) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
    if (!match) return null;
    return { absCol: !!match[1], col: labelToCol(match[2]), absRow: !!match[3], row: Number(match[4]) - 1 };
  }
  function toRefString(ref) { return ref.deleted ? ERR.ref : (ref.absCol ? '$' : '') + colToLabel(ref.col) + (ref.absRow ? '$' : '') + String(ref.row + 1); }
  function normalizeRange(range) { return { startRow: Math.min(range.startRow, range.endRow), endRow: Math.max(range.startRow, range.endRow), startCol: Math.min(range.startCol, range.endCol), endCol: Math.max(range.startCol, range.endCol) }; }
  function setCellRaw(sheet, row, col, raw) { const key = cellKey(row, col); if (raw === '') delete sheet.cells[key]; else sheet.cells[key] = String(raw); }
  function getCellRaw(sheet, row, col) { return sheet.cells[cellKey(row, col)] || ''; }
  function isFormula(raw) { return typeof raw === 'string' && raw.charAt(0) === '='; }
  function tokenize(input) {
    const tokens = []; let i = 0;
    while (i < input.length) {
      const ch = input.charAt(i);
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '"') {
        let value = ''; i += 1;
        while (i < input.length && input.charAt(i) !== '"') { value += input.charAt(i); i += 1; }
        if (input.charAt(i) !== '"') throw new Error('Unterminated string');
        i += 1; tokens.push({ type: 'string', value: value }); continue;
      }
      const two = input.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/(),:&<>='.indexOf(ch) !== -1) { tokens.push({ type: ch === ',' ? 'comma' : ch === '(' || ch === ')' ? 'paren' : 'op', value: ch }); i += 1; continue; }
      const numMatch = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (numMatch) { tokens.push({ type: 'number', value: Number(numMatch[0]) }); i += numMatch[0].length; continue; }
      const idMatch = /^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/.exec(input.slice(i).toUpperCase());
      if (idMatch) {
        const value = idMatch[0];
        tokens.push({ type: /^\$?[A-Z]+\$?\d+$/.test(value) ? 'cell' : 'identifier', value: value });
        i += idMatch[0].length; continue;
      }
      throw new Error('Unexpected token');
    }
    return tokens;
  }
  function valueToString(value) {
    if (value && value.error) return value.error;
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value == null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(Number.isInteger(value) ? value : Number(value.toFixed(10)).toString()) : ERR.generic;
    return String(value);
  }
  function isBlank(value) { return value === '' || value == null; }
  function toNumber(value) {
    if (value && value.error) return value;
    if (Array.isArray(value)) return { error: ERR.generic };
    if (isBlank(value)) return 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    const num = Number(value);
    return Number.isNaN(num) ? { error: ERR.generic } : num;
  }
  function toText(value) {
    if (value && value.error) return value;
    if (Array.isArray(value)) return { error: ERR.generic };
    if (isBlank(value)) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }
  function flattenArgs(args) { const out = []; args.forEach(function (arg) { if (Array.isArray(arg)) arg.forEach(function (item) { out.push(item); }); else out.push(arg); }); return out; }
  function applyFunction(name, args) {
    const flat = flattenArgs(args);
    if (flat.some(function (item) { return item && item.error; })) return flat.find(function (item) { return item && item.error; });
    switch (name) {
      case 'SUM': return flat.reduce(function (sum, item) { const value = toNumber(item); return typeof value === 'object' ? value : sum + value; }, 0);
      case 'AVERAGE': { const nums = flat.map(toNumber); if (nums.some(function (item) { return typeof item === 'object'; })) return nums.find(function (item) { return typeof item === 'object'; }); return nums.length ? nums.reduce(function (sum, item) { return sum + item; }, 0) / nums.length : 0; }
      case 'MIN': { const nums = flat.map(toNumber); if (nums.some(function (item) { return typeof item === 'object'; })) return nums.find(function (item) { return typeof item === 'object'; }); return nums.length ? Math.min.apply(Math, nums) : 0; }
      case 'MAX': { const nums = flat.map(toNumber); if (nums.some(function (item) { return typeof item === 'object'; })) return nums.find(function (item) { return typeof item === 'object'; }); return nums.length ? Math.max.apply(Math, nums) : 0; }
      case 'COUNT': return flat.filter(function (item) { return !isBlank(item); }).length;
      case 'IF': return args[0] ? args[1] : args[2];
      case 'AND': return flat.every(Boolean);
      case 'OR': return flat.some(Boolean);
      case 'NOT': return !args[0];
      case 'ABS': { const value = toNumber(args[0]); return typeof value === 'object' ? value : Math.abs(value); }
      case 'ROUND': { const number = toNumber(args[0]); const digits = args.length > 1 ? toNumber(args[1]) : 0; if (typeof number === 'object') return number; if (typeof digits === 'object') return digits; const power = Math.pow(10, digits); return Math.round(number * power) / power; }
      case 'CONCAT': return flat.map(function (item) { return toText(item); }).join('');
      default: return { error: ERR.generic };
    }
  }
  function evaluateCell(sheet, row, col, state) {
    const key = cellKey(row, col);
    state = state || { visiting: {}, cache: {} };
    if (state.cache[key] !== undefined) return state.cache[key];
    if (state.visiting[key]) return { error: ERR.circ };
    state.visiting[key] = true;
    const raw = getCellRaw(sheet, row, col);
    let result;
    if (!raw) result = '';
    else if (!isFormula(raw)) { const num = Number(raw); result = raw.trim() !== '' && !Number.isNaN(num) ? num : raw; }
    else if (raw.indexOf(ERR.ref) !== -1) result = { error: ERR.ref };
    else {
      try { result = parseFormula(sheet, raw.slice(1), state); }
      catch (error) { result = { error: error && error.code ? error.code : ERR.generic }; }
    }
    delete state.visiting[key]; state.cache[key] = result; return result;
  }
  function parseFormula(sheet, input, state) {
    const tokens = tokenize(input); let index = 0;
    function peek() { return tokens[index]; }
    function consume(type, value) { const token = tokens[index]; if (!token || token.type !== type || (value !== undefined && token.value !== value)) throw new Error('Unexpected token'); index += 1; return token; }
    function parseComparison() {
      let left = parseConcat();
      while (peek() && peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(peek().value) !== -1) {
        const op = consume('op').value; const right = parseConcat();
        if (left && left.error) return left; if (right && right.error) return right;
        if (op === '=') left = left === right;
        else if (op === '<>') left = left !== right;
        else if (op === '<') left = toNumber(left) < toNumber(right);
        else if (op === '<=') left = toNumber(left) <= toNumber(right);
        else if (op === '>') left = toNumber(left) > toNumber(right);
        else left = toNumber(left) >= toNumber(right);
      }
      return left;
    }
    function parseConcat() {
      let left = parseAddSub();
      while (peek() && peek().type === 'op' && peek().value === '&') {
        consume('op', '&');
        const right = parseAddSub();
        const leftText = toText(left); const rightText = toText(right);
        if (leftText && leftText.error) return leftText; if (rightText && rightText.error) return rightText;
        left = leftText + rightText;
      }
      return left;
    }
    function parseAddSub() {
      let left = parseMulDiv();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = consume('op').value; const right = parseMulDiv(); const a = toNumber(left); const b = toNumber(right);
        if (typeof a === 'object') return a; if (typeof b === 'object') return b; left = op === '+' ? a + b : a - b;
      }
      return left;
    }
    function parseMulDiv() {
      let left = parseUnary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const op = consume('op').value; const right = parseUnary(); const a = toNumber(left); const b = toNumber(right);
        if (typeof a === 'object') return a; if (typeof b === 'object') return b; if (op === '/' && b === 0) return { error: ERR.divide }; left = op === '*' ? a * b : a / b;
      }
      return left;
    }
    function parseUnary() { if (peek() && peek().type === 'op' && peek().value === '-') { consume('op', '-'); const value = toNumber(parseUnary()); return typeof value === 'object' ? value : -value; } return parsePrimary(); }
    function parseRangeFromRef(startRef) {
      if (peek() && peek().type === 'op' && peek().value === ':') {
        consume('op', ':'); const endToken = consume('cell'); const endRef = parseCellRef(endToken.value); const range = [];
        const startRow = Math.min(startRef.row, endRef.row); const endRow = Math.max(startRef.row, endRef.row); const startCol = Math.min(startRef.col, endRef.col); const endCol = Math.max(startRef.col, endRef.col);
        for (let row = startRow; row <= endRow; row += 1) for (let col = startCol; col <= endCol; col += 1) range.push(evaluateCell(sheet, row, col, state));
        return range;
      }
      return evaluateCell(sheet, startRef.row, startRef.col, state);
    }
    function parsePrimary() {
      const token = peek(); if (!token) throw new Error('Unexpected end');
      if (token.type === 'number') { consume('number'); return token.value; }
      if (token.type === 'string') { consume('string'); return token.value; }
      if (token.type === 'cell') { consume('cell'); return parseRangeFromRef(parseCellRef(token.value)); }
      if (token.type === 'identifier') {
        consume('identifier'); if (token.value === 'TRUE') return true; if (token.value === 'FALSE') return false;
        consume('paren', '('); const args = [];
        if (!peek() || peek().value !== ')') {
          do { args.push(parseComparison()); if (!peek() || peek().type !== 'comma') break; consume('comma'); } while (true);
        }
        consume('paren', ')'); return applyFunction(token.value, args);
      }
      if (token.type === 'paren' && token.value === '(') { consume('paren', '('); const value = parseComparison(); consume('paren', ')'); return value; }
      throw new Error('Unexpected token');
    }
    const result = parseComparison(); if (index !== tokens.length) throw new Error('Unexpected trailing token'); return result;
  }
  function getCellDisplay(sheet, row, col) { return valueToString(evaluateCell(sheet, row, col, { visiting: {}, cache: {} })); }
  function shiftFormula(raw, rowOffset, colOffset) {
    if (!isFormula(raw)) return raw;
    return raw.replace(/(\$?[A-Z]+\$?\d+)(:(\$?[A-Z]+\$?\d+))?/g, function (_, first, _range, second) {
      function adjust(refText) {
        const ref = parseCellRef(refText); if (!ref) return refText;
        if (!ref.absRow) ref.row += rowOffset; if (!ref.absCol) ref.col += colOffset;
        if (ref.row < 0 || ref.col < 0) return ERR.ref; return toRefString(ref);
      }
      const start = adjust(first); if (!second) return start; const end = adjust(second); return start === ERR.ref || end === ERR.ref ? ERR.ref : start + ':' + end;
    });
  }
  function copyRange(sheet, range) {
    const normalized = normalizeRange(range); const rows = [];
    for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
      const rowData = [];
      for (let col = normalized.startCol; col <= normalized.endCol; col += 1) rowData.push(getCellRaw(sheet, row, col));
      rows.push(rowData);
    }
    return { width: normalized.endCol - normalized.startCol + 1, height: normalized.endRow - normalized.startRow + 1, originRow: normalized.startRow, originCol: normalized.startCol, cells: rows };
  }
  function pasteRange(sheet, copied, targetRow, targetCol) {
    for (let row = 0; row < copied.height; row += 1) for (let col = 0; col < copied.width; col += 1) setCellRaw(sheet, targetRow + row, targetCol + col, shiftFormula(copied.cells[row][col], targetRow - copied.originRow, targetCol - copied.originCol) || '');
  }
  function rewriteFormulaReferences(raw, axis, index, delta, deleteMode) {
    if (!isFormula(raw)) return raw;
    return raw.replace(/(\$?[A-Z]+\$?\d+)(:(\$?[A-Z]+\$?\d+))?/g, function (_, first, _range, second) {
      function updateRef(refText) {
        const ref = parseCellRef(refText); if (!ref) return refText;
        const value = axis === 'row' ? ref.row : ref.col; const abs = axis === 'row' ? ref.absRow : ref.absCol;
        if (!abs) {
          if (deleteMode && value === index) ref.deleted = true;
          else if (value >= index) ref[axis] = deleteMode ? value - 1 : value + delta;
        }
        return toRefString(ref);
      }
      const start = updateRef(first); if (!second) return start; const end = updateRef(second); return start === ERR.ref || end === ERR.ref ? ERR.ref : start + ':' + end;
    });
  }
  function remapCells(sheet, mapper) {
    const nextCells = {};
    Object.keys(sheet.cells).forEach(function (key) {
      const parts = key.split(','); const mapped = mapper(Number(parts[0]), Number(parts[1]), sheet.cells[key]);
      if (mapped) nextCells[cellKey(mapped.row, mapped.col)] = mapped.raw;
    });
    sheet.cells = nextCells;
  }
  function insertRow(sheet, index) { remapCells(sheet, function (row, col, raw) { return { row: row >= index ? row + 1 : row, col: col, raw: raw }; }); Object.keys(sheet.cells).forEach(function (key) { sheet.cells[key] = rewriteFormulaReferences(sheet.cells[key], 'row', index, 1, false); }); sheet.rowCount += 1; }
  function deleteRow(sheet, index) { remapCells(sheet, function (row, col, raw) { if (row === index) return null; return { row: row > index ? row - 1 : row, col: col, raw: raw }; }); Object.keys(sheet.cells).forEach(function (key) { sheet.cells[key] = rewriteFormulaReferences(sheet.cells[key], 'row', index, 0, true); }); sheet.rowCount = Math.max(1, sheet.rowCount - 1); }
  function insertColumn(sheet, index) { remapCells(sheet, function (row, col, raw) { return { row: row, col: col >= index ? col + 1 : col, raw: raw }; }); Object.keys(sheet.cells).forEach(function (key) { sheet.cells[key] = rewriteFormulaReferences(sheet.cells[key], 'col', index, 1, false); }); sheet.colCount += 1; }
  function deleteColumn(sheet, index) { remapCells(sheet, function (row, col, raw) { if (col === index) return null; return { row: row, col: col > index ? col - 1 : col, raw: raw }; }); Object.keys(sheet.cells).forEach(function (key) { sheet.cells[key] = rewriteFormulaReferences(sheet.cells[key], 'col', index, 0, true); }); sheet.colCount = Math.max(1, sheet.colCount - 1); }
  function clearRange(sheet, range) { const normalized = normalizeRange(range); for (let row = normalized.startRow; row <= normalized.endRow; row += 1) for (let col = normalized.startCol; col <= normalized.endCol; col += 1) setCellRaw(sheet, row, col, ''); }
  function pushHistory(sheet) { sheet.undoStack.push(cloneSheetState(sheet)); if (sheet.undoStack.length > 50) sheet.undoStack.shift(); sheet.redoStack = []; }
  function restoreHistory(sheet, state) { sheet.cells = Object.assign({}, state.cells); sheet.rowCount = state.rowCount; sheet.colCount = state.colCount; sheet.selected = Object.assign({}, state.selected); sheet.range = state.range ? Object.assign({}, state.range) : null; }
  function undo(sheet) { if (!sheet.undoStack.length) return false; sheet.redoStack.push(cloneSheetState(sheet)); restoreHistory(sheet, sheet.undoStack.pop()); return true; }
  function redo(sheet) { if (!sheet.redoStack.length) return false; sheet.undoStack.push(cloneSheetState(sheet)); restoreHistory(sheet, sheet.redoStack.pop()); return true; }
  return { DEFAULT_ROWS: DEFAULT_ROWS, DEFAULT_COLS: DEFAULT_COLS, ERR: ERR, createSheet: createSheet, cloneSheetState: cloneSheetState, setCellRaw: setCellRaw, getCellRaw: getCellRaw, getCellDisplay: getCellDisplay, colToLabel: colToLabel, parseCellRef: parseCellRef, toRefString: toRefString, normalizeRange: normalizeRange, shiftFormula: shiftFormula, copyRange: copyRange, pasteRange: pasteRange, insertRow: insertRow, deleteRow: deleteRow, insertColumn: insertColumn, deleteColumn: deleteColumn, clearRange: clearRange, pushHistory: pushHistory, undo: undo, redo: redo };
});
