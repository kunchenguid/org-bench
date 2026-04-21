'use strict';

(function () {
  const ROWS = 100;
  const COLS = 26;

  function cellKey(row, col) {
    return `${String.fromCharCode(65 + col)}${row + 1}`;
  }

  function colToName(col) {
    return String.fromCharCode(65 + col);
  }

  function parseCell(raw) {
    if (raw === '') {
      return null;
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith('=')) {
      return {
        raw,
        value: null,
        display: '',
        kind: 'formula',
      };
    }

    if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
      const value = Number(trimmed);
      return {
        raw,
        value,
        display: String(value),
        kind: 'number',
      };
    }

    return {
      raw,
      value: raw,
      display: raw,
      kind: 'text',
    };
  }

  function createSpreadsheetState() {
    return {
      rows: ROWS,
      cols: COLS,
      selection: { row: 0, col: 0 },
      cells: new Map(),
      history: {
        past: [],
        future: [],
        limit: 50,
      },
    };
  }

  function commitCell(state, row, col, raw) {
    const key = cellKey(row, col);
    const parsed = parseCell(raw);

    if (parsed) {
      state.cells.set(key, parsed);
    } else {
      state.cells.delete(key);
    }

    recalculate(state);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function moveSelection(state, rowDelta, colDelta) {
    state.selection = {
      row: clamp(state.selection.row + rowDelta, 0, state.rows - 1),
      col: clamp(state.selection.col + colDelta, 0, state.cols - 1),
    };

    return state.selection;
  }

  function snapshotState(state) {
    const snapshot = {
      selection: { ...state.selection },
      cells: {},
    };

    for (const [key, cell] of state.cells.entries()) {
      snapshot.cells[key] = cell.raw;
    }

    return snapshot;
  }

  function restoreSnapshot(state, snapshot) {
    state.selection = { ...snapshot.selection };
    state.cells.clear();

    for (const [key, raw] of Object.entries(snapshot.cells)) {
      const position = decodeCellKey(key);
      if (!position) {
        continue;
      }

      const parsed = parseCell(raw);
      if (parsed) {
        state.cells.set(key, parsed);
      }
    }

    recalculate(state);
  }

  function pushHistory(history, snapshot) {
    history.past.push(snapshot);
    if (history.past.length > history.limit) {
      history.past.shift();
    }
    history.future.length = 0;
  }

  function applyCellEdit(state, row, col, raw) {
    pushHistory(state.history, snapshotState(state));
    state.selection = { row, col };
    commitCell(state, row, col, raw);
  }

  function undo(state) {
    const previous = state.history.past.pop();
    if (!previous) {
      return false;
    }

    state.history.future.push(snapshotState(state));
    restoreSnapshot(state, previous);
    return true;
  }

  function redo(state) {
    const next = state.history.future.pop();
    if (!next) {
      return false;
    }

    state.history.past.push(snapshotState(state));
    restoreSnapshot(state, next);
    return true;
  }

  function serializeState(state, namespace) {
    const payload = {
      selection: state.selection,
      cells: {},
    };

    for (const [key, cell] of state.cells.entries()) {
      payload.cells[key] = cell.raw;
    }

    return {
      [`${namespace}spreadsheet`]: JSON.stringify(payload),
    };
  }

  function decodeCellKey(key) {
    const match = /^([A-Z])(\d+)$/.exec(key);
    if (!match) {
      return null;
    }

    return {
      row: Number(match[2]) - 1,
      col: match[1].charCodeAt(0) - 65,
    };
  }

  function deserializeState(entries, namespace) {
    const state = createSpreadsheetState();
    const rawPayload = entries[`${namespace}spreadsheet`];

    if (!rawPayload) {
      return state;
    }

    const payload = JSON.parse(rawPayload);
    state.selection = {
      row: clamp(payload.selection?.row ?? 0, 0, ROWS - 1),
      col: clamp(payload.selection?.col ?? 0, 0, COLS - 1),
    };

    for (const [key, raw] of Object.entries(payload.cells || {})) {
      const position = decodeCellKey(key);
      if (!position) {
        continue;
      }

      commitCell(state, position.row, position.col, raw);
    }

    return state;
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

  function rewriteFormulaReferences(formula, axis, index, delta, isDelete) {
    if (!formula || formula[0] !== '=') {
      return formula;
    }
    return formula.replace(/\$?[A-Z]\$?\d+/g, function (match) {
      const refMatch = /^(\$?)([A-Z])(\$?)(\d+)$/.exec(match);
      if (!refMatch) {
        return match;
      }
      const isAbsCol = Boolean(refMatch[1]);
      const isAbsRow = Boolean(refMatch[3]);
      let refCol = refMatch[2].charCodeAt(0) - 65;
      let refRow = Number(refMatch[4]) - 1;
      const value = axis === 'row' ? refRow : refCol;
      if (isDelete && value === index) {
        return '#REF!';
      }
      if (value >= index) {
        if (axis === 'row' && !isAbsRow) {
          refRow = clamp(refRow + delta, 0, ROWS - 1);
        }
        if (axis === 'col' && !isAbsCol) {
          refCol = clamp(refCol + delta, 0, COLS - 1);
        }
      }
      return `${isAbsCol ? '$' : ''}${String.fromCharCode(65 + refCol)}${isAbsRow ? '$' : ''}${refRow + 1}`;
    });
  }

  function recalculate(state) {
    const cache = new Map();
    for (const [key, cell] of state.cells.entries()) {
      if (cell.kind === 'formula') {
        try {
          const value = evaluateFormula(state, cell.raw.slice(1), cache, new Set([key]));
          cell.value = value;
          cell.display = formatValue(value);
        } catch (error) {
          cell.value = null;
          cell.display = normalizeErrorCode(error);
        }
      }
    }
  }

  function evaluateFormula(state, expression, cache, stack) {
    const parser = createFormulaParser(expression, function resolveReference(refKey) {
      if (cache.has(refKey)) {
        const cached = cache.get(refKey);
        if (cached.error) {
          throw formulaError(cached.error);
        }
        return cached.value;
      }

      const refCell = state.cells.get(refKey);
      if (!refCell) {
        cache.set(refKey, { value: 0 });
        return 0;
      }

      if (refCell.kind === 'formula') {
        if (stack.has(refKey)) {
          throw formulaError('#CIRC!');
        }

        const nextStack = new Set(stack);
        nextStack.add(refKey);
        try {
          const computed = evaluateFormula(state, refCell.raw.slice(1), cache, nextStack);
          cache.set(refKey, { value: computed });
          return computed;
        } catch (error) {
          const code = normalizeErrorCode(error);
          cache.set(refKey, { error: code });
          throw formulaError(code);
        }
      }

      if (refCell.kind === 'number') {
        cache.set(refKey, { value: refCell.value });
        return refCell.value;
      }

      cache.set(refKey, { value: 0 });
      return 0;
    });

    return parser.parse();
  }

  function formatValue(value) {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (!Number.isFinite(value)) {
      throw formulaError('#ERR!');
    }
    return String(value);
  }

  function formulaError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function normalizeErrorCode(error) {
    return error && error.code ? error.code : '#ERR!';
  }

  function decodeReference(token) {
    const match = /^([A-Z])(\d+)$/.exec(token);
    if (!match) {
      throw new Error(`Invalid reference ${token}`);
    }

    return {
      row: Number(match[2]) - 1,
      col: match[1].charCodeAt(0) - 65,
      key: token,
    };
  }

  function getRangeValues(startRef, endRef, resolveReference) {
    const startRow = Math.min(startRef.row, endRef.row);
    const endRow = Math.max(startRef.row, endRef.row);
    const startCol = Math.min(startRef.col, endRef.col);
    const endCol = Math.max(startRef.col, endRef.col);
    const values = [];

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        values.push(Number(resolveReference(cellKey(row, col))) || 0);
      }
    }

    return values;
  }

  function evaluateFunction(name, args) {
    if (name === 'SUM') {
      return args.reduce((total, value) => total + value, 0);
    }
    if (name === 'AVERAGE') {
      return args.reduce((total, value) => total + value, 0) / args.length;
    }
    if (name === 'MIN') {
      return Math.min.apply(null, args);
    }
    if (name === 'MAX') {
      return Math.max.apply(null, args);
    }
    if (name === 'COUNT') {
      return args.length;
    }
    if (name === 'ABS') {
      return Math.abs(args[0]);
    }
    if (name === 'ROUND') {
      return Math.round(args[0]);
    }
    if (name === 'IF') {
      return args[0] ? args[1] : args[2];
    }
    if (name === 'AND') {
      return args.every(Boolean);
    }
    if (name === 'OR') {
      return args.some(Boolean);
    }
    if (name === 'NOT') {
      return !args[0];
    }
    if (name === 'CONCAT') {
      return args.join('');
    }

    throw formulaError('#ERR!');
  }

  function createFormulaParser(expression, resolveReference) {
    let index = 0;

    function skipWhitespace() {
      while (index < expression.length && /\s/.test(expression[index])) {
        index += 1;
      }
    }

    function peek() {
      skipWhitespace();
      return expression[index];
    }

    function consume(char) {
      skipWhitespace();
      if (expression[index] === char) {
        index += 1;
        return true;
      }
      return false;
    }

    function readToken() {
      skipWhitespace();
      const match = /^[A-Z]+\d*/.exec(expression.slice(index));
      if (!match) {
        return '';
      }
      index += match[0].length;
      return match[0];
    }

    function readNumber() {
      skipWhitespace();
      const match = /^\d+(?:\.\d+)?/.exec(expression.slice(index));
      if (!match) {
        throw new Error('Expected number');
      }
      index += match[0].length;
      return Number(match[0]);
    }

    function readString() {
      skipWhitespace();
      if (expression[index] !== '"') {
        throw new Error('Expected string');
      }
      index += 1;
      let value = '';
      while (index < expression.length && expression[index] !== '"') {
        value += expression[index];
        index += 1;
      }
      if (expression[index] !== '"') {
        throw new Error('Unterminated string');
      }
      index += 1;
      return value;
    }

    function parseFunctionCall(name) {
      if (!consume('(')) {
        throw new Error('Expected function call');
      }

      if (name === 'SUM' || name === 'AVERAGE' || name === 'MIN' || name === 'MAX' || name === 'COUNT') {
        const startRef = decodeReference(readToken());
        if (!consume(':')) {
          throw new Error('Expected range separator');
        }
        const endRef = decodeReference(readToken());
        if (!consume(')')) {
          throw new Error('Expected closing function parenthesis');
        }
        return evaluateFunction(name, getRangeValues(startRef, endRef, resolveReference));
      }

      if (name === 'ABS' || name === 'ROUND') {
        const value = parseExpression();
        if (!consume(')')) {
          throw new Error('Expected closing function parenthesis');
        }
        return evaluateFunction(name, [value]);
      }

      if (name === 'IF') {
        const condition = parseComparison();
        if (!consume(',')) {
          throw new Error('Expected argument separator');
        }
        const whenTrue = parseComparison();
        if (!consume(',')) {
          throw new Error('Expected argument separator');
        }
        const whenFalse = parseComparison();
        if (!consume(')')) {
          throw new Error('Expected closing function parenthesis');
        }
        return evaluateFunction(name, [condition, whenTrue, whenFalse]);
      }

      if (name === 'AND' || name === 'OR') {
        const args = [parseComparison()];
        while (consume(',')) {
          args.push(parseComparison());
        }
        if (!consume(')')) {
          throw new Error('Expected closing function parenthesis');
        }
        return evaluateFunction(name, args);
      }

      if (name === 'NOT') {
        const value = parseComparison();
        if (!consume(')')) {
          throw new Error('Expected closing function parenthesis');
        }
        return evaluateFunction(name, [value]);
      }

      if (name === 'CONCAT') {
        const args = [parseComparison()];
        while (consume(',')) {
          args.push(parseComparison());
        }
        if (!consume(')')) {
          throw new Error('Expected closing function parenthesis');
        }
        return evaluateFunction(name, args.map(String));
      }

      throw formulaError('#ERR!');
    }

    function parsePrimary() {
      skipWhitespace();

      if (consume('(')) {
        const value = parseExpression();
        if (!consume(')')) {
          throw new Error('Missing closing parenthesis');
        }
        return value;
      }

      if (consume('-')) {
        return -parsePrimary();
      }

      if (peek() === '"') {
        return readString();
      }

      if (/\d/.test(peek())) {
        return readNumber();
      }

      const token = readToken();
      if (!token) {
        throw new Error('Expected value');
      }

      if (token === 'TRUE') {
        return true;
      }

      if (token === 'FALSE') {
        return false;
      }

      if (peek() === '(') {
        return parseFunctionCall(token);
      }

      return Number(resolveReference(decodeReference(token).key)) || 0;
    }

    function parseTerm() {
      let value = parsePrimary();
      while (true) {
        if (consume('*')) {
          value *= parsePrimary();
        } else if (consume('/')) {
          const divisor = parsePrimary();
          if (divisor === 0) {
            throw formulaError('#DIV/0!');
          }
          value /= divisor;
        } else {
          return value;
        }
      }
    }

    function parseExpression() {
      let value = parseTerm();
      while (true) {
        if (consume('+')) {
          value += parseTerm();
        } else if (consume('-')) {
          value -= parseTerm();
        } else if (consume('&')) {
          value = String(value) + String(parseTerm());
        } else {
          return value;
        }
      }
    }

    function parseComparison() {
      let value = parseExpression();

      if (consume('>')) {
        if (consume('=')) {
          return value >= parseExpression();
        }
        return value > parseExpression();
      }

      if (consume('<')) {
        if (consume('=')) {
          return value <= parseExpression();
        }
        if (consume('>')) {
          return value !== parseExpression();
        }
        return value < parseExpression();
      }

      if (consume('=')) {
        return value === parseExpression();
      }

      return value;
    }

    return {
      parse() {
        const value = parseComparison();
        skipWhitespace();
        if (index !== expression.length) {
          throw new Error('Unexpected trailing input');
        }
        return value;
      },
    };
  }

  const api = {
    ROWS,
    COLS,
    cellKey,
    createSpreadsheetState,
    commitCell,
    moveSelection,
    applyCellEdit,
    undo,
    redo,
    serializeState,
    deserializeState,
    recalculate,
    colToName,
    createEditBuffer,
    resolveEditBuffer,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.SpreadsheetCore = api;
  }
})();
