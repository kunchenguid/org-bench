'use strict';

(function () {
  const ROWS = 100;
  const COLS = 26;

  function FormulaError(code) {
    this.name = 'FormulaError';
    this.code = code;
  }

  FormulaError.prototype = Object.create(Error.prototype);

  function cellKey(row, col) {
    return `${String.fromCharCode(65 + col)}${row + 1}`;
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

  function createSpreadsheetState() {
    return {
      rows: ROWS,
      cols: COLS,
      selection: { row: 0, col: 0 },
      cells: new Map(),
      rawCells: new Map(),
    };
  }

  function commitCell(state, row, col, raw) {
    const key = cellKey(row, col);
    if (raw === '') {
      state.rawCells.delete(key);
    } else {
      state.rawCells.set(key, String(raw));
    }

    recalculateState(state);
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

  function serializeState(state, namespace) {
    const payload = {
      selection: state.selection,
      cells: {},
    };

    for (const [key, raw] of state.rawCells.entries()) {
      payload.cells[key] = raw;
    }

    return {
      [`${namespace}spreadsheet`]: JSON.stringify(payload),
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
      if (!position || raw === '') {
        continue;
      }

      state.rawCells.set(key, String(raw));
    }

    recalculateState(state);
    return state;
  }

  function recalculateState(state) {
    const cache = new Map();
    state.cells = new Map();

    for (const key of state.rawCells.keys()) {
      state.cells.set(key, evaluateStoredCell(state, key, cache, []));
    }
  }

  function evaluateStoredCell(state, key, cache, stack) {
    if (cache.has(key)) {
      return cache.get(key);
    }

    if (stack.includes(key)) {
      const circular = createErrorCell(state.rawCells.get(key) || `=${key}`, '#CIRC!');
      cache.set(key, circular);
      return circular;
    }

    const raw = state.rawCells.get(key);
    if (raw == null) {
      return null;
    }

    const nextStack = stack.concat(key);
    let cell;
    if (raw.startsWith('=')) {
      cell = evaluateFormulaCell(state, key, raw, cache, nextStack);
    } else {
      cell = parseLiteralCell(raw);
    }

    cache.set(key, cell);
    return cell;
  }

  function parseLiteralCell(raw) {
    const trimmed = raw.trim();
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

  function evaluateFormulaCell(state, key, raw, cache, stack) {
    try {
      const tokens = tokenize(raw.slice(1));
      const parser = createParser(tokens);
      const expression = parser.parseExpression();
      parser.expect('eof');
      const value = evaluateExpression(expression, state, cache, stack);
      return {
        raw,
        value,
        display: formatValue(value),
        kind: 'formula',
      };
    } catch (error) {
      if (error instanceof FormulaError) {
        return createErrorCell(raw, error.code);
      }

      return createErrorCell(raw, '#ERR!');
    }
  }

  function createErrorCell(raw, code) {
    return {
      raw,
      value: code,
      display: code,
      kind: 'error',
    };
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      const char = source[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      const twoChar = source.slice(index, index + 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=<>():,'.includes(char)) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? char : 'operator', value: char });
        index += 1;
        continue;
      }

      if (char === '"') {
        let value = '';
        index += 1;
        while (index < source.length && source[index] !== '"') {
          value += source[index];
          index += 1;
        }

        if (source[index] !== '"') {
          throw new FormulaError('#ERR!');
        }

        index += 1;
        tokens.push({ type: 'string', value });
        continue;
      }

      if (/\d/.test(char) || (char === '.' && /\d/.test(source[index + 1] || ''))) {
        let value = char;
        index += 1;
        while (index < source.length && /[\d.]/.test(source[index])) {
          value += source[index];
          index += 1;
        }
        tokens.push({ type: 'number', value: Number(value) });
        continue;
      }

      if (/[A-Za-z]/.test(char)) {
        let value = char;
        index += 1;
        while (index < source.length && /[A-Za-z0-9]/.test(source[index])) {
          value += source[index];
          index += 1;
        }
        tokens.push({ type: 'identifier', value: value.toUpperCase() });
        continue;
      }

      throw new FormulaError('#ERR!');
    }

    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function createParser(tokens) {
    let index = 0;

    return {
      parseExpression,
      expect,
    };

    function current() {
      return tokens[index];
    }

    function advance() {
      const token = tokens[index];
      index += 1;
      return token;
    }

    function expect(type, value) {
      const token = current();
      if (!token || token.type !== type || (value != null && token.value !== value)) {
        throw new FormulaError('#ERR!');
      }
      return advance();
    }

    function match(type, value) {
      const token = current();
      if (token && token.type === type && (value == null || token.value === value)) {
        advance();
        return token;
      }
      return null;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcat();
      while (true) {
        const token = match('operator', '=') || match('operator', '<>') || match('operator', '<') || match('operator', '<=') || match('operator', '>') || match('operator', '>=');
        if (!token) {
          return node;
        }
        node = { type: 'binary', operator: token.value, left: node, right: parseConcat() };
      }
    }

    function parseConcat() {
      let node = parseAddSub();
      while (true) {
        const token = match('operator', '&');
        if (!token) {
          return node;
        }
        node = { type: 'binary', operator: token.value, left: node, right: parseAddSub() };
      }
    }

    function parseAddSub() {
      let node = parseMulDiv();
      while (true) {
        const token = match('operator', '+') || match('operator', '-');
        if (!token) {
          return node;
        }
        node = { type: 'binary', operator: token.value, left: node, right: parseMulDiv() };
      }
    }

    function parseMulDiv() {
      let node = parseUnary();
      while (true) {
        const token = match('operator', '*') || match('operator', '/');
        if (!token) {
          return node;
        }
        node = { type: 'binary', operator: token.value, left: node, right: parseUnary() };
      }
    }

    function parseUnary() {
      if (match('operator', '-')) {
        return { type: 'unary', operator: '-', value: parseUnary() };
      }

      return parsePrimary();
    }

    function parsePrimary() {
      const number = match('number');
      if (number) {
        return { type: 'number', value: number.value };
      }

      const string = match('string');
      if (string) {
        return { type: 'string', value: string.value };
      }

      const identifier = match('identifier');
      if (identifier) {
        if (identifier.value === 'TRUE' || identifier.value === 'FALSE') {
          return { type: 'boolean', value: identifier.value === 'TRUE' };
        }

        if (match('(')) {
          const args = [];
          if (!match(')')) {
            do {
              args.push(parseExpression());
            } while (match(','));
            expect(')');
          }
          return { type: 'function', name: identifier.value, args };
        }

        if (/^[A-Z]\d+$/.test(identifier.value)) {
          const ref = { type: 'cell', key: identifier.value };
          if (match(':')) {
            const end = expect('identifier');
            if (!/^[A-Z]\d+$/.test(end.value)) {
              throw new FormulaError('#ERR!');
            }
            return { type: 'range', start: identifier.value, end: end.value };
          }
          return ref;
        }

        throw new FormulaError('#ERR!');
      }

      if (match('(')) {
        const node = parseExpression();
        expect(')');
        return node;
      }

      throw new FormulaError('#ERR!');
    }
  }

  function evaluateExpression(node, state, cache, stack) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'unary':
        return -toNumber(evaluateExpression(node.value, state, cache, stack));
      case 'binary':
        return evaluateBinary(node, state, cache, stack);
      case 'cell':
        return evaluateCellReference(state, node.key, cache, stack);
      case 'range':
        return evaluateRangeReference(state, node.start, node.end, cache, stack);
      case 'function':
        return evaluateFunction(node, state, cache, stack);
      default:
        throw new FormulaError('#ERR!');
    }
  }

  function evaluateBinary(node, state, cache, stack) {
    const left = evaluateExpression(node.left, state, cache, stack);
    const right = evaluateExpression(node.right, state, cache, stack);

    switch (node.operator) {
      case '+':
        return toNumber(left) + toNumber(right);
      case '-':
        return toNumber(left) - toNumber(right);
      case '*':
        return toNumber(left) * toNumber(right);
      case '/':
        if (toNumber(right) === 0) {
          throw new FormulaError('#DIV/0!');
        }
        return toNumber(left) / toNumber(right);
      case '&':
        return toText(left) + toText(right);
      case '=':
        return compareValues(left, right) === 0;
      case '<>':
        return compareValues(left, right) !== 0;
      case '<':
        return compareValues(left, right) < 0;
      case '<=':
        return compareValues(left, right) <= 0;
      case '>':
        return compareValues(left, right) > 0;
      case '>=':
        return compareValues(left, right) >= 0;
      default:
        throw new FormulaError('#ERR!');
    }
  }

  function evaluateCellReference(state, key, cache, stack) {
    const position = decodeCellKey(key);
    if (!position || position.row < 0 || position.row >= ROWS || position.col < 0 || position.col >= COLS) {
      throw new FormulaError('#REF!');
    }

    const cell = evaluateStoredCell(state, key, cache, stack);
    if (!cell) {
      return null;
    }

    if (cell.kind === 'error') {
      throw new FormulaError(cell.display);
    }

    return cell.value;
  }

  function evaluateRangeReference(state, startKey, endKey, cache, stack) {
    const start = decodeCellKey(startKey);
    const end = decodeCellKey(endKey);
    if (!start || !end) {
      throw new FormulaError('#REF!');
    }

    const top = Math.min(start.row, end.row);
    const bottom = Math.max(start.row, end.row);
    const left = Math.min(start.col, end.col);
    const right = Math.max(start.col, end.col);
    const values = [];

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        values.push(evaluateCellReference(state, cellKey(row, col), cache, stack));
      }
    }

    return values;
  }

  function evaluateFunction(node, state, cache, stack) {
    const args = node.args.map((arg) => evaluateExpression(arg, state, cache, stack));

    switch (node.name) {
      case 'SUM':
        return flatten(args).reduce((sum, value) => sum + toNumber(value), 0);
      case 'CONCAT':
        return flatten(args).map(toText).join('');
      case 'ABS':
        return Math.abs(toNumber(args[0]));
      case 'ROUND':
        return Math.round(toNumber(args[0]));
      case 'IF':
        return isTruthy(args[0]) ? args[1] : args[2];
      case 'AND':
        return flatten(args).every(isTruthy);
      case 'OR':
        return flatten(args).some(isTruthy);
      case 'NOT':
        return !isTruthy(args[0]);
      default:
        throw new FormulaError('#ERR!');
    }
  }

  function flatten(values) {
    return values.flatMap((value) => (Array.isArray(value) ? flatten(value) : [value]));
  }

  function toNumber(value) {
    if (value == null || value === '') {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      throw new FormulaError('#ERR!');
    }
    return numeric;
  }

  function toText(value) {
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function isTruthy(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return value != null && value !== '';
  }

  function compareValues(left, right) {
    if (typeof left === 'string' || typeof right === 'string') {
      return toText(left).localeCompare(toText(right));
    }
    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    if (leftNumber < rightNumber) {
      return -1;
    }
    if (leftNumber > rightNumber) {
      return 1;
    }
    return 0;
  }

  function formatValue(value) {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return String(value);
  }

  const api = {
    ROWS,
    COLS,
    cellKey,
    createSpreadsheetState,
    commitCell,
    moveSelection,
    serializeState,
    deserializeState,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.SpreadsheetCore = api;
  }
})();
