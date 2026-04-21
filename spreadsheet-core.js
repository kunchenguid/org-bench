(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COL_COUNT = 26;
  const ROW_COUNT = 100;

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createState(savedState) {
    if (savedState && typeof savedState === 'object') {
      return {
        cells: savedState.cells && typeof savedState.cells === 'object' ? { ...savedState.cells } : {},
        active: normalizeSelection(savedState.active),
      };
    }

    return {
      cells: {},
      active: { row: 0, col: 0 },
    };
  }

  function normalizeSelection(active) {
    return {
      row: clamp(active && Number.isInteger(active.row) ? active.row : 0, 0, ROW_COUNT - 1),
      col: clamp(active && Number.isInteger(active.col) ? active.col : 0, 0, COL_COUNT - 1),
    };
  }

  function cellKey(row, col) {
    return columnLabel(col) + String(row + 1);
  }

  function parseCellKey(key) {
    const match = /^([A-Z])(\d+)$/.exec(key);

    if (!match) {
      return null;
    }

    return {
      row: Number(match[2]) - 1,
      col: match[1].charCodeAt(0) - 65,
    };
  }

  function moveSelection(state, delta) {
    return {
      cells: state.cells,
      active: normalizeSelection({
        row: state.active.row + (delta.row || 0),
        col: state.active.col + (delta.col || 0),
      }),
    };
  }

  function setActiveCell(state, row, col) {
    return {
      cells: state.cells,
      active: normalizeSelection({ row, col }),
    };
  }

  function setCellRaw(state, row, col, raw) {
    const key = cellKey(row, col);
    const nextCells = { ...state.cells };

    if (raw === '') {
      delete nextCells[key];
    } else {
      nextCells[key] = String(raw);
    }

    return {
      cells: nextCells,
      active: state.active,
    };
  }

  function getCellRaw(state, row, col) {
    return state.cells[cellKey(row, col)] || '';
  }

  function isNumeric(raw) {
    return /^[-+]?\d+(?:\.\d+)?$/.test(String(raw).trim());
  }

  function getLiteralValue(raw) {
    if (raw === '') {
      return '';
    }

    const trimmed = String(raw).trim();
    if (isNumeric(trimmed)) {
      return String(Number(trimmed));
    }

    return raw;
  }

  function tokenizeFormula(source) {
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      const char = source[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        let end = index + 1;
        while (end < source.length && /[0-9.]/.test(source[end])) {
          end += 1;
        }
        tokens.push({ type: 'number', value: source.slice(index, end) });
        index = end;
        continue;
      }

      if (/[A-Za-z]/.test(char)) {
        let end = index + 1;
        while (end < source.length && /[A-Za-z0-9]/.test(source[end])) {
          end += 1;
        }
        tokens.push({ type: 'word', value: source.slice(index, end).toUpperCase() });
        index = end;
        continue;
      }

      if (char === '<' || char === '>') {
        if (source[index + 1] === '=' || (char === '<' && source[index + 1] === '>')) {
          tokens.push({ type: 'operator', value: source.slice(index, index + 2) });
          index += 2;
        } else {
          tokens.push({ type: 'operator', value: char });
          index += 1;
        }
        continue;
      }

      if (char === '=') {
        tokens.push({ type: 'operator', value: '=' });
        index += 1;
        continue;
      }

      if (char === '&') {
        tokens.push({ type: 'operator', value: '&' });
        index += 1;
        continue;
      }

      if (char === '"') {
        let end = index + 1;
        while (end < source.length && source[end] !== '"') {
          end += 1;
        }
        if (end >= source.length) {
          throw new Error('Unterminated string');
        }
        tokens.push({ type: 'string', value: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }

      if ('+-*/(),:'.includes(char)) {
        tokens.push({ type: char, value: char });
        index += 1;
        continue;
      }

      throw new Error('Unexpected token');
    }

    return tokens;
  }

  function parseFormula(source) {
    const tokens = tokenizeFormula(source);
    let index = 0;

    function peek(type) {
      const token = tokens[index];
      return token && token.type === type;
    }

    function consume(type) {
      if (!peek(type)) {
        throw new Error('Unexpected token');
      }
      const token = tokens[index];
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcatenation();

      while (peek('operator') && ['=', '<>', '<', '<=', '>', '>='].indexOf(tokens[index].value) !== -1) {
        const operator = consume('operator').value;
        node = { type: 'binary', operator, left: node, right: parseConcatenation() };
      }

      return node;
    }

    function parseConcatenation() {
      let node = parseAdditive();

      while (peek('operator') && tokens[index].value === '&') {
        consume('operator');
        node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
      }

      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();

      while (peek('+') || peek('-')) {
        const operator = consume(tokens[index].type).type;
        node = { type: 'binary', operator, left: node, right: parseMultiplicative() };
      }

      return node;
    }

    function parseMultiplicative() {
      let node = parseUnary();

      while (peek('*') || peek('/')) {
        const operator = consume(tokens[index].type).type;
        node = { type: 'binary', operator, left: node, right: parseUnary() };
      }

      return node;
    }

    function parseUnary() {
      if (peek('-')) {
        consume('-');
        return { type: 'unary', operator: '-', value: parseUnary() };
      }

      return parsePrimary();
    }

    function parsePrimary() {
      if (peek('number')) {
        return { type: 'number', value: Number(consume('number').value) };
      }

      if (peek('string')) {
        return { type: 'string', value: consume('string').value };
      }

      if (peek('word')) {
        const word = consume('word').value;

        if (peek('(')) {
          consume('(');
          const args = [];
          if (!peek(')')) {
            while (true) {
              args.push(parseExpression());
              if (peek(',')) {
                consume(',');
                continue;
              }
              break;
            }
          }
          consume(')');
          return { type: 'call', name: word, args };
        }

        const cell = parseCellKey(word);
        if (!cell && (word === 'TRUE' || word === 'FALSE')) {
          return { type: 'boolean', value: word === 'TRUE' };
        }

        if (!cell) {
          throw new Error('Unknown identifier');
        }

        let node = { type: 'cell', key: word, row: cell.row, col: cell.col };
        if (peek(':')) {
          consume(':');
          const endWord = consume('word').value;
          const endCell = parseCellKey(endWord);
          if (!endCell) {
            throw new Error('Invalid range');
          }
          node = {
            type: 'range',
            start: { key: word, row: cell.row, col: cell.col },
            end: { key: endWord, row: endCell.row, col: endCell.col },
          };
        }
        return node;
      }

      if (peek('(')) {
        consume('(');
        const node = parseExpression();
        consume(')');
        return node;
      }

      throw new Error('Unexpected token');
    }

    const ast = parseExpression();
    if (index !== tokens.length) {
      throw new Error('Unexpected token');
    }
    return ast;
  }

  function evaluateFormula(state, expression, trail, cache) {
    const ast = parseFormula(expression);
    return evaluateNode(state, ast, trail, cache);
  }

  function evaluateNode(state, node, trail, cache) {
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
      const value = toNumber(evaluateNode(state, node.value, trail, cache));
      return typeof value === 'number' ? -value : value;
    }

    if (node.type === 'binary') {
      const leftValue = evaluateNode(state, node.left, trail, cache);
      const rightValue = evaluateNode(state, node.right, trail, cache);
      const left = toNumber(leftValue);
      const right = toNumber(rightValue);

      if (left === '#CIRC!' || right === '#CIRC!') {
        return '#CIRC!';
      }
      if (left === '#ERR!' || right === '#ERR!') {
        return '#ERR!';
      }
      if (left === '#DIV/0!' || right === '#DIV/0!') {
        return '#DIV/0!';
      }

      if (node.operator === '+') {
        return left + right;
      }
      if (node.operator === '-') {
        return left - right;
      }
      if (node.operator === '*') {
        return left * right;
      }
      if (node.operator === '/') {
        return right === 0 ? '#DIV/0!' : left / right;
      }
      if (node.operator === '&') {
        return toText(leftValue) + toText(rightValue);
      }
      if (node.operator === '=') {
        return compareValues(leftValue, rightValue) === 0;
      }
      if (node.operator === '<>') {
        return compareValues(leftValue, rightValue) !== 0;
      }
      if (node.operator === '<') {
        return compareValues(leftValue, rightValue) < 0;
      }
      if (node.operator === '<=') {
        return compareValues(leftValue, rightValue) <= 0;
      }
      if (node.operator === '>') {
        return compareValues(leftValue, rightValue) > 0;
      }
      if (node.operator === '>=') {
        return compareValues(leftValue, rightValue) >= 0;
      }
    }

    if (node.type === 'cell') {
      return evaluateCellByKey(state, node.key, trail, cache);
    }

    if (node.type === 'range') {
      return expandRange(node).map(function (key) {
        return evaluateCellByKey(state, key, trail, cache);
      });
    }

    if (node.type === 'call') {
      return evaluateCall(state, node, trail, cache);
    }

    throw new Error('Unknown node');
  }

  function expandRange(rangeNode) {
    const startRow = Math.min(rangeNode.start.row, rangeNode.end.row);
    const endRow = Math.max(rangeNode.start.row, rangeNode.end.row);
    const startCol = Math.min(rangeNode.start.col, rangeNode.end.col);
    const endCol = Math.max(rangeNode.start.col, rangeNode.end.col);
    const keys = [];

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        keys.push(cellKey(row, col));
      }
    }

    return keys;
  }

  function flattenValues(values) {
    return values.reduce(function (items, value) {
      if (Array.isArray(value)) {
        return items.concat(flattenValues(value));
      }
      items.push(value);
      return items;
    }, []);
  }

  function evaluateCall(state, node, trail, cache) {
    const args = flattenValues(node.args.map(function (arg) {
      return evaluateNode(state, arg, trail, cache);
    }));

    if (args.some(function (value) { return value === '#CIRC!'; })) {
      return '#CIRC!';
    }
    if (args.some(function (value) { return value === '#DIV/0!'; })) {
      return '#DIV/0!';
    }
    if (args.some(function (value) { return value === '#ERR!'; })) {
      return '#ERR!';
    }

    const numbers = args.map(toNumber);
    if (numbers.some(function (value) {
      return value === '#ERR!' || value === '#DIV/0!' || value === '#CIRC!';
    })) {
      return numbers.find(function (value) {
        return value === '#ERR!' || value === '#DIV/0!' || value === '#CIRC!';
      });
    }

    if (node.name === 'SUM') {
      return numbers.reduce(function (sum, value) { return sum + value; }, 0);
    }
    if (node.name === 'AVERAGE') {
      return numbers.length ? numbers.reduce(function (sum, value) { return sum + value; }, 0) / numbers.length : 0;
    }
    if (node.name === 'MIN') {
      return numbers.length ? Math.min.apply(Math, numbers) : 0;
    }
    if (node.name === 'MAX') {
      return numbers.length ? Math.max.apply(Math, numbers) : 0;
    }
    if (node.name === 'COUNT') {
      return numbers.filter(function (value) { return typeof value === 'number' && !Number.isNaN(value); }).length;
    }
    if (node.name === 'IF') {
      return isTruthy(args[0]) ? args[1] : args[2];
    }
    if (node.name === 'AND') {
      return args.every(isTruthy);
    }
    if (node.name === 'OR') {
      return args.some(isTruthy);
    }
    if (node.name === 'NOT') {
      return !isTruthy(args[0]);
    }
    if (node.name === 'ABS') {
      return Math.abs(numbers[0] || 0);
    }
    if (node.name === 'ROUND') {
      return Math.round(numbers[0] || 0);
    }
    if (node.name === 'CONCAT') {
      return args.map(toText).join('');
    }

    return '#ERR!';
  }

  function evaluateCellByKey(state, key, trail, cache) {
    if (trail.indexOf(key) !== -1) {
      return '#CIRC!';
    }

    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key];
    }

    const cell = parseCellKey(key);
    const raw = cell ? getCellRaw(state, cell.row, cell.col) : '';
    let value;

    if (raw === '') {
      value = 0;
    } else if (raw[0] === '=') {
      try {
        value = evaluateFormula(state, raw.slice(1), trail.concat(key), cache);
      } catch (_error) {
        value = '#ERR!';
      }
    } else if (isNumeric(raw)) {
      value = Number(raw);
    } else {
      value = raw;
    }

    cache[key] = value;
    return value;
  }

  function toNumber(value) {
    if (value === '#CIRC!' || value === '#ERR!' || value === '#DIV/0!') {
      return value;
    }
    if (Array.isArray(value)) {
      return '#ERR!';
    }
    if (value === '') {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'string' && isNumeric(value)) {
      return Number(value);
    }
    return 0;
  }

  function formatDisplayValue(value) {
    if (value === '#CIRC!' || value === '#ERR!' || value === '#DIV/0!') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return String(Number.isInteger(value) ? value : Number(value.toFixed(6)));
    }
    return String(value);
  }

  function toText(value) {
    if (value === '#CIRC!' || value === '#ERR!' || value === '#DIV/0!') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return formatDisplayValue(value);
    }
    return value == null ? '' : String(value);
  }

  function isTruthy(value) {
    if (value === '#CIRC!' || value === '#ERR!' || value === '#DIV/0!') {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      if (value === 'TRUE') {
        return true;
      }
      if (value === 'FALSE' || value === '') {
        return false;
      }
      return true;
    }
    return Boolean(value);
  }

  function compareValues(left, right) {
    if (typeof left === 'string' || typeof right === 'string') {
      const leftText = toText(left);
      const rightText = toText(right);
      if (leftText === rightText) {
        return 0;
      }
      return leftText < rightText ? -1 : 1;
    }

    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    if (leftNumber === rightNumber) {
      return 0;
    }
    return leftNumber < rightNumber ? -1 : 1;
  }

  function getCellDisplayValue(state, row, col) {
    const raw = getCellRaw(state, row, col);

    if (raw === '') {
      return '';
    }

    if (raw[0] !== '=') {
      return getLiteralValue(raw);
    }

    try {
      return formatDisplayValue(evaluateCellByKey(state, cellKey(row, col), [], {}));
    } catch (_error) {
      return '#ERR!';
    }
  }

  function serializeState(state) {
    return JSON.stringify({
      cells: state.cells,
      active: state.active,
    });
  }

  function deserializeState(serialized) {
    if (!serialized) {
      return createState();
    }

    try {
      return createState(JSON.parse(serialized));
    } catch (_error) {
      return createState();
    }
  }

  function getStorageNamespace(env) {
    if (env && typeof env.__BENCHMARK_STORAGE_NAMESPACE__ === 'string' && env.__BENCHMARK_STORAGE_NAMESPACE__) {
      return env.__BENCHMARK_STORAGE_NAMESPACE__;
    }

    if (env && typeof env.BENCHMARK_STORAGE_NAMESPACE === 'string' && env.BENCHMARK_STORAGE_NAMESPACE) {
      return env.BENCHMARK_STORAGE_NAMESPACE;
    }

    return 'spreadsheet';
  }

  function getStorageKey(namespace) {
    return namespace + ':spreadsheet-state';
  }

  return {
    COL_COUNT,
    ROW_COUNT,
    columnLabel,
    cellKey,
    parseCellKey,
    createState,
    moveSelection,
    setActiveCell,
    setCellRaw,
    getCellRaw,
    getLiteralValue,
    getCellDisplayValue,
    serializeState,
    deserializeState,
    getStorageNamespace,
    getStorageKey,
  };
});
