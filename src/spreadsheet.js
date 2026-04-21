(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERROR = {
    CIRC: '#CIRC!',
    DIV0: '#DIV/0!',
    ERR: '#ERR!',
    REF: '#REF!',
  };

  function makeCellKey(rowIndex, columnIndex) {
    return columnIndexToName(columnIndex) + String(rowIndex + 1);
  }

  function columnIndexToName(index) {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function columnNameToIndex(name) {
    let total = 0;
    for (let index = 0; index < name.length; index += 1) {
      total = total * 26 + (name.charCodeAt(index) - 64);
    }
    return total - 1;
  }

  function parseCellReference(reference) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(reference);
    if (!match) {
      return null;
    }
    return {
      absoluteColumn: Boolean(match[1]),
      columnName: match[2],
      absoluteRow: Boolean(match[3]),
      rowNumber: Number(match[4]),
      key: match[2] + match[4],
      columnIndex: columnNameToIndex(match[2]),
      rowIndex: Number(match[4]) - 1,
    };
  }

  function tokenize(expression) {
    const tokens = [];
    let index = 0;

    while (index < expression.length) {
      const char = expression[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (char === '"') {
        let cursor = index + 1;
        let value = '';
        while (cursor < expression.length && expression[cursor] !== '"') {
          value += expression[cursor];
          cursor += 1;
        }
        if (cursor >= expression.length) {
          throw new Error(ERROR.ERR);
        }
        tokens.push({ type: 'string', value: value });
        index = cursor + 1;
        continue;
      }

      if (/\d/.test(char) || (char === '.' && /\d/.test(expression[index + 1] || ''))) {
        const match = /^\d*\.?\d+/.exec(expression.slice(index));
        tokens.push({ type: 'number', value: Number(match[0]) });
        index += match[0].length;
        continue;
      }

      const twoCharOperator = expression.slice(index, index + 2);
      if (twoCharOperator === '<=' || twoCharOperator === '>=' || twoCharOperator === '<>') {
        tokens.push({ type: 'operator', value: twoCharOperator });
        index += 2;
        continue;
      }

      if ('+-*/&=<>():,'.includes(char)) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      const identifierMatch = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(expression.slice(index));
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0].toUpperCase() });
        index += identifierMatch[0].length;
        continue;
      }

      throw new Error(ERROR.ERR);
    }

    return tokens;
  }

  function parseFormula(expression) {
    const tokens = tokenize(expression);
    let index = 0;

    function peek() {
      return tokens[index] || null;
    }

    function take(expectedValue) {
      const token = peek();
      if (!token || token.value !== expectedValue) {
        throw new Error(ERROR.ERR);
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcatenation();
      while (peek() && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = peek().value;
        index += 1;
        node = { type: 'binary', operator: operator, left: node, right: parseConcatenation() };
      }
      return node;
    }

    function parseConcatenation() {
      let node = parseAddition();
      while (peek() && peek().value === '&') {
        index += 1;
        node = { type: 'binary', operator: '&', left: node, right: parseAddition() };
      }
      return node;
    }

    function parseAddition() {
      let node = parseMultiplication();
      while (peek() && (peek().value === '+' || peek().value === '-')) {
        const operator = peek().value;
        index += 1;
        node = { type: 'binary', operator: operator, left: node, right: parseMultiplication() };
      }
      return node;
    }

    function parseMultiplication() {
      let node = parseUnary();
      while (peek() && (peek().value === '*' || peek().value === '/')) {
        const operator = peek().value;
        index += 1;
        node = { type: 'binary', operator: operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (peek() && peek().value === '-') {
        index += 1;
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new Error(ERROR.ERR);
      }

      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: token.value };
      }

      if (token.type === 'string') {
        index += 1;
        return { type: 'string', value: token.value };
      }

      if (token.value === '(') {
        index += 1;
        const node = parseExpression();
        take(')');
        return node;
      }

      if (token.type === 'identifier') {
        index += 1;
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'boolean', value: token.value === 'TRUE' };
        }

        if (peek() && peek().value === '(') {
          index += 1;
          const args = [];
          if (!peek() || peek().value !== ')') {
            while (true) {
              args.push(parseExpression());
              if (peek() && peek().value === ',') {
                index += 1;
                continue;
              }
              break;
            }
          }
          take(')');
          return { type: 'function', name: token.value, args: args };
        }

        const reference = parseCellReference(token.value);
        if (reference) {
          if (peek() && peek().value === ':') {
            index += 1;
            const endToken = peek();
            if (!endToken || endToken.type !== 'identifier') {
              throw new Error(ERROR.ERR);
            }
            index += 1;
            const endReference = parseCellReference(endToken.value);
            if (!endReference) {
              throw new Error(ERROR.ERR);
            }
            return { type: 'range', start: reference, end: endReference };
          }
          return { type: 'cell', reference: reference };
        }

        throw new Error(ERROR.ERR);
      }

      throw new Error(ERROR.ERR);
    }

    const tree = parseExpression();
    if (index !== tokens.length) {
      throw new Error(ERROR.ERR);
    }
    return tree;
  }

  function createFormulaEngine() {
    function evaluateAll(rawCells) {
      const computed = new Map();
      const states = new Map();

      function evaluateCell(key) {
        if (computed.has(key)) {
          return computed.get(key);
        }

        if (states.get(key) === 'visiting') {
          return finalizeResult(key, makeError(ERROR.CIRC));
        }

        states.set(key, 'visiting');
        const raw = rawCells.has(key) ? rawCells.get(key) : '';
        let result;

        if (!raw) {
          result = makeBlank();
        } else if (raw[0] !== '=') {
          result = parseLiteral(raw);
        } else {
          try {
            const tree = parseFormula(raw.slice(1));
            result = evaluateNode(tree);
          } catch (error) {
            result = makeError(error && error.message ? error.message : ERROR.ERR);
          }
        }

        states.set(key, 'done');
        return finalizeResult(key, result, raw);
      }

      function finalizeResult(key, result, raw) {
        const snapshot = {
          raw: raw === undefined ? rawCells.get(key) || '' : raw,
          value: result.value,
          kind: result.kind,
          error: result.error || null,
          display: formatDisplay(result),
        };
        computed.set(key, snapshot);
        return snapshot;
      }

      function evaluateNode(node) {
        if (!node) {
          return makeError(ERROR.ERR);
        }

        if (node.type === 'number') {
          return makeNumber(node.value);
        }

        if (node.type === 'string') {
          return makeString(node.value);
        }

        if (node.type === 'boolean') {
          return makeBoolean(node.value);
        }

        if (node.type === 'cell') {
          const cell = evaluateCell(node.reference.key);
          if (cell.error) {
            return makeError(cell.error);
          }
          return makeRuntime(cell.kind, cell.value);
        }

        if (node.type === 'range') {
          return {
            kind: 'range',
            value: expandRange(node.start, node.end).map(function (key) {
              const cell = evaluateCell(key);
              if (cell.error) {
                return makeError(cell.error);
              }
              return makeRuntime(cell.kind, cell.value);
            }),
          };
        }

        if (node.type === 'unary') {
          const inner = evaluateNode(node.value);
          if (inner.error) {
            return inner;
          }
          return makeNumber(-coerceNumber(inner));
        }

        if (node.type === 'binary') {
          const left = evaluateNode(node.left);
          if (left.error) {
            return left;
          }
          const right = evaluateNode(node.right);
          if (right.error) {
            return right;
          }
          return applyBinary(node.operator, left, right);
        }

        if (node.type === 'function') {
          return evaluateFunction(node.name, node.args.map(evaluateNode));
        }

        return makeError(ERROR.ERR);
      }

      function applyBinary(operator, left, right) {
        if (operator === '+') {
          return makeNumber(coerceNumber(left) + coerceNumber(right));
        }
        if (operator === '-') {
          return makeNumber(coerceNumber(left) - coerceNumber(right));
        }
        if (operator === '*') {
          return makeNumber(coerceNumber(left) * coerceNumber(right));
        }
        if (operator === '/') {
          const divisor = coerceNumber(right);
          if (divisor === 0) {
            return makeError(ERROR.DIV0);
          }
          return makeNumber(coerceNumber(left) / divisor);
        }
        if (operator === '&') {
          return makeString(coerceString(left) + coerceString(right));
        }
        return makeBoolean(compareValues(operator, left, right));
      }

      function evaluateFunction(name, args) {
        const flattened = flattenArgs(args);
        if (name === 'SUM') {
          return makeNumber(flattened.reduce(function (sum, value) {
            return sum + coerceNumber(value);
          }, 0));
        }
        if (name === 'AVERAGE') {
          return makeNumber(flattened.length ? flattened.reduce(function (sum, value) {
            return sum + coerceNumber(value);
          }, 0) / flattened.length : 0);
        }
        if (name === 'MIN') {
          return makeNumber(flattened.length ? Math.min.apply(null, flattened.map(coerceNumber)) : 0);
        }
        if (name === 'MAX') {
          return makeNumber(flattened.length ? Math.max.apply(null, flattened.map(coerceNumber)) : 0);
        }
        if (name === 'COUNT') {
          return makeNumber(flattened.filter(function (value) {
            return value.kind === 'number';
          }).length);
        }
        if (name === 'IF') {
          return args[0] && coerceBoolean(args[0]) ? (args[1] || makeBlank()) : (args[2] || makeBlank());
        }
        if (name === 'AND') {
          return makeBoolean(flattened.every(coerceBoolean));
        }
        if (name === 'OR') {
          return makeBoolean(flattened.some(coerceBoolean));
        }
        if (name === 'NOT') {
          return makeBoolean(!coerceBoolean(args[0] || makeBlank()));
        }
        if (name === 'ABS') {
          return makeNumber(Math.abs(coerceNumber(args[0] || makeBlank())));
        }
        if (name === 'ROUND') {
          const value = coerceNumber(args[0] || makeBlank());
          const digits = Math.max(0, Math.trunc(coerceNumber(args[1] || makeNumber(0))));
          const factor = Math.pow(10, digits);
          return makeNumber(Math.round(value * factor) / factor);
        }
        if (name === 'CONCAT') {
          return makeString(flattened.map(coerceString).join(''));
        }
        return makeError(ERROR.ERR);
      }

      function flattenArgs(args) {
        return args.flatMap(function (arg) {
          if (arg.error) {
            return [arg];
          }
          return arg.kind === 'range' ? arg.value : [arg];
        });
      }

      rawCells.forEach(function (_, key) {
        evaluateCell(key);
      });

      return computed;
    }

    return {
      evaluateAll: evaluateAll,
    };
  }

  function makeNumber(value) {
    return { kind: 'number', value: Number(value) };
  }

  function makeString(value) {
    return { kind: 'string', value: value == null ? '' : String(value) };
  }

  function makeBoolean(value) {
    return { kind: 'boolean', value: Boolean(value) };
  }

  function makeBlank() {
    return { kind: 'blank', value: '' };
  }

  function makeError(error) {
    return { kind: 'error', value: null, error: error || ERROR.ERR };
  }

  function makeRuntime(kind, value) {
    return { kind: kind || 'blank', value: value == null ? '' : value };
  }

  function parseLiteral(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return makeBlank();
    }
    if (/^[+-]?\d*\.?\d+$/.test(trimmed)) {
      return makeNumber(Number(trimmed));
    }
    if (trimmed.toUpperCase() === 'TRUE') {
      return makeBoolean(true);
    }
    if (trimmed.toUpperCase() === 'FALSE') {
      return makeBoolean(false);
    }
    return makeString(raw);
  }

  function formatDisplay(result) {
    if (result.error) {
      return result.error;
    }
    if (result.kind === 'blank') {
      return '';
    }
    if (result.kind === 'boolean') {
      return result.value ? 'TRUE' : 'FALSE';
    }
    if (result.kind === 'number') {
      return Number.isInteger(result.value) ? String(result.value) : String(Number(result.value.toFixed(10)));
    }
    return String(result.value);
  }

  function coerceNumber(value) {
    if (value.error) {
      throw new Error(value.error);
    }
    if (value.kind === 'blank') {
      return 0;
    }
    if (value.kind === 'boolean') {
      return value.value ? 1 : 0;
    }
    if (value.kind === 'number') {
      return value.value;
    }
    const parsed = Number(value.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function coerceString(value) {
    if (value.error) {
      throw new Error(value.error);
    }
    if (value.kind === 'blank') {
      return '';
    }
    if (value.kind === 'boolean') {
      return value.value ? 'TRUE' : 'FALSE';
    }
    return String(value.value);
  }

  function coerceBoolean(value) {
    if (value.error) {
      throw new Error(value.error);
    }
    if (value.kind === 'boolean') {
      return value.value;
    }
    if (value.kind === 'blank') {
      return false;
    }
    if (value.kind === 'number') {
      return value.value !== 0;
    }
    return value.value !== '';
  }

  function compareValues(operator, left, right) {
    const leftValue = left.kind === 'string' || right.kind === 'string' ? coerceString(left) : coerceNumber(left);
    const rightValue = left.kind === 'string' || right.kind === 'string' ? coerceString(right) : coerceNumber(right);
    if (operator === '=') {
      return leftValue === rightValue;
    }
    if (operator === '<>') {
      return leftValue !== rightValue;
    }
    if (operator === '<') {
      return leftValue < rightValue;
    }
    if (operator === '<=') {
      return leftValue <= rightValue;
    }
    if (operator === '>') {
      return leftValue > rightValue;
    }
    return leftValue >= rightValue;
  }

  function expandRange(start, end) {
    const rowStart = Math.min(start.rowIndex, end.rowIndex);
    const rowEnd = Math.max(start.rowIndex, end.rowIndex);
    const columnStart = Math.min(start.columnIndex, end.columnIndex);
    const columnEnd = Math.max(start.columnIndex, end.columnIndex);
    const keys = [];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let column = columnStart; column <= columnEnd; column += 1) {
        keys.push(makeCellKey(row, column));
      }
    }
    return keys;
  }

  function createSpreadsheetModel(options) {
    const columns = options.columns || 26;
    const rows = options.rows || 100;
    const storage = options.storage || null;
    const storageKey = options.storageKey || 'spreadsheet';
    const engine = createFormulaEngine();
    const listeners = new Set();
    const state = loadState(storage, storageKey, columns, rows);

    function notify() {
      persistState(storage, storageKey, state);
      listeners.forEach(function (listener) {
        listener(getState());
      });
    }

    function recalculate() {
      state.snapshot = engine.evaluateAll(state.rawCells);
    }

    function getCell(key) {
      if (state.snapshot.has(key)) {
        return state.snapshot.get(key);
      }
      return { raw: '', value: '', kind: 'blank', error: null, display: '' };
    }

    function selectCell(key) {
      if (!isCellWithinBounds(key, rows, columns)) {
        return;
      }
      state.selection.activeCell = key;
      notify();
    }

    function commitCell(key, raw, options) {
      const value = raw == null ? '' : String(raw);
      if (value) {
        state.rawCells.set(key, value);
      } else {
        state.rawCells.delete(key);
      }
      recalculate();
      if (options && options.move) {
        state.selection.activeCell = moveCell(key, options.move, rows, columns);
      } else {
        state.selection.activeCell = key;
      }
      notify();
    }

    function clearCell(key) {
      state.rawCells.delete(key);
      recalculate();
      notify();
    }

    function moveSelection(direction) {
      state.selection.activeCell = moveCell(state.selection.activeCell, direction, rows, columns);
      notify();
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function () {
        listeners.delete(listener);
      };
    }

    function getSelection() {
      return { activeCell: state.selection.activeCell };
    }

    function getState() {
      return {
        rows: rows,
        columns: columns,
        rawCells: new Map(state.rawCells),
        selection: getSelection(),
        snapshot: state.snapshot,
      };
    }

    recalculate();

    return {
      clearCell: clearCell,
      commitCell: commitCell,
      getCell: getCell,
      getSelection: getSelection,
      getState: getState,
      moveSelection: moveSelection,
      selectCell: selectCell,
      subscribe: subscribe,
    };
  }

  function loadState(storage, storageKey, rows, columns) {
    const fallback = {
      rawCells: new Map(),
      selection: { activeCell: 'A1' },
      snapshot: new Map(),
    };
    if (!storage) {
      return fallback;
    }
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw);
      const rawCells = new Map(Object.entries(parsed.cells || {}));
      const activeCell = isCellWithinBounds(parsed.selection && parsed.selection.activeCell, rows, columns)
        ? parsed.selection.activeCell
        : 'A1';
      return {
        rawCells: rawCells,
        selection: { activeCell: activeCell },
        snapshot: new Map(),
      };
    } catch (_error) {
      return fallback;
    }
  }

  function persistState(storage, storageKey, state) {
    if (!storage) {
      return;
    }
    storage.setItem(storageKey, JSON.stringify({
      cells: Object.fromEntries(state.rawCells),
      selection: state.selection,
    }));
  }

  function moveCell(key, direction, rows, columns) {
    const reference = parseCellReference(key);
    if (!reference) {
      return 'A1';
    }
    let row = reference.rowIndex;
    let column = reference.columnIndex;
    if (direction === 'up') {
      row = Math.max(0, row - 1);
    }
    if (direction === 'down') {
      row = Math.min(rows - 1, row + 1);
    }
    if (direction === 'left') {
      column = Math.max(0, column - 1);
    }
    if (direction === 'right') {
      column = Math.min(columns - 1, column + 1);
    }
    return makeCellKey(row, column);
  }

  function isCellWithinBounds(key, rows, columns) {
    const reference = parseCellReference(key || '');
    return Boolean(reference)
      && reference.rowIndex >= 0
      && reference.rowIndex < rows
      && reference.columnIndex >= 0
      && reference.columnIndex < columns;
  }

  return {
    createFormulaEngine: createFormulaEngine,
    createSpreadsheetModel: createSpreadsheetModel,
    makeCellKey: makeCellKey,
    parseCellReference: parseCellReference,
  };
});
