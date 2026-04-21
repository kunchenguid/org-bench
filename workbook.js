(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetLib = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const COLS = 26;
  const ROWS = 100;
  const CIRC_ERROR = { type: 'error', code: '#CIRC!' };

  function colToName(col) {
    let n = col + 1;
    let name = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function nameToCol(name) {
    let result = 0;
    for (let i = 0; i < name.length; i += 1) {
      result = result * 26 + (name.charCodeAt(i) - 64);
    }
    return result - 1;
  }

  function parseCoord(coord) {
    const match = /^([A-Z]+)(\d+)$/.exec(String(coord).toUpperCase());
    if (!match) {
      throw new Error('Invalid cell reference');
    }
    const col = nameToCol(match[1]);
    const row = Number(match[2]) - 1;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
      throw new Error('Reference out of bounds');
    }
    return { col, row };
  }

  function toCoord(row, col) {
    return `${colToName(col)}${row + 1}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isBlank(raw) {
    return raw == null || raw === '';
  }

  function makeError(code) {
    return { type: 'error', code };
  }

  function isError(value) {
    return value && value.type === 'error';
  }

  function isRange(value) {
    return value && value.type === 'range';
  }

  function isNumberLike(value) {
    return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  }

  function toNumber(value) {
    if (isError(value)) {
      return value;
    }
    if (value == null || value === '') {
      return 0;
    }
    if (value === true) {
      return 1;
    }
    if (value === false) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function toText(value) {
    if (isError(value)) {
      return value;
    }
    if (value == null) {
      return '';
    }
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    return String(value);
  }

  function normalizeValue(value) {
    if (isError(value)) {
      return value;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return makeError('#ERR!');
    }
    return value;
  }

  function displayValue(value) {
    if (isError(value)) {
      return value.code;
    }
    if (value == null || value === '') {
      return '';
    }
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return String(value);
      }
      return String(Number(value.toFixed(10)));
    }
    return String(value);
  }

  function mapFormulaRefs(formula, mapper) {
    let inString = false;
    let result = '';
    for (let i = 0; i < formula.length; i += 1) {
      const ch = formula[i];
      if (ch === '"') {
        inString = !inString;
        result += ch;
        continue;
      }
      if (!inString) {
        const match = /^\$?[A-Z]+\$?\d+/.exec(formula.slice(i).toUpperCase());
        if (match) {
          result += mapper(match[0]);
          i += match[0].length - 1;
          continue;
        }
      }
      result += ch;
    }
    return result;
  }

  function tokenize(formula) {
    const tokens = [];
    let i = 0;
    while (i < formula.length) {
      const ch = formula[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let value = '';
        while (j < formula.length && formula[j] !== '"') {
          value += formula[j];
          j += 1;
        }
        if (j >= formula.length) {
          throw new Error('Unterminated string');
        }
        tokens.push({ type: 'string', value });
        i = j + 1;
        continue;
      }
      const two = formula.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      if ('+-*/(),:&=<>' .includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i += 1;
        continue;
      }
      const numberMatch = /^\d+(?:\.\d+)?/.exec(formula.slice(i));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        i += numberMatch[0].length;
        continue;
      }
      const identMatch = /^\$?[A-Z]+\$?\d+|^[A-Z_]+/.exec(formula.slice(i).toUpperCase());
      if (identMatch) {
        const ident = identMatch[0];
        if (/^\$?[A-Z]+\$?\d+$/.test(ident)) {
          tokens.push({ type: 'ref', value: ident });
        } else {
          tokens.push({ type: 'ident', value: ident });
        }
        i += ident.length;
        continue;
      }
      throw new Error(`Unexpected token ${ch}`);
    }
    return tokens;
  }

  function parseFormula(formula) {
    const tokens = tokenize(formula.toUpperCase().startsWith('=') ? formula.slice(1) : formula);
    let index = 0;

    function peek(offset) {
      return tokens[index + (offset || 0)] || null;
    }

    function consume(expected) {
      const token = tokens[index];
      if (!token || (expected && token.value !== expected)) {
        throw new Error('Unexpected token');
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek() && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const op = consume().value;
        const right = parseConcat();
        node = { type: 'binary', op, left: node, right };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAdditive();
      while (peek() && peek().value === '&') {
        consume('&');
        node = { type: 'binary', op: '&', left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (peek() && (peek().value === '+' || peek().value === '-')) {
        const op = consume().value;
        node = { type: 'binary', op, left: node, right: parseMultiplicative() };
      }
      return node;
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (peek() && (peek().value === '*' || peek().value === '/')) {
        const op = consume().value;
        node = { type: 'binary', op, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (peek() && peek().value === '-') {
        consume('-');
        return { type: 'unary', op: '-', expr: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new Error('Unexpected end');
      }
      if (token.type === 'number') {
        consume();
        return { type: 'literal', value: token.value };
      }
      if (token.type === 'string') {
        consume();
        return { type: 'literal', value: token.value };
      }
      if (token.type === 'ref') {
        const start = consume().value;
        if (peek() && peek().value === ':') {
          consume(':');
          const end = consume().value;
          if (!end || tokens[index - 1].type !== 'ref') {
            throw new Error('Expected range ref');
          }
          return { type: 'range', start, end };
        }
        return { type: 'ref', ref: start };
      }
      if (token.type === 'ident') {
        const ident = consume().value;
        if (ident === 'TRUE') {
          return { type: 'literal', value: true };
        }
        if (ident === 'FALSE') {
          return { type: 'literal', value: false };
        }
        if (peek() && peek().value === '(') {
          consume('(');
          const args = [];
          if (!peek() || peek().value !== ')') {
            while (true) {
              args.push(parseExpression());
              if (peek() && peek().value === ',') {
                consume(',');
                continue;
              }
              break;
            }
          }
          consume(')');
          return { type: 'call', name: ident, args };
        }
        throw new Error('Unknown identifier');
      }
      if (token.value === '(') {
        consume('(');
        const expr = parseExpression();
        consume(')');
        return expr;
      }
      throw new Error('Unexpected token');
    }

    const ast = parseExpression();
    if (index !== tokens.length) {
      throw new Error('Unexpected trailing tokens');
    }
    return ast;
  }

  function parseRefParts(ref) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
    if (!match) {
      throw new Error('Bad reference');
    }
    return {
      absCol: match[1] === '$',
      colName: match[2],
      absRow: match[3] === '$',
      rowNumber: Number(match[4]),
    };
  }

  function normalizeRef(ref) {
    const parts = parseRefParts(ref);
    const col = nameToCol(parts.colName);
    const row = parts.rowNumber - 1;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
      return makeError('#REF!');
    }
    return toCoord(row, col);
  }

  function evalBinary(op, left, right) {
    if (isError(left)) {
      return left;
    }
    if (isError(right)) {
      return right;
    }
    if (op === '&') {
      const leftText = toText(left);
      const rightText = toText(right);
      return isError(leftText) ? leftText : (isError(rightText) ? rightText : leftText + rightText);
    }
    if (['+', '-', '*', '/'].includes(op)) {
      const a = toNumber(left);
      const b = toNumber(right);
      if (isError(a)) {
        return a;
      }
      if (isError(b)) {
        return b;
      }
      if (op === '+') {
        return a + b;
      }
      if (op === '-') {
        return a - b;
      }
      if (op === '*') {
        return a * b;
      }
      if (b === 0) {
        return makeError('#DIV/0!');
      }
      return a / b;
    }
    const comparableLeft = isNumberLike(left) && isNumberLike(right) ? Number(left) : toText(left);
    const comparableRight = isNumberLike(left) && isNumberLike(right) ? Number(right) : toText(right);
    if (op === '=') {
      return comparableLeft === comparableRight;
    }
    if (op === '<>') {
      return comparableLeft !== comparableRight;
    }
    if (op === '<') {
      return comparableLeft < comparableRight;
    }
    if (op === '<=') {
      return comparableLeft <= comparableRight;
    }
    if (op === '>') {
      return comparableLeft > comparableRight;
    }
    if (op === '>=') {
      return comparableLeft >= comparableRight;
    }
    return makeError('#ERR!');
  }

  function flattenArgs(args) {
    const values = [];
    args.forEach((arg) => {
      if (isRange(arg)) {
        arg.values.forEach((value) => values.push(value));
      } else {
        values.push(arg);
      }
    });
    return values;
  }

  function invokeFunction(name, args) {
    const values = flattenArgs(args);
    const firstError = values.find(isError);
    if (firstError) {
      return firstError;
    }
    if (name === 'SUM') {
      return values.reduce((sum, value) => sum + toNumber(value), 0);
    }
    if (name === 'AVERAGE') {
      return values.length ? values.reduce((sum, value) => sum + toNumber(value), 0) / values.length : 0;
    }
    if (name === 'MIN') {
      return values.length ? Math.min.apply(null, values.map(toNumber)) : 0;
    }
    if (name === 'MAX') {
      return values.length ? Math.max.apply(null, values.map(toNumber)) : 0;
    }
    if (name === 'COUNT') {
      return values.filter((value) => value !== '' && value != null).length;
    }
    if (name === 'ABS') {
      return Math.abs(toNumber(values[0]));
    }
    if (name === 'ROUND') {
      const digits = values.length > 1 ? toNumber(values[1]) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(toNumber(values[0]) * factor) / factor;
    }
    if (name === 'CONCAT') {
      return values.map((value) => toText(value)).join('');
    }
    if (name === 'IF') {
      return values[0] ? values[1] : values[2];
    }
    if (name === 'AND') {
      return values.every(Boolean);
    }
    if (name === 'OR') {
      return values.some(Boolean);
    }
    if (name === 'NOT') {
      return !values[0];
    }
    return makeError('#ERR!');
  }

  class SpreadsheetModel {
    constructor(state) {
      this.cells = new Map();
      if (state && state.cells) {
        Object.keys(state.cells).forEach((coord) => {
          if (!isBlank(state.cells[coord])) {
            this.cells.set(coord, state.cells[coord]);
          }
        });
      }
    }

    setCell(coord, raw) {
      const normalized = String(raw == null ? '' : raw);
      if (normalized === '') {
        this.cells.delete(coord);
      } else {
        this.cells.set(coord, normalized);
      }
    }

    getRaw(coord) {
      return this.cells.get(coord) || '';
    }

    clearRect(start, end) {
      forEachCoord(start, end, (coord) => this.cells.delete(coord));
    }

    insertRow(rowIndex) {
      this.mutateStructure('row', 'insert', rowIndex);
    }

    deleteRow(rowIndex) {
      this.mutateStructure('row', 'delete', rowIndex);
    }

    insertColumn(colIndex) {
      this.mutateStructure('col', 'insert', colIndex);
    }

    deleteColumn(colIndex) {
      this.mutateStructure('col', 'delete', colIndex);
    }

    mutateStructure(axis, mode, index) {
      const nextCells = new Map();
      this.cells.forEach((raw, coord) => {
        const nextCoord = shiftCoord(coord, axis, mode, index);
        if (!nextCoord) {
          return;
        }
        nextCells.set(nextCoord, rewriteFormulaForStructure(raw, axis, mode, index));
      });
      this.cells = nextCells;
    }

    getSnapshot() {
      return { cells: Object.fromEntries(this.cells.entries()) };
    }

    getDisplayValue(coord) {
      return displayValue(this.getComputedValue(coord));
    }

    getComputedValue(coord) {
      const cache = new Map();
      return this.evaluateCell(coord, cache, new Set());
    }

    evaluateCell(coord, cache, visiting) {
      if (cache.has(coord)) {
        return cache.get(coord);
      }
      if (visiting.has(coord)) {
        return CIRC_ERROR;
      }
      visiting.add(coord);
      const raw = this.getRaw(coord);
      let result;
      if (raw.startsWith('=')) {
        if (raw.includes('#REF!')) {
          result = makeError('#REF!');
          visiting.delete(coord);
          cache.set(coord, result);
          return result;
        }
        try {
          const ast = parseFormula(raw);
          result = normalizeValue(this.evaluateAst(ast, cache, visiting));
        } catch (error) {
          result = makeError('#ERR!');
        }
      } else if (raw.trim() !== '' && Number.isFinite(Number(raw))) {
        result = Number(raw);
      } else {
        result = raw;
      }
      visiting.delete(coord);
      cache.set(coord, result);
      return result;
    }

    evaluateAst(node, cache, visiting) {
      if (node.type === 'literal') {
        return node.value;
      }
      if (node.type === 'unary') {
        const value = this.evaluateAst(node.expr, cache, visiting);
        if (isError(value)) {
          return value;
        }
        return -toNumber(value);
      }
      if (node.type === 'binary') {
        return evalBinary(node.op, this.evaluateAst(node.left, cache, visiting), this.evaluateAst(node.right, cache, visiting));
      }
      if (node.type === 'ref') {
        const coord = normalizeRef(node.ref);
        if (isError(coord)) {
          return coord;
        }
        return this.evaluateCell(coord, cache, visiting);
      }
      if (node.type === 'range') {
        return this.evaluateRange(node.start, node.end, cache, visiting);
      }
      if (node.type === 'call') {
        const args = node.args.map((arg) => this.evaluateAst(arg, cache, visiting));
        return normalizeValue(invokeFunction(node.name, args));
      }
      return makeError('#ERR!');
    }

    evaluateRange(startRef, endRef, cache, visiting) {
      const start = normalizeRef(startRef);
      const end = normalizeRef(endRef);
      if (isError(start)) {
        return start;
      }
      if (isError(end)) {
        return end;
      }
      const startCoord = parseCoord(start);
      const endCoord = parseCoord(end);
      const values = [];
      const rowStart = Math.min(startCoord.row, endCoord.row);
      const rowEnd = Math.max(startCoord.row, endCoord.row);
      const colStart = Math.min(startCoord.col, endCoord.col);
      const colEnd = Math.max(startCoord.col, endCoord.col);
      for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) {
          values.push(this.evaluateCell(toCoord(row, col), cache, visiting));
        }
      }
      return { type: 'range', values };
    }
  }

  function parseSelectionRect(selection) {
    const start = parseCoord(selection.start);
    const end = parseCoord(selection.end);
    return {
      rowStart: Math.min(start.row, end.row),
      rowEnd: Math.max(start.row, end.row),
      colStart: Math.min(start.col, end.col),
      colEnd: Math.max(start.col, end.col),
    };
  }

  function forEachCoord(startCoord, endCoord, callback) {
    const rect = parseSelectionRect({ start: startCoord, end: endCoord });
    for (let row = rect.rowStart; row <= rect.rowEnd; row += 1) {
      for (let col = rect.colStart; col <= rect.colEnd; col += 1) {
        callback(toCoord(row, col), row, col);
      }
    }
  }

  function shiftRef(ref, rowOffset, colOffset) {
    const parts = parseRefParts(ref);
    const col = parts.absCol ? nameToCol(parts.colName) : nameToCol(parts.colName) + colOffset;
    const row = parts.absRow ? parts.rowNumber - 1 : parts.rowNumber - 1 + rowOffset;
    const nextCol = clamp(col, 0, COLS - 1);
    const nextRow = clamp(row, 0, ROWS - 1);
    return `${parts.absCol ? '$' : ''}${colToName(nextCol)}${parts.absRow ? '$' : ''}${nextRow + 1}`;
  }

  function formatRef(parts, col, row) {
    return `${parts.absCol ? '$' : ''}${colToName(col)}${parts.absRow ? '$' : ''}${row + 1}`;
  }

  function rewriteFormulaForStructure(raw, axis, mode, index) {
    if (!raw.startsWith('=')) {
      return raw;
    }
    return mapFormulaRefs(raw, (ref) => {
      const parts = parseRefParts(ref);
      const col = nameToCol(parts.colName);
      const row = parts.rowNumber - 1;
      if (axis === 'row') {
        if (mode === 'insert') {
          return row >= index ? formatRef(parts, col, row + 1) : ref;
        }
        if (row === index) {
          return '#REF!';
        }
        return row > index ? formatRef(parts, col, row - 1) : ref;
      }
      if (mode === 'insert') {
        return col >= index ? formatRef(parts, col + 1, row) : ref;
      }
      if (col === index) {
        return '#REF!';
      }
      return col > index ? formatRef(parts, col - 1, row) : ref;
    });
  }

  function shiftCoord(coord, axis, mode, index) {
    const parsed = parseCoord(coord);
    if (axis === 'row') {
      if (mode === 'insert') {
        if (parsed.row < index) {
          return coord;
        }
        if (parsed.row >= ROWS - 1) {
          return null;
        }
        return toCoord(parsed.row + 1, parsed.col);
      }
      if (parsed.row === index) {
        return null;
      }
      return toCoord(parsed.row > index ? parsed.row - 1 : parsed.row, parsed.col);
    }
    if (mode === 'insert') {
      if (parsed.col < index) {
        return coord;
      }
      if (parsed.col >= COLS - 1) {
        return null;
      }
      return toCoord(parsed.row, parsed.col + 1);
    }
    if (parsed.col === index) {
      return null;
    }
    return toCoord(parsed.row, parsed.col > index ? parsed.col - 1 : parsed.col);
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    return mapFormulaRefs(formula, (ref) => shiftRef(ref, rowOffset, colOffset));
  }

  function selectionToTSV(model, selection) {
    const rect = parseSelectionRect(selection);
    const rows = [];
    for (let row = rect.rowStart; row <= rect.rowEnd; row += 1) {
      const cols = [];
      for (let col = rect.colStart; col <= rect.colEnd; col += 1) {
        cols.push(model.getRaw(toCoord(row, col)));
      }
      rows.push(cols.join('\t'));
    }
    return rows.join('\n');
  }

  function parseTSV(text) {
    return String(text).replace(/\r/g, '').split('\n').map((line) => line.split('\t'));
  }

  function applyPaste(model, targetCoord, text, options) {
    const matrix = parseTSV(text);
    const targetSelection = options && options.targetSelection ? parseSelectionRect(options.targetSelection) : null;
    const target = targetSelection && matrix.length === (targetSelection.rowEnd - targetSelection.rowStart + 1)
      && matrix[0] && matrix[0].length === (targetSelection.colEnd - targetSelection.colStart + 1)
      ? { row: targetSelection.rowStart, col: targetSelection.colStart }
      : parseCoord(targetCoord);
    const sourceTopLeft = options && options.sourceSelection ? parseCoord(options.sourceSelection.start) : null;
    matrix.forEach((rowValues, rowIndex) => {
      rowValues.forEach((raw, colIndex) => {
        const row = clamp(target.row + rowIndex, 0, ROWS - 1);
        const col = clamp(target.col + colIndex, 0, COLS - 1);
        const dest = toCoord(row, col);
        let nextRaw = raw;
        if (nextRaw.startsWith('=') && sourceTopLeft) {
          nextRaw = shiftFormula(nextRaw, row - (sourceTopLeft.row + rowIndex), col - (sourceTopLeft.col + colIndex));
        }
        model.setCell(dest, nextRaw);
      });
    });
  }

  function resolveStorageNamespace(root) {
    const globalRoot = root || {};
    const doc = globalRoot.document && globalRoot.document.documentElement ? globalRoot.document.documentElement : null;
    return globalRoot.__RUN_STORAGE_NAMESPACE__
      || globalRoot.RUN_STORAGE_NAMESPACE
      || globalRoot.__BENCHMARK_RUN_NAMESPACE__
      || (doc && typeof doc.getAttribute === 'function' ? doc.getAttribute('data-storage-namespace') : null)
      || 'facebook-sheet';
  }

  return {
    SpreadsheetModel,
    COLS,
    ROWS,
    colToName,
    parseCoord,
    toCoord,
    displayValue,
    shiftFormula,
    selectionToTSV,
    applyPaste,
    parseSelectionRect,
    forEachCoord,
    resolveStorageNamespace,
  };
}));
