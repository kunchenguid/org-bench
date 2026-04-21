(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CIRCULAR_ERROR = '#CIRC!';
  const GENERIC_ERROR = '#ERR!';
  const DIV_ZERO_ERROR = '#DIV/0!';
  const REF_ERROR = '#REF!';

  function createSpreadsheet(options) {
    const rows = options && options.rows ? options.rows : 100;
    const cols = options && options.cols ? options.cols : 26;
    const storage = options && options.storage ? options.storage : null;
    const storageKeyPrefix = options && options.storageKeyPrefix ? options.storageKeyPrefix : 'spreadsheet:';
    const cellsKey = storageKeyPrefix + 'cells';
    const selectionKey = storageKeyPrefix + 'selection';
    const listeners = [];
    const state = {
      rows,
      cols,
      cells: loadCells(storage, cellsKey),
      selectedCell: loadSelection(storage, selectionKey) || 'A1',
    };

    function notify() {
      listeners.forEach(function (listener) {
        listener();
      });
    }

    function persist() {
      if (!storage) {
        return;
      }
      storage.setItem(cellsKey, JSON.stringify(state.cells));
      storage.setItem(selectionKey, state.selectedCell);
    }

    function getCellRaw(cellId) {
      return Object.prototype.hasOwnProperty.call(state.cells, cellId) ? state.cells[cellId] : '';
    }

    function setCellRaw(cellId, raw) {
      const text = raw == null ? '' : String(raw);
      if (text === '') {
        delete state.cells[cellId];
      } else {
        state.cells[cellId] = text;
      }
      persist();
      notify();
    }

    function getCellResult(cellId) {
      return evaluateCell(cellId, state, []);
    }

    function getCellDisplay(cellId) {
      return renderValue(getCellResult(cellId));
    }

    function selectCell(cellId) {
      if (!isInBounds(cellId, state.rows, state.cols)) {
        return;
      }
      state.selectedCell = cellId;
      persist();
      notify();
    }

    function getSelectedCell() {
      return state.selectedCell;
    }

    function getFormulaBarText() {
      return getCellRaw(state.selectedCell);
    }

    function moveSelection(rowDelta, colDelta) {
      const position = cellIdToPosition(state.selectedCell);
      const nextRow = clamp(position.row + rowDelta, 1, state.rows);
      const nextCol = clamp(position.col + colDelta, 1, state.cols);
      selectCell(positionToCellId(nextRow, nextCol));
    }

    function subscribe(listener) {
      listeners.push(listener);
      return function () {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    }

    function getState() {
      return {
        rows: state.rows,
        cols: state.cols,
        cells: Object.assign({}, state.cells),
        selectedCell: state.selectedCell,
      };
    }

    return {
      getCellRaw,
      setCellRaw,
      getCellResult,
      getCellDisplay,
      selectCell,
      getSelectedCell,
      getFormulaBarText,
      moveSelection,
      subscribe,
      getState,
    };
  }

  function loadCells(storage, key) {
    if (!storage) {
      return {};
    }
    try {
      const raw = storage.getItem(key);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function loadSelection(storage, key) {
    if (!storage) {
      return null;
    }
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function evaluateCell(cellId, state, stack) {
    if (!isInBounds(cellId, state.rows, state.cols)) {
      return errorValue(REF_ERROR);
    }
    if (stack.indexOf(cellId) >= 0) {
      return errorValue(CIRCULAR_ERROR);
    }

    const raw = Object.prototype.hasOwnProperty.call(state.cells, cellId) ? state.cells[cellId] : '';
    if (raw === '') {
      return null;
    }
    if (raw.charAt(0) !== '=') {
      const numeric = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(numeric)) {
        return numeric;
      }
      return raw;
    }

    try {
      const parser = createParser(raw.slice(1));
      const expression = parser.parseExpression();
      parser.expectEnd();
      return evaluateNode(expression, state, stack.concat(cellId));
    } catch (error) {
      if (error && error.isSheetError) {
        return error;
      }
      return errorValue(GENERIC_ERROR);
    }
  }

  function evaluateNode(node, state, stack) {
    if (!node) {
      return null;
    }
    if (node.type === 'number') {
      return node.value;
    }
    if (node.type === 'string') {
      return node.value;
    }
    if (node.type === 'boolean') {
      return node.value;
    }
    if (node.type === 'unary') {
      const value = evaluateNode(node.argument, state, stack);
      if (isErrorValue(value)) {
        return value;
      }
      if (node.operator === '-') {
        return -coerceNumber(value);
      }
    }
    if (node.type === 'binary') {
      const left = evaluateNode(node.left, state, stack);
      if (isErrorValue(left)) {
        return left;
      }
      const right = evaluateNode(node.right, state, stack);
      if (isErrorValue(right)) {
        return right;
      }
      if (node.operator === '+') {
        return coerceNumber(left) + coerceNumber(right);
      }
      if (node.operator === '-') {
        return coerceNumber(left) - coerceNumber(right);
      }
      if (node.operator === '*') {
        return coerceNumber(left) * coerceNumber(right);
      }
      if (node.operator === '/') {
        if (coerceNumber(right) === 0) {
          return errorValue(DIV_ZERO_ERROR);
        }
        return coerceNumber(left) / coerceNumber(right);
      }
      if (node.operator === '&') {
        return coerceText(left) + coerceText(right);
      }
      if (node.operator === '=') {
        return compareValues(left, right) === 0;
      }
      if (node.operator === '<>') {
        return compareValues(left, right) !== 0;
      }
      if (node.operator === '<') {
        return compareValues(left, right) < 0;
      }
      if (node.operator === '<=') {
        return compareValues(left, right) <= 0;
      }
      if (node.operator === '>') {
        return compareValues(left, right) > 0;
      }
      if (node.operator === '>=') {
        return compareValues(left, right) >= 0;
      }
    }
    if (node.type === 'cell') {
      return evaluateCell(node.cellId, state, stack);
    }
    if (node.type === 'range') {
      return expandRange(node.start.cellId, node.end.cellId, state, stack);
    }
    if (node.type === 'call') {
      const args = [];
      for (let index = 0; index < node.arguments.length; index += 1) {
        const value = evaluateNode(node.arguments[index], state, stack);
        if (isErrorValue(value)) {
          return value;
        }
        args.push(value);
      }
      return evaluateFunction(node.name, args);
    }
    return errorValue(GENERIC_ERROR);
  }

  function evaluateFunction(name, args) {
    const flatArgs = flattenArgs(args);
    if (name === 'SUM') {
      return flatArgs.reduce(function (sum, value) {
        return sum + coerceNumber(value);
      }, 0);
    }
    if (name === 'AVERAGE') {
      return flatArgs.length ? evaluateFunction('SUM', flatArgs) / flatArgs.length : 0;
    }
    if (name === 'MIN') {
      return flatArgs.length ? Math.min.apply(Math, flatArgs.map(coerceNumber)) : 0;
    }
    if (name === 'MAX') {
      return flatArgs.length ? Math.max.apply(Math, flatArgs.map(coerceNumber)) : 0;
    }
    if (name === 'COUNT') {
      return flatArgs.filter(function (value) {
        return value !== null && value !== '';
      }).length;
    }
    if (name === 'IF') {
      return coerceBoolean(args[0]) ? args[1] : args[2];
    }
    if (name === 'AND') {
      return flatArgs.every(coerceBoolean);
    }
    if (name === 'OR') {
      return flatArgs.some(coerceBoolean);
    }
    if (name === 'NOT') {
      return !coerceBoolean(args[0]);
    }
    if (name === 'ABS') {
      return Math.abs(coerceNumber(args[0]));
    }
    if (name === 'ROUND') {
      const digits = args.length > 1 ? coerceNumber(args[1]) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(coerceNumber(args[0]) * factor) / factor;
    }
    if (name === 'CONCAT') {
      return flatArgs.map(coerceText).join('');
    }
    return errorValue(GENERIC_ERROR);
  }

  function flattenArgs(args) {
    const result = [];
    args.forEach(function (value) {
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          result.push(item);
        });
      } else {
        result.push(value);
      }
    });
    return result;
  }

  function expandRange(startId, endId, state, stack) {
    const start = cellIdToPosition(startId);
    const end = cellIdToPosition(endId);
    const rowStart = Math.min(start.row, end.row);
    const rowEnd = Math.max(start.row, end.row);
    const colStart = Math.min(start.col, end.col);
    const colEnd = Math.max(start.col, end.col);
    const values = [];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        values.push(evaluateCell(positionToCellId(row, col), state, stack));
      }
    }
    return values;
  }

  function compareValues(left, right) {
    if ((typeof left === 'number' || left === null) && (typeof right === 'number' || right === null)) {
      return coerceNumber(left) - coerceNumber(right);
    }
    const leftText = coerceText(left);
    const rightText = coerceText(right);
    if (leftText === rightText) {
      return 0;
    }
    return leftText < rightText ? -1 : 1;
  }

  function coerceNumber(value) {
    if (value == null || value === '') {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    throw errorValue(GENERIC_ERROR);
  }

  function coerceText(value) {
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function coerceBoolean(value) {
    if (value == null || value === '') {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return String(value).toUpperCase() === 'TRUE';
  }

  function renderValue(value) {
    if (isErrorValue(value)) {
      return value.message;
    }
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const rounded = Math.round(value * 1000000000) / 1000000000;
      return String(rounded);
    }
    return String(value);
  }

  function errorValue(message) {
    return { isSheetError: true, message: message };
  }

  function isErrorValue(value) {
    return Boolean(value && value.isSheetError);
  }

  function createParser(input) {
    let index = 0;

    function skipWhitespace() {
      while (index < input.length && /\s/.test(input.charAt(index))) {
        index += 1;
      }
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcat();
      while (true) {
        skipWhitespace();
        const operator = matchOperator(['<>', '<=', '>=', '=', '<', '>']);
        if (!operator) {
          return node;
        }
        node = { type: 'binary', operator: operator, left: node, right: parseConcat() };
      }
    }

    function parseConcat() {
      let node = parseAdditive();
      while (true) {
        skipWhitespace();
        if (input.charAt(index) !== '&') {
          return node;
        }
        index += 1;
        node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
      }
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (true) {
        skipWhitespace();
        const operator = input.charAt(index);
        if (operator !== '+' && operator !== '-') {
          return node;
        }
        index += 1;
        node = { type: 'binary', operator: operator, left: node, right: parseMultiplicative() };
      }
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (true) {
        skipWhitespace();
        const operator = input.charAt(index);
        if (operator !== '*' && operator !== '/') {
          return node;
        }
        index += 1;
        node = { type: 'binary', operator: operator, left: node, right: parseUnary() };
      }
    }

    function parseUnary() {
      skipWhitespace();
      if (input.charAt(index) === '-') {
        index += 1;
        return { type: 'unary', operator: '-', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      skipWhitespace();
      const char = input.charAt(index);
      if (char === '(') {
        index += 1;
        const node = parseExpression();
        skipWhitespace();
        expect(')');
        return node;
      }
      if (char === '"') {
        return parseString();
      }
      if (/\d/.test(char)) {
        return parseNumber();
      }
      if (char === '$' || /[A-Za-z]/.test(char)) {
        return parseIdentifierLike();
      }
      throw errorValue(GENERIC_ERROR);
    }

    function parseString() {
      index += 1;
      let value = '';
      while (index < input.length && input.charAt(index) !== '"') {
        value += input.charAt(index);
        index += 1;
      }
      expect('"');
      return { type: 'string', value: value };
    }

    function parseNumber() {
      const start = index;
      while (index < input.length && /[\d.]/.test(input.charAt(index))) {
        index += 1;
      }
      return { type: 'number', value: Number(input.slice(start, index)) };
    }

    function parseIdentifierLike() {
      const start = index;
      while (index < input.length && /[A-Za-z0-9_$]/.test(input.charAt(index))) {
        index += 1;
      }
      const token = input.slice(start, index);
      const upper = token.toUpperCase();
      skipWhitespace();
      if (input.charAt(index) === '(') {
        index += 1;
        const args = [];
        skipWhitespace();
        if (input.charAt(index) !== ')') {
          while (true) {
            args.push(parseExpression());
            skipWhitespace();
            if (input.charAt(index) !== ',') {
              break;
            }
            index += 1;
          }
        }
        expect(')');
        return { type: 'call', name: upper, arguments: args };
      }
      if (upper === 'TRUE' || upper === 'FALSE') {
        return { type: 'boolean', value: upper === 'TRUE' };
      }
      if (isCellToken(token)) {
        const cellNode = { type: 'cell', cellId: normalizeCellToken(token) };
        skipWhitespace();
        if (input.charAt(index) === ':') {
          index += 1;
          skipWhitespace();
          const endTokenStart = index;
          while (index < input.length && /[A-Za-z0-9_$]/.test(input.charAt(index))) {
            index += 1;
          }
          const endToken = input.slice(endTokenStart, index);
          if (!isCellToken(endToken)) {
            throw errorValue(REF_ERROR);
          }
          return { type: 'range', start: cellNode, end: { type: 'cell', cellId: normalizeCellToken(endToken) } };
        }
        return cellNode;
      }
      throw errorValue(GENERIC_ERROR);
    }

    function matchOperator(operators) {
      for (let idx = 0; idx < operators.length; idx += 1) {
        const operator = operators[idx];
        if (input.slice(index, index + operator.length) === operator) {
          index += operator.length;
          return operator;
        }
      }
      return null;
    }

    function expect(character) {
      skipWhitespace();
      if (input.charAt(index) !== character) {
        throw errorValue(GENERIC_ERROR);
      }
      index += 1;
    }

    function expectEnd() {
      skipWhitespace();
      if (index !== input.length) {
        throw errorValue(GENERIC_ERROR);
      }
    }

    return {
      parseExpression: parseExpression,
      expectEnd: expectEnd,
    };
  }

  function isCellToken(token) {
    return /^\$?[A-Za-z]+\$?\d+$/.test(token);
  }

  function normalizeCellToken(token) {
    return token.replace(/\$/g, '').toUpperCase();
  }

  function cellIdToPosition(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    return {
      row: Number(match[2]),
      col: lettersToNumber(match[1]),
    };
  }

  function positionToCellId(row, col) {
    return numberToLetters(col) + String(row);
  }

  function lettersToNumber(letters) {
    let total = 0;
    for (let index = 0; index < letters.length; index += 1) {
      total = total * 26 + (letters.charCodeAt(index) - 64);
    }
    return total;
  }

  function numberToLetters(value) {
    let result = '';
    let current = value;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      current = Math.floor((current - 1) / 26);
    }
    return result;
  }

  function isInBounds(cellId, rows, cols) {
    const position = cellIdToPosition(cellId);
    return position.row >= 1 && position.row <= rows && position.col >= 1 && position.col <= cols;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  return {
    createSpreadsheet: createSpreadsheet,
    numberToLetters: numberToLetters,
    cellIdToPosition: cellIdToPosition,
    positionToCellId: positionToCellId,
  };
});
